// Shader patch that applies the precomputed room AO field (roomAo.ts) to a MeshStandardMaterial.
//
// Plugs into three's own `aomap_fragment` slot semantics: occlusion only scales *indirect* light
// (ambient/hemisphere fill + environment map), never direct light from spots/directional lights —
// same as a real aoMap would, so a painting's picture light (baked, ROOM_PICTURE_LIGHT) still lights the wall
// right down to the baseboard while the ambient fill fades into the corner.
//
// Sampled by world position rather than UV so it works on every surface regardless of how its UVs
// are laid out (the floor plane's UVs are tiled for the color texture, walls carry pre-scaled box UVs).

import * as THREE from "three";
import { CEILING_AO, DEFAULT_AO_FIELD_OPTIONS, FURNITURE_CONTACT, FURNITURE_FIELD_RANGE, type AoField } from "./roomAo";
import { EYE_HEIGHT, WALL_THICKNESS } from "./galleryLayout";
import { CEILING_FILL_SCALE } from "./sceneLighting";
import { BASEBOARD_FADE_END, BASEBOARD_FADE_START } from "./baseboard";
import { UNDER_SLAB_REACH, UNDER_SLAB_SHADE } from "./mezzanine";
import { CEILING_LIGHT_FRAGMENT_DECL, CEILING_ONLY_FRAGMENT_DECL, ceilingLightApply, ceilingLightUniforms } from "./ceilingLight";
import { windowLightUniforms } from "./windowLight";
import { sunLightUniforms } from "./sunLight";
import { pictureLightUniforms } from "./pictureLight";
import {
  CEILING_MACRO_VARIATION,
  DEFAULT_MACRO_VARIATION,
  MACRO_VARIATION_ALBEDO,
  MACRO_VARIATION_DECL,
  MACRO_VARIATION_ROUGHNESS,
} from "./macroVariation";
import { NORMAL_SCALE_LINE, SPEC_AA_DECLARE, SPEC_AA_NORMAL_MAP, SPEC_AA_ROUGHNESS } from "./specularAa";

// three's normal_fragment_maps with the specular-AA hook (specularAa.ts) in place of the normalScale line.
export const NORMAL_FRAGMENT_MAPS = THREE.ShaderChunk.normal_fragment_maps.replace(NORMAL_SCALE_LINE, SPEC_AA_NORMAL_MAP);

export type RoomAoSurface = "floor" | "ceiling" | "wall";

const SURFACE_DEFINE: Record<RoomAoSurface, number> = { floor: 0, ceiling: 1, wall: 2 };

// Wall↔floor contact band: tight and fairly strong — this is the "object sits on the ground" cue.
export const WALL_FLOOR_AO = { radius: 0.4, strength: 0.5 };
// Wall↔ceiling band: a thin, faint line (was radius 0.6 / strength 0.4 — the top 0.6 m of every wall went
// visibly grey, and with the ceiling's own band it read as a soot stain, sergi-gercekcilestirme.md Adım 5).
export const WALL_CEILING_AO = { radius: 0.3, strength: 0.25 };

export interface RoomAoUniforms {
  uRoomAoMap: { value: THREE.Texture | null };
  /** minX, minZ, sizeX, sizeZ of the AO field's footprint. */
  uRoomAoBounds: { value: THREE.Vector4 };
  uRoomWallHeight: { value: number };
  /** How far along a wall's normal to sample the field for wall↔wall corner occlusion — the field's radius. */
  uRoomAoReach: { value: number };
}

/**
 * Where a room surface gets its window daylight + sun from: nowhere (a room without windows — no daylight
 * code at all), the baked atlas (daylightBake.ts — floor, ceiling, walls) or the live per-pixel terms
 * (baseboards, which aren't in the atlas).
 */
export type RoomDaylight = { mode: "none" } | { mode: "live" } | { mode: "baked"; uniforms: DaylightBakeUniforms };

const DAYLIGHT_DEFINE = { none: 0, baked: 1, live: 2 } as const;

export interface DaylightBakeUniforms {
  uDaylightMap: { value: THREE.Texture | null };
  /** Floor/ceiling footprint: minX, minZ, sizeX, sizeZ. */
  uDaylightBounds: { value: THREE.Vector4 };
  /** Atlas UV rects (u0, v0, du, dv) of the floor and the ceiling. */
  uDaylightFloorRect: { value: THREE.Vector4 };
  uDaylightCeilingRect: { value: THREE.Vector4 };
}

const DAYLIGHT_VERTEX_DECL = /* glsl */ `
#if ROOM_AO_SURFACE == 2
attribute vec2 daylightUv;
varying vec2 vDaylightUv;
#endif
`;
const DAYLIGHT_VERTEX_BODY = /* glsl */ `
#if ROOM_AO_SURFACE == 2
vDaylightUv = daylightUv;
#endif
`;
const DAYLIGHT_FRAGMENT_DECL = /* glsl */ `
uniform sampler2D uDaylightMap;
uniform vec4 uDaylightBounds;
uniform vec4 uDaylightFloorRect;
uniform vec4 uDaylightCeilingRect;
#if ROOM_AO_SURFACE == 2
varying vec2 vDaylightUv;
#endif
vec3 roomBakedDaylight() {
  #if ROOM_AO_SURFACE == 2
    return texture2D(uDaylightMap, vDaylightUv).rgb;
  #else
    vec2 f = clamp((vRoomAoWorldPos.xz - uDaylightBounds.xy) / uDaylightBounds.zw, 0.0, 1.0);
    #if ROOM_AO_SURFACE == 0
      vec4 r = uDaylightFloorRect;
    #else
      vec4 r = uDaylightCeilingRect;
    #endif
    return texture2D(uDaylightMap, r.xy + f * r.zw).rgb;
  #endif
}
`;

/** The room's baked picture-light wash (pictureLightBake.ts) — walls only. */
export interface PictureLightBakeUniforms {
  uPictureLightMap: { value: THREE.Texture | null };
}

const PICTURE_LIGHT_VERTEX_DECL = /* glsl */ `
attribute vec2 pictureLightUv;
attribute vec4 pictureLightUvClamp;
varying vec2 vPictureLightUv;
varying vec4 vPictureLightUvClamp;
`;
const PICTURE_LIGHT_VERTEX_BODY = /* glsl */ `
vPictureLightUv = pictureLightUv;
vPictureLightUvClamp = pictureLightUvClamp;
`;
const PICTURE_LIGHT_FRAGMENT_DECL = /* glsl */ `
uniform sampler2D uPictureLightMap;
uniform vec3 uPictureLightColor;
varying vec2 vPictureLightUv;
varying vec4 vPictureLightUvClamp;
`;
// The texel holds I·(lamp − p) and I (pictureLightBake.ts): one incident light toward the (intensity-weighted)
// lamp, through three's own BRDF with the normal-mapped normal — what the spotLights used to do, minus the
// per-pixel window evaluation.
const PICTURE_LIGHT_APPLY = /* glsl */ `
{
  vec4 pictureBaked = texture2D(uPictureLightMap, clamp(vPictureLightUv, vPictureLightUvClamp.xy, vPictureLightUvClamp.zw));
  if (pictureBaked.a > 1e-4) {
    IncidentLight pictureIncident;
    pictureIncident.direction = normalize((viewMatrix * vec4(pictureBaked.rgb / pictureBaked.a, 0.0)).xyz);
    pictureIncident.color = uPictureLightColor * pictureBaked.a;
    pictureIncident.visible = true;
    RE_Direct(pictureIncident, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight);
  }
}
`;

const VERTEX_DECL = /* glsl */ `
varying vec3 vRoomAoWorldPos;
varying vec3 vRoomAoWorldNormal;
#ifdef ROOM_BASEBOARD
attribute vec3 baseboardOutward;
varying vec3 vBaseboardOutward;
#endif
`;

const VERTEX_BODY = /* glsl */ `
vRoomAoWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
vRoomAoWorldNormal = normalize(mat3(modelMatrix) * objectNormal);
#ifdef ROOM_BASEBOARD
vBaseboardOutward = normalize(mat3(modelMatrix) * baseboardOutward);
#endif
`;

// Skirting boards only (baseboard.ts BASEBOARD_FADE_*): once a pixel covers a sizeable share of the board's
// up-facing strip (chamfer + top, ~1.5 cm), its normal eases to the side's front normal, so the bright line
// fades out instead of crawling at sub-pixel width. Footprint = world size of a pixel on the surface itself,
// so a grazing view of the top (long footprint in depth) fades sooner, as it should. Runs after the normal map
// step, before any lighting reads `normal`; on the front face it's a no-op (normal = outward).
const BASEBOARD_NORMAL_FADE = /* glsl */ `
#ifdef ROOM_BASEBOARD
{
  float footprint = max(length(dFdx(vRoomAoWorldPos)), length(dFdy(vRoomAoWorldPos)));
  float fade = smoothstep(${BASEBOARD_FADE_START.toFixed(5)}, ${BASEBOARD_FADE_END.toFixed(5)}, footprint);
  vec3 frontN = normalize((viewMatrix * vec4(vBaseboardOutward, 0.0)).xyz);
  normal = normalize(mix(normal, frontN, fade));
}
#endif
`;

const FRAGMENT_DECL = /* glsl */ `
varying vec3 vRoomAoWorldPos;
varying vec3 vRoomAoWorldNormal;
#ifdef ROOM_BASEBOARD
varying vec3 vBaseboardOutward;
#endif
uniform sampler2D uRoomAoMap;
uniform vec4 uRoomAoBounds;
uniform float uRoomWallHeight;
uniform float uRoomAoReach;

// .r = wall occlusion, .g = encoded signed distance to the nearest furniture footprint (see roomAo.ts).
vec2 roomAoField(vec2 xz) {
  return texture2D(uRoomAoMap, (xz - uRoomAoBounds.xy) / uRoomAoBounds.zw).rg;
}

// Box-projected ("parallax-corrected") environment lookup. RoomEnvironment.tsx renders the env cubemap
// from the room center at eye height, and a plain cubemap lookup treats it as infinitely far away — so
// a ceiling fixture's reflection in a glossy floor stays glued to the viewer and slides along as they
// walk. Intersecting the reflection ray with the room's actual inner box and looking up the direction
// from the probe to that hit point pins reflections to where the fixtures really are. Same box as
// RoomEnvironment.tsx's (inner wall faces, floor to ceiling); for a non-rectangular custom room it's the
// bounding box, still far closer than "infinitely far". A few ALU ops per fragment, no texture fetches.
vec3 roomBoxProject(vec3 dir, vec3 worldPos) {
  vec3 boxMin = vec3(uRoomAoBounds.x + ${(WALL_THICKNESS / 2).toFixed(3)}, 0.0, uRoomAoBounds.y + ${(WALL_THICKNESS / 2).toFixed(3)});
  vec3 boxMax = vec3(
    uRoomAoBounds.x + uRoomAoBounds.z - ${(WALL_THICKNESS / 2).toFixed(3)},
    uRoomWallHeight,
    uRoomAoBounds.y + uRoomAoBounds.w - ${(WALL_THICKNESS / 2).toFixed(3)}
  );
  vec3 probe = vec3((boxMin.x + boxMax.x) * 0.5, ${EYE_HEIGHT.toFixed(3)}, (boxMin.z + boxMax.z) * 0.5);
  // Axis-parallel rays would divide by zero; a tiny stand-in just pushes that axis's hit to "very far".
  vec3 safeDir = mix(dir, vec3(1e-4), vec3(lessThan(abs(dir), vec3(1e-4))));
  vec3 tFar = max((boxMax - worldPos) / safeDir, (boxMin - worldPos) / safeDir);
  float t = max(min(min(tFar.x, tFar.y), tFar.z), 0.0);
  return normalize(worldPos + dir * t - probe);
}

// Same curve as roomAo.ts's occlusionAtDistance() (GLSL smoothstep == t*t*(3-2t)).
float roomAoBand(float d, float radius, float strength) {
  return 1.0 - strength * (1.0 - smoothstep(0.0, radius, d));
}

// Two-layer furniture contact shadow from the G channel's signed distance — mirrors roomAo.ts's
// decodeFurnitureDistance() + furnitureContact(). Narrow dark core × wide soft pool.
float roomFurnitureContact(float g) {
  float d = g * ${(FURNITURE_FIELD_RANGE.inside + FURNITURE_FIELD_RANGE.outside).toFixed(3)} - ${FURNITURE_FIELD_RANGE.inside.toFixed(3)};
  return (1.0 - ${FURNITURE_CONTACT.core.strength.toFixed(3)} * (1.0 - smoothstep(${FURNITURE_CONTACT.core.inner.toFixed(3)}, ${FURNITURE_CONTACT.core.outer.toFixed(3)}, d)))
    * (1.0 - ${FURNITURE_CONTACT.soft.strength.toFixed(3)} * (1.0 - smoothstep(${FURNITURE_CONTACT.soft.inner.toFixed(3)}, ${FURNITURE_CONTACT.soft.outer.toFixed(3)}, d)));
}

// Scales the ceiling-fixture light (direct, so the AO below doesn't reach it): on the floor, furniture
// blocks the overhead fixtures from the spot right under it (roomAo.ts FURNITURE_CONTACT.ceilingLightShare).
float roomCeilingLightOcclusion() {
  #if ROOM_AO_SURFACE == 0
    return mix(1.0, roomFurnitureContact(roomAoField(vRoomAoWorldPos.xz).g), ${FURNITURE_CONTACT.ceilingLightShare.toFixed(3)});
  #else
    return 1.0;
  #endif
}

// Ceiling: walls only — furniture sits far below it. The wall channel is remapped to a much narrower, weaker
// band than the floor's (mirrors roomAo.ts's ceilingOcclusion()). Its fill is then scaled down
// (CEILING_FILL_SCALE, sceneLighting.ts); the same band also shapes its bounce light (FRAGMENT_APPLY).
float roomCeilingWallAo() {
  float wallProximity = clamp(
    (1.0 - roomAoField(vRoomAoWorldPos.xz).r) / ${DEFAULT_AO_FIELD_OPTIONS.wall.strength.toFixed(3)}, 0.0, 1.0);
  return 1.0 - ${CEILING_AO.strength.toFixed(3)} * pow(wallProximity, ${CEILING_AO.sharpness.toFixed(1)});
}

float roomAmbientOcclusion() {
  #if ROOM_AO_SURFACE == 2
    // Walls: sampling the field one falloff-radius out along the wall's own normal puts the sample
    // exactly at the edge of this wall's own influence (→ 1), so only a *perpendicular* wall nearby
    // (an inside corner) darkens it. Times vertical bands toward floor and ceiling.
    vec3 n = normalize(vRoomAoWorldNormal);
    float corner = roomAoField(vRoomAoWorldPos.xz + n.xz * uRoomAoReach).r;
    float y = vRoomAoWorldPos.y;
    return corner
      * roomAoBand(y, ${WALL_FLOOR_AO.radius.toFixed(3)}, ${WALL_FLOOR_AO.strength.toFixed(3)})
      * roomAoBand(uRoomWallHeight - y, ${WALL_CEILING_AO.radius.toFixed(3)}, ${WALL_CEILING_AO.strength.toFixed(3)});
  #elif ROOM_AO_SURFACE == 0
    // Floor: walls and furniture contact shadows.
    vec2 ao = roomAoField(vRoomAoWorldPos.xz);
    return ao.r * roomFurnitureContact(ao.g);
  #else
    // Ceiling: handled in FRAGMENT_APPLY (roomCeilingWallAo × CEILING_FILL_SCALE, shared with its bounce).
    return 1.0;
  #endif
}
`;

// Mezzanine (mezzanine.ts), after the ceiling-light declarations (it reads their uSlabRect/uSlabY): the fill
// under the slab is dimmed (it's a low, covered space — mirrors underSlabShade()), and on walls the slab's top
// gets the same floor contact band as the room floor. 1 everywhere in a room without one.
const SLAB_AO_DECL = /* glsl */ `
float roomSlabOcclusion() {
  if (uSlabY.z < 0.5) return 1.0;
  vec3 p = vRoomAoWorldPos;
  float outside = max(max(uSlabRect.x - p.x, p.x - uSlabRect.z), max(uSlabRect.y - p.z, p.z - uSlabRect.w));
  float shade = 1.0;
  if (p.y < uSlabY.x - 0.01)
    shade = 1.0 - ${UNDER_SLAB_SHADE.toFixed(3)} * (1.0 - smoothstep(${(-UNDER_SLAB_REACH).toFixed(3)}, 0.3, outside));
  #if ROOM_AO_SURFACE == 2
    if (p.y > uSlabY.y - 0.01 && outside < 0.2)
      shade *= roomAoBand(p.y - uSlabY.y, ${WALL_FLOOR_AO.radius.toFixed(3)}, ${WALL_FLOOR_AO.strength.toFixed(3)});
  #endif
  return shade;
}
`;

// Mirrors three r185's aomap_fragment.glsl.js body (minus the texture read), so indirect specular
// from the environment map gets the same roughness-aware specular occlusion a real aoMap would.
//
// Ceiling only: also adds the fixtures' first bounce off floor + walls (ceilingBounce.ts, one uniform). Done
// here — after lights_fragment_end, before three sums directDiffuse — so the wall band (one AO texture read)
// and the slab dimming are computed once and shared with the fill. Added to directDiffuse, not the indirect
// fill, so CEILING_FILL_SCALE doesn't cut it again.
const FRAGMENT_APPLY = /* glsl */ `
{
  float roomSlab = roomSlabOcclusion();
  #if ROOM_AO_SURFACE == 1
    float roomCeilingAo = roomCeilingWallAo() * roomSlab;
    float ambientOcclusion = roomCeilingAo * ${CEILING_FILL_SCALE.toFixed(3)};
    reflectedLight.directDiffuse += uCeilingBounce * uCeilingLightColor * BRDF_Lambert(material.diffuseColor) * roomCeilingAo;
  #else
    float ambientOcclusion = roomAmbientOcclusion() * roomSlab;
  #endif
  reflectedLight.indirectDiffuse *= ambientOcclusion;
  #if defined( USE_CLEARCOAT )
    clearcoatSpecularIndirect *= ambientOcclusion;
  #endif
  #if defined( USE_SHEEN )
    sheenSpecularIndirect *= ambientOcclusion;
  #endif
  #if defined( USE_ENVMAP ) && defined( STANDARD )
    float roomAoDotNV = saturate( dot( geometryNormal, geometryViewDir ) );
    reflectedLight.indirectSpecular *= computeSpecularOcclusion( roomAoDotNV, ambientOcclusion, material.roughness );
  #endif
}
`;

// three's own IBL radiance function with the box projection spliced in right after the reflection vector
// is brought into world space (getIBLAnisotropyRadiance calls getIBLRadiance, so it's covered too).
export const ENVMAP_PHYSICAL_PARS = THREE.ShaderChunk.envmap_physical_pars_fragment.replace(
  "reflectVec = transformDirectionByInverseViewMatrix( reflectVec, viewMatrix );",
  "reflectVec = transformDirectionByInverseViewMatrix( reflectVec, viewMatrix );\n\t\t\treflectVec = roomBoxProject( reflectVec, vRoomAoWorldPos );"
);

function roomAoOnBeforeCompile(this: THREE.Material, shader: THREE.WebGLProgramParametersWithUniforms) {
  const data = this.userData as {
    roomAoUniforms: RoomAoUniforms;
    macroVariation: { value: number };
    daylight: RoomDaylight;
    pictureLight?: PictureLightBakeUniforms;
  };
  const daylight = data.daylight;
  const picture = data.pictureLight;
  if (picture) Object.assign(shader.uniforms, picture, pictureLightUniforms);
  Object.assign(shader.uniforms, data.roomAoUniforms, ceilingLightUniforms, { uMacroVariation: data.macroVariation });
  if (daylight.mode === "live") Object.assign(shader.uniforms, windowLightUniforms, sunLightUniforms);
  if (daylight.mode === "baked") Object.assign(shader.uniforms, daylight.uniforms);
  const lightDecl =
    daylight.mode === "live" ? CEILING_LIGHT_FRAGMENT_DECL : daylight.mode === "baked" ? `${CEILING_ONLY_FRAGMENT_DECL}\n${DAYLIGHT_FRAGMENT_DECL}` : CEILING_ONLY_FRAGMENT_DECL;
  const daylightTerm = daylight.mode === "live" ? undefined : daylight.mode === "baked" ? "roomBakedDaylight()" : "vec3(0.0)";
  const baked = daylight.mode === "baked";
  shader.vertexShader = shader.vertexShader
    .replace(
      "#include <common>",
      `#include <common>\n${VERTEX_DECL}${baked ? DAYLIGHT_VERTEX_DECL : ""}${picture ? PICTURE_LIGHT_VERTEX_DECL : ""}`
    )
    .replace(
      "#include <project_vertex>",
      `#include <project_vertex>\n${VERTEX_BODY}${baked ? DAYLIGHT_VERTEX_BODY : ""}${picture ? PICTURE_LIGHT_VERTEX_BODY : ""}`
    );
  shader.fragmentShader = shader.fragmentShader
    .replace(
      "#include <common>",
      `#include <common>\n${FRAGMENT_DECL}\n${lightDecl}\n${SLAB_AO_DECL}\n${MACRO_VARIATION_DECL}\n${picture ? PICTURE_LIGHT_FRAGMENT_DECL : ""}`
    )
    // Low-frequency tone/gloss variation that breaks the scan's tiling lattice (macroVariation.ts).
    .replace("#include <map_fragment>", `#include <map_fragment>\n${MACRO_VARIATION_ALBEDO}`)
    .replace("#include <roughnessmap_fragment>", `#include <roughnessmap_fragment>\n${MACRO_VARIATION_ROUGHNESS}`)
    .replace("#include <envmap_physical_pars_fragment>", ENVMAP_PHYSICAL_PARS)
    // Specular AA (specularAa.ts): normal detail a pixel can't resolve becomes roughness, so glossy floors
    // don't sparkle in the distance.
    .replace("#include <normal_fragment_begin>", `${SPEC_AA_DECLARE}\n#include <normal_fragment_begin>`)
    .replace("#include <normal_fragment_maps>", `${NORMAL_FRAGMENT_MAPS}\n${BASEBOARD_NORMAL_FADE}`)
    .replace("#include <lights_physical_fragment>", `#include <lights_physical_fragment>\n${SPEC_AA_ROUGHNESS}`)
    // Directional light from the ceiling fixtures (ceilingLight.ts) — direct light, so the AO below
    // doesn't touch it; only furniture contact shadows on the floor scale it.
    .replace(
      "#include <lights_fragment_end>",
      `#include <lights_fragment_end>\n${ceilingLightApply("vRoomAoWorldPos", "roomCeilingLightOcclusion()", daylightTerm)}\n${picture ? PICTURE_LIGHT_APPLY : ""}`
    )
    .replace("#include <aomap_fragment>", `#include <aomap_fragment>\n${FRAGMENT_APPLY}`);
}

/**
 * Patches `material` in place to receive room AO. Must be called before the material's first render.
 * Surfaces differ only by a `#define`, which three folds into the program cache key, so floor/ceiling/wall
 * each compile one program and every material of the same surface kind shares it.
 * `macroVariation` is the ± albedo amplitude of the anti-tiling variation (a uniform, never a recompile).
 * `daylight` picks the daylight source (RoomDaylight) — a define too, so each mode is its own program.
 */
export function applyRoomAo(
  material: THREE.MeshStandardMaterial,
  surface: RoomAoSurface,
  uniforms: RoomAoUniforms,
  macroVariation: number = surface === "ceiling" ? CEILING_MACRO_VARIATION : DEFAULT_MACRO_VARIATION,
  daylight: RoomDaylight = { mode: "live" },
  options: { baseboard?: boolean; pictureLight?: PictureLightBakeUniforms | null } = {}
): void {
  material.defines = {
    ...(material.defines ?? {}),
    ROOM_AO_SURFACE: SURFACE_DEFINE[surface],
    ROOM_DAYLIGHT: DAYLIGHT_DEFINE[daylight.mode],
    // Skirting boards (baseboard.ts): distance fade of the up-facing faces — its own program.
    ...(options.baseboard ? { ROOM_BASEBOARD: 1 } : {}),
    // Walls with a baked picture-light wash (pictureLightBake.ts) — its own program.
    ...(options.pictureLight ? { ROOM_PICTURE_LIGHT: 1 } : {}),
  };
  material.userData.pictureLight = options.pictureLight ?? undefined;
  material.userData.roomAoUniforms = uniforms;
  material.userData.daylight = daylight;
  material.userData.macroVariation = { value: macroVariation };
  material.onBeforeCompile = roomAoOnBeforeCompile;
  material.needsUpdate = true;
}

/** Uploads a roomAo.ts field as the GPU texture + uniform set `applyRoomAo` reads. Caller owns disposal of `uRoomAoMap`. */
export function createRoomAoUniforms(field: AoField, wallHeight: number, reach: number): RoomAoUniforms {
  const texture = new THREE.DataTexture(field.data, field.width, field.height, THREE.RGFormat, THREE.UnsignedByteType);
  // Row length is `width * 2` bytes, not necessarily a multiple of 4.
  texture.unpackAlignment = 1;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  // Occlusion is a linear multiplier, not a color — must not be sRGB-decoded.
  texture.colorSpace = THREE.NoColorSpace;
  texture.needsUpdate = true;
  return {
    uRoomAoMap: { value: texture },
    uRoomAoBounds: { value: new THREE.Vector4(field.minX, field.minZ, field.sizeX, field.sizeZ) },
    uRoomWallHeight: { value: wallHeight },
    uRoomAoReach: { value: reach },
  };
}
