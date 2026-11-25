// Ceiling-fixture light on the room's own surfaces (floor, ceiling, walls), baked once per room (2026-11-25).
//
// The fixtures don't move, yet every pixel of the floor, the walls and the ceiling — most of the screen —
// looped over every fixture (up to MAX_CEILING_LIGHTS) every frame. Now DaylightBaker.tsx rasterises the
// fixtures' light into an atlas with the same layout as the daylight bake (daylightBake.ts — floor/ceiling
// looked up from world x/z, walls through a `ceilingLightUv` attribute), only coarser: the light is smooth
// (wide 1/d² pools, the halo right at a fixture sits under its own disc).
//
// Each texel stores one vector, S = Σ wᵢ·Lᵢ (ceilingLight.ts CEILING_LIGHT_VECTOR_GLSL), not an irradiance:
// the surface takes max(n·S, 0) with its *normal-mapped* normal, so it's exact on flat ground and the plaster
// / brick / parquet relief still catches the fixtures — the same scheme as the picture-light wash
// (pictureLightBake.ts). The lamps' colour stays a live uniform (no re-bake for a theme colour); positions and
// powers re-bake through the daylight revision (setCeilingLights/setCeilingSlab bump it).
//
// Still live (small screen area): furniture, labels, baseboards and the mezzanine slab.

import * as THREE from "three";
import type { WallSegment } from "./galleryLayout";
import { isTouchPrimaryDevice } from "../../lib/navigationMode";
import { buildDaylightAtlas, createDaylightTarget, rectUv, type DaylightAtlas } from "./daylightBake";
import { CEILING_LIGHT_VECTOR_GLSL, CEILING_ONLY_FRAGMENT_DECL, ceilingLightUniforms } from "./ceilingLight";
import type { AtlasBakeShader } from "./DaylightBaker";

/** Texel size (m) on floor, walls and ceiling. */
export const CEILING_LIGHT_TEXEL = isTouchPrimaryDevice() ? 0.08 : 0.05;

/** Wall geometries' attribute into the atlas (addDaylightUv with this name). */
export const CEILING_LIGHT_UV = "ceilingLightUv";

export interface CeilingLightBakeUniforms {
  uCeilingLightMap: { value: THREE.Texture | null };
  /** Floor/ceiling footprint: minX, minZ, sizeX, sizeZ. */
  uCeilingLightBounds: { value: THREE.Vector4 };
  /** Atlas UV rects (u0, v0, du, dv) of the floor and the ceiling. */
  uCeilingLightFloorRect: { value: THREE.Vector4 };
  uCeilingLightCeilingRect: { value: THREE.Vector4 };
}

export interface CeilingLightBake {
  atlas: DaylightAtlas;
  target: THREE.WebGLRenderTarget;
  uniforms: CeilingLightBakeUniforms;
}

/** Atlas + target + uniforms for a room. `walls` must be the pieces actually rendered. Caller disposes `target`. */
export function createCeilingLightBake(
  walls: WallSegment[],
  room: { center: [number, number]; size: [number, number] },
  wallHeight: number
): CeilingLightBake {
  const atlas = buildDaylightAtlas(walls, room, wallHeight, undefined, { surface: CEILING_LIGHT_TEXEL, ceiling: CEILING_LIGHT_TEXEL });
  const target = createDaylightTarget(atlas);
  return {
    atlas,
    target,
    uniforms: {
      uCeilingLightMap: { value: target.texture },
      uCeilingLightBounds: { value: new THREE.Vector4(...atlas.bounds) },
      uCeilingLightFloorRect: { value: new THREE.Vector4(...rectUv(atlas, atlas.floor)) },
      uCeilingLightCeilingRect: { value: new THREE.Vector4(...rectUv(atlas, atlas.ceiling)) },
    },
  };
}

/** What DaylightBaker writes per texel for this bake. */
export const CEILING_LIGHT_BAKE: AtlasBakeShader = {
  fragmentShader: /* glsl */ `
${CEILING_ONLY_FRAGMENT_DECL}
${CEILING_LIGHT_VECTOR_GLSL}
varying vec3 vBakeWorld;
varying vec3 vBakeNormal;
void main() {
  gl_FragColor = vec4(ceilingLightVector(vBakeWorld, normalize(vBakeNormal)), 1.0);
}
`,
  uniforms: ceilingLightUniforms as unknown as Record<string, THREE.IUniform>,
};

// --- Room-surface lookup (roomAoMaterial.ts, ROOM_CEILING_BAKED) --------------------------------------------

export const CEILING_BAKE_VERTEX_DECL = /* glsl */ `
#if ROOM_AO_SURFACE == 2
attribute vec2 ${CEILING_LIGHT_UV};
varying vec2 vCeilingLightUv;
#endif
`;
export const CEILING_BAKE_VERTEX_BODY = /* glsl */ `
#if ROOM_AO_SURFACE == 2
vCeilingLightUv = ${CEILING_LIGHT_UV};
#endif
`;
/** Needs CEILING_ONLY_FRAGMENT_DECL (uCeilingLightColor) and vRoomAoWorldPos before it. */
export const CEILING_BAKE_FRAGMENT_DECL = /* glsl */ `
uniform sampler2D uCeilingLightMap;
uniform vec4 uCeilingLightBounds;
uniform vec4 uCeilingLightFloorRect;
uniform vec4 uCeilingLightCeilingRect;
#if ROOM_AO_SURFACE == 2
varying vec2 vCeilingLightUv;
#endif
vec3 roomBakedCeilingLight(vec3 n) {
  #if ROOM_AO_SURFACE == 2
    vec3 s = texture2D(uCeilingLightMap, vCeilingLightUv).rgb;
  #else
    vec2 f = clamp((vRoomAoWorldPos.xz - uCeilingLightBounds.xy) / uCeilingLightBounds.zw, 0.0, 1.0);
    #if ROOM_AO_SURFACE == 0
      vec4 r = uCeilingLightFloorRect;
    #else
      vec4 r = uCeilingLightCeilingRect;
    #endif
    vec3 s = texture2D(uCeilingLightMap, r.xy + f * r.zw).rgb;
  #endif
  return max(dot(n, s), 0.0) * uCeilingLightColor;
}
`;
