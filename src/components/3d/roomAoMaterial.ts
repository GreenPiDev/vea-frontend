// Shader patch that applies the precomputed room AO field (roomAo.ts) to a MeshStandardMaterial.
//
// Plugs into three's own `aomap_fragment` slot semantics: occlusion only scales *indirect* light
// (ambient/hemisphere fill + environment map), never direct light from spots/directional lights —
// same as a real aoMap would, so a painting's picture light still lights the wall right down to the
// baseboard while the ambient fill fades into the corner.
//
// Sampled by world position rather than UV so it works on every surface regardless of how its UVs
// are laid out (the floor plane's UVs are tiled for the color texture, walls carry pre-scaled box UVs).

import * as THREE from "three";
import type { AoField } from "./roomAo";
import { EYE_HEIGHT, WALL_THICKNESS } from "./galleryLayout";

export type RoomAoSurface = "floor" | "ceiling" | "wall";

const SURFACE_DEFINE: Record<RoomAoSurface, number> = { floor: 0, ceiling: 1, wall: 2 };

// Wall↔floor contact band: tight and fairly strong — this is the "object sits on the ground" cue.
export const WALL_FLOOR_AO = { radius: 0.4, strength: 0.5 };
// Wall↔ceiling band: wider and softer, ceilings collect less bounce light toward the edges.
export const WALL_CEILING_AO = { radius: 0.6, strength: 0.4 };

export interface RoomAoUniforms {
  uRoomAoMap: { value: THREE.Texture | null };
  /** minX, minZ, sizeX, sizeZ of the AO field's footprint. */
  uRoomAoBounds: { value: THREE.Vector4 };
  uRoomWallHeight: { value: number };
  /** How far along a wall's normal to sample the field for wall↔wall corner occlusion — the field's radius. */
  uRoomAoReach: { value: number };
}

const VERTEX_DECL = /* glsl */ `
varying vec3 vRoomAoWorldPos;
varying vec3 vRoomAoWorldNormal;
`;

const VERTEX_BODY = /* glsl */ `
vRoomAoWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
vRoomAoWorldNormal = normalize(mat3(modelMatrix) * objectNormal);
`;

const FRAGMENT_DECL = /* glsl */ `
varying vec3 vRoomAoWorldPos;
varying vec3 vRoomAoWorldNormal;
uniform sampler2D uRoomAoMap;
uniform vec4 uRoomAoBounds;
uniform float uRoomWallHeight;
uniform float uRoomAoReach;

// .r = wall occlusion, .g = furniture occlusion (see roomAo.ts).
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
    return ao.r * ao.g;
  #else
    // Ceiling: walls only — furniture sits far below it.
    return roomAoField(vRoomAoWorldPos.xz).r;
  #endif
}
`;

// Mirrors three r185's aomap_fragment.glsl.js body (minus the texture read), so indirect specular
// from the environment map gets the same roughness-aware specular occlusion a real aoMap would.
const FRAGMENT_APPLY = /* glsl */ `
{
  float ambientOcclusion = roomAmbientOcclusion();
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
  Object.assign(shader.uniforms, (this.userData as { roomAoUniforms: RoomAoUniforms }).roomAoUniforms);
  shader.vertexShader = shader.vertexShader
    .replace("#include <common>", `#include <common>\n${VERTEX_DECL}`)
    .replace("#include <project_vertex>", `#include <project_vertex>\n${VERTEX_BODY}`);
  shader.fragmentShader = shader.fragmentShader
    .replace("#include <common>", `#include <common>\n${FRAGMENT_DECL}`)
    .replace("#include <envmap_physical_pars_fragment>", ENVMAP_PHYSICAL_PARS)
    .replace("#include <aomap_fragment>", `#include <aomap_fragment>\n${FRAGMENT_APPLY}`);
}

/**
 * Patches `material` in place to receive room AO. Must be called before the material's first render.
 * Surfaces differ only by a `#define`, which three folds into the program cache key, so floor/ceiling/wall
 * each compile one program and every material of the same surface kind shares it.
 */
export function applyRoomAo(
  material: THREE.MeshStandardMaterial,
  surface: RoomAoSurface,
  uniforms: RoomAoUniforms
): void {
  material.defines = { ...(material.defines ?? {}), ROOM_AO_SURFACE: SURFACE_DEFINE[surface] };
  material.userData.roomAoUniforms = uniforms;
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
