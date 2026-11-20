// Sun patches through the windows (daylight step 2) — sharp pools of sunlight on the floor, walls and
// furniture with the glazing bars' shadows in them, from the sun in the room's panorama.
//
// Per fragment: follow the ray from the surface point toward the sun; if it meets a window's glass plane
// inside the opening, look up how much light that spot of the opening lets through (a transmission mask
// rasterised from the real joinery layout, windowGeometry.ts → windowTransmissionMask) and add the sun's
// irradiance × N·L. The masks of all windows live in one small mipmapped atlas (4 × 2 tiles of 256²), and
// the mip level is chosen from the distance to the glass: the sun is a 0.53° disc, so a bar's shadow blurs
// by ~1 cm per metre — crisp next to the window, soft across the room, at the cost of one texture fetch.
//
// No shadow map, no extra pass; fixed uniform arrays, so switching rooms never recompiles. The sun direction
// comes from the panorama (outdoorPanoramaLight.ts, generated) turned by the room's rotation, so the patches
// always match the sun seen through the window; an overcast panorama has no sun and no patches.
// Furniture and paintings cast sun shadows through sunOccluders.ts (simple volumes, same ray). Known
// limitation: walls/partitions inside the room still don't block the sun.

import * as THREE from "three";
import { SUN_IRRADIANCE } from "./sceneLighting";
import { PANORAMA_LIGHT } from "./outdoorPanoramaLight";
import { GLASS_ABSORPTION, buildWindowParts, windowTransmissionMask } from "./windowGeometry";
import { isTouchPrimaryDevice } from "../../lib/navigationMode";
import { panoramaToWorld } from "./windowLight";
import type { WindowOpening } from "./windowOpenings";
import { SUN_OCCLUDER_FRAGMENT_DECL, setSunReachTest, sunOccluderUniforms, type SunOccluderUniforms } from "./sunOccluders";
import { bumpDaylightRevision } from "./daylightBake";

/** Windows the sun can shine through at once — one mask tile each in the 4 × 2 atlas. */
export const MAX_SUN_WINDOWS = isTouchPrimaryDevice() ? 4 : 8;
export const SUN_MASK_TILE = 256;
const ATLAS_COLS = 4;
const ATLAS_ROWS = 2;
/** The sun's angular diameter (radians) — sets how fast a bar's shadow blurs with distance. */
export const SUN_ANGULAR_DIAMETER = 0.0093;
/** Coarsest mip used: 8 texels per tile, so neighbouring tiles never bleed into each other. */
const MAX_SUN_MASK_LOD = 5;

export interface SunWindow {
  /** World position of the opening's local (−x, −y) corner on the glass plane. */
  origin: THREE.Vector3;
  /** World direction of the opening's local +x (the mask's u axis). */
  uAxis: THREE.Vector3;
  width: number;
  height: number;
  /** Unit normal into the room. */
  normal: THREE.Vector3;
  /** SUN_MASK_TILE² transmission mask, row 0 = bottom. */
  mask: Float32Array;
}

export interface SunSetup {
  /** Unit vector toward the sun (world), or null for an overcast sky. */
  direction: THREE.Vector3 | null;
  /** Linear RGB irradiance at normal incidence, after the glass. */
  color: [number, number, number];
  windows: SunWindow[];
}

/** Sun colour by elevation: warm near the horizon, near-white high up (linear RGB, max component 1). */
export function sunTint(elevation: number): [number, number, number] {
  const t = THREE.MathUtils.smoothstep(elevation, THREE.MathUtils.degToRad(5), THREE.MathUtils.degToRad(50));
  return [1, 0.8 + 0.16 * t, 0.6 + 0.3 * t];
}

export function sunSetupFor(openings: WindowOpening[], panoramaId: string, rotationY: number): SunSetup {
  const sun = PANORAMA_LIGHT[panoramaId]?.sun;
  if (!sun) return { direction: null, color: [0, 0, 0], windows: [] };
  const direction = panoramaToWorld(sun.phi, sun.elevation, rotationY);
  const tint = sunTint(sun.elevation);
  const color = tint.map((c, i) => c * SUN_IRRADIANCE * (1 - GLASS_ABSORPTION[i])) as [number, number, number];
  const windows = openings.slice(0, MAX_SUN_WINDOWS).map((o): SunWindow => {
    const parts = buildWindowParts(o);
    parts.joinery.dispose();
    parts.hardware?.dispose();
    const origin = parts.origin
      .clone()
      .addScaledVector(parts.xAxis, -o.width / 2)
      .add(new THREE.Vector3(0, -o.height / 2, 0));
    return {
      origin,
      uAxis: parts.xAxis.clone(),
      width: o.width,
      height: o.height,
      normal: new THREE.Vector3(o.inward[0], 0, o.inward[1]),
      mask: windowTransmissionMask(o, parts, SUN_MASK_TILE),
    };
  });
  return { direction, color, windows };
}

/**
 * CPU mirror of the shader term (nearest mask texel, no blur): share of direct sun reaching point `p`
 * (0..1, before N·L). For tests and tuning.
 */
export function sunVisibility(p: THREE.Vector3, setup: SunSetup): number {
  const s = setup.direction;
  if (!s) return 0;
  let lit = 0;
  for (const w of setup.windows) {
    const sd = s.dot(w.normal);
    if (sd >= -1e-4) continue;
    const dist = p.clone().sub(w.origin).dot(w.normal);
    if (dist <= 0) continue;
    const hit = p.clone().addScaledVector(s, dist / -sd).sub(w.origin);
    const u = hit.dot(w.uAxis) / w.width;
    const v = hit.y / w.height;
    if (u < 0 || u > 1 || v < 0 || v > 1) continue;
    const i = Math.min(Math.floor(u * SUN_MASK_TILE), SUN_MASK_TILE - 1);
    const j = Math.min(Math.floor(v * SUN_MASK_TILE), SUN_MASK_TILE - 1);
    lit += w.mask[j * SUN_MASK_TILE + i];
  }
  return Math.min(lit, 1);
}

// --- GPU side ------------------------------------------------------------------------------------------

function createMaskAtlas(): THREE.DataTexture {
  const tex = new THREE.DataTexture(
    new Uint8Array(SUN_MASK_TILE * ATLAS_COLS * SUN_MASK_TILE * ATLAS_ROWS),
    SUN_MASK_TILE * ATLAS_COLS,
    SUN_MASK_TILE * ATLAS_ROWS,
    THREE.RedFormat,
    THREE.UnsignedByteType
  );
  tex.unpackAlignment = 1;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export interface SunLightUniforms {
  /** Per window, 3 × vec4: (origin, width), (uAxis, height), (normal, tile index). */
  uSunWindows: { value: THREE.Vector4[] };
  uSunWindowCount: { value: number };
  /** Toward the sun. */
  uSunDir: { value: THREE.Vector3 };
  uSunColor: { value: THREE.Color };
  uSunMask: { value: THREE.DataTexture };
}

/** Shared like ceilingLightUniforms (furniture materials are cached across rooms). */
export const sunLightUniforms: SunLightUniforms & SunOccluderUniforms = {
  ...sunOccluderUniforms,
  uSunWindows: { value: Array.from({ length: MAX_SUN_WINDOWS * 3 }, () => new THREE.Vector4()) },
  uSunWindowCount: { value: 0 },
  uSunDir: { value: new THREE.Vector3(0, 1, 0) },
  uSunColor: { value: new THREE.Color(0, 0, 0) },
  uSunMask: { value: createMaskAtlas() },
};

/** Writes a room's sun into the shared uniforms and re-uploads the mask atlas; an overcast/windowless room switches it off. */
export function setSunLight(setup: SunSetup): void {
  bumpDaylightRevision(); // re-bake the room surfaces (daylightBake.ts)
  const u = sunLightUniforms;
  const n = setup.direction ? Math.min(setup.windows.length, MAX_SUN_WINDOWS) : 0;
  const atlas = u.uSunMask.value;
  const data = atlas.image.data as Uint8Array;
  const stride = SUN_MASK_TILE * ATLAS_COLS;
  if (n > 0) data.fill(0);
  for (let i = 0; i < n; i++) {
    const w = setup.windows[i];
    u.uSunWindows.value[i * 3].set(w.origin.x, w.origin.y, w.origin.z, w.width);
    u.uSunWindows.value[i * 3 + 1].set(w.uAxis.x, w.uAxis.y, w.uAxis.z, w.height);
    u.uSunWindows.value[i * 3 + 2].set(w.normal.x, w.normal.y, w.normal.z, i);
    const tx = (i % ATLAS_COLS) * SUN_MASK_TILE;
    const ty = Math.floor(i / ATLAS_COLS) * SUN_MASK_TILE;
    for (let y = 0; y < SUN_MASK_TILE; y++) {
      for (let x = 0; x < SUN_MASK_TILE; x++) {
        data[(ty + y) * stride + tx + x] = Math.round(w.mask[y * SUN_MASK_TILE + x] * 255);
      }
    }
  }
  if (n > 0) atlas.needsUpdate = true;
  u.uSunWindowCount.value = n;
  if (setup.direction) u.uSunDir.value.copy(setup.direction);
  u.uSunColor.value.setRGB(...setup.color);
  // Shadow casters are only packed where this room's sun can reach them (sunOccluders.ts).
  setSunReachTest(n > 0 ? (p) => sunVisibility(p, setup) > 0 : null);
}

export const SUN_LIGHT_FRAGMENT_DECL = /* glsl */ `
${SUN_OCCLUDER_FRAGMENT_DECL}
#define MAX_SUN_WINDOWS ${MAX_SUN_WINDOWS}
uniform vec4 uSunWindows[MAX_SUN_WINDOWS * 3];
uniform int uSunWindowCount;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform sampler2D uSunMask;

vec3 sunLightIrradiance(vec3 p, vec3 n) {
  float cosN = dot(n, uSunDir);
  if (cosN <= 0.0 || uSunWindowCount == 0) return vec3(0.0);
  float lit = 0.0;
  for (int i = 0; i < MAX_SUN_WINDOWS; i++) {
    if (i >= uSunWindowCount) break;
    vec4 a = uSunWindows[i * 3];
    vec4 b = uSunWindows[i * 3 + 1];
    vec4 c = uSunWindows[i * 3 + 2];
    float sd = dot(uSunDir, c.xyz);
    if (sd >= -1e-4) continue;
    float dist = dot(p - a.xyz, c.xyz);
    if (dist <= 0.0) continue;
    float t = dist / -sd;
    vec3 h = p + uSunDir * t - a.xyz;
    vec2 uv = vec2(dot(h, b.xyz) / a.w, h.y / b.w);
    if (any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) continue;
    vec2 tile = vec2(mod(c.w, ${ATLAS_COLS.toFixed(1)}), floor(c.w / ${ATLAS_COLS.toFixed(1)}));
    float texel = max(a.w, b.w) / ${SUN_MASK_TILE.toFixed(1)};
    float lod = clamp(log2(max(t * ${SUN_ANGULAR_DIAMETER} / texel, 1.0)), 0.0, ${MAX_SUN_MASK_LOD.toFixed(1)});
    lit += textureLod(uSunMask, (tile + uv) / vec2(${ATLAS_COLS.toFixed(1)}, ${ATLAS_ROWS.toFixed(1)}), lod).r;
  }
  if (lit <= 0.0) return vec3(0.0);
  return min(lit, 1.0) * sunOccluderVisibility(p, uSunDir) * cosN * uSunColor;
}
`;
