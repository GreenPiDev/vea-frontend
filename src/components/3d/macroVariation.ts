// Low-frequency "macro" variation over room surfaces (sergi-gercekcilestirme.md Adım 9).
//
// A photo scan tiled every 2–3 m repeats on a perfect lattice, and from a distance the eye picks the
// lattice out at once (diagonal streaks on brick, a "copied" look on large parquet/marble floors). Real
// surfaces vary slowly in tone — sun-faded boards, mottled plaster, brick batches. Multiplying the albedo
// by a smooth world-space noise a few metres across (and nudging roughness with a decorrelated copy)
// breaks the lattice without touching the scan's own detail.
//
// Cost: two octaves of 2D value noise, 8 sin-free hashes (Hoskins hash12, stable at large coordinates on
// mobile GPUs) — a few dozen ALU ops per fragment, no texture fetch, no extra pass. Amplitude is a
// per-material uniform (`uMacroVariation`), so picking another texture never recompiles.
//
// Texture bombing / stochastic tiling (plan item 2) is deliberately NOT used: on structured scans (brick
// courses, paving joints) random per-cell offsets misalign the mortar lines along every cell border, which
// reads worse than the repetition. Macro variation is the safe first step the plan asks for.
//
// Coordinates: floor/ceiling use world xz. Walls use (x + z, y): along an axis-aligned wall exactly one of
// x/z changes, so this is the distance along the wall, and two walls meeting at a corner evaluate the same
// value at the shared edge — no seam in inside corners. Mirrored on the CPU for tests.

/** Scales of the two octaves, in metres per noise cell. */
export const MACRO_SCALES = [3.4, 1.3] as const;
const MACRO_WEIGHTS = [0.65, 0.35] as const;
/** Roughness varies by this fraction of the albedo amplitude (gloss changes read stronger than tone). */
export const MACRO_ROUGHNESS_SHARE = 0.5;
/** Default albedo amplitude (±) when a texture doesn't set its own. */
export const DEFAULT_MACRO_VARIATION = 0.07;
/** Ceiling: calmer than walls/floor — it should never pull the eye up (Adım 3). */
export const CEILING_MACRO_VARIATION = 0.04;

const fract = (x: number) => x - Math.floor(x);

/** Dave Hoskins' hash12 (sin-free), CPU mirror of the GLSL below. */
export function hash12(x: number, y: number): number {
  let p0 = fract(x * 0.1031);
  let p1 = fract(y * 0.1031);
  let p2 = fract(x * 0.1031);
  const d = p0 * (p1 + 33.33) + p1 * (p2 + 33.33) + p2 * (p0 + 33.33);
  p0 += d;
  p1 += d;
  p2 += d;
  return fract((p0 + p1) * p2);
}

/** Smooth (C1) 2D value noise in [0, 1]. */
export function valueNoise(x: number, y: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = hash12(ix, iy);
  const b = hash12(ix + 1, iy);
  const c = hash12(ix, iy + 1);
  const d = hash12(ix + 1, iy + 1);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

/** Signed macro noise in roughly [-1, 1] at a surface coordinate (metres). */
export function macroNoise(u: number, v: number): number {
  let n = 0;
  for (let i = 0; i < MACRO_SCALES.length; i++) n += MACRO_WEIGHTS[i] * valueNoise(u / MACRO_SCALES[i], v / MACRO_SCALES[i]);
  return n * 2 - 1;
}

/** Second, decorrelated field for roughness (offset far away in noise space). */
export function macroRoughnessNoise(u: number, v: number): number {
  return macroNoise(u + 57.3, v - 91.7);
}

/** Albedo multiplier at a surface coordinate. */
export function macroAlbedoFactor(u: number, v: number, amplitude: number): number {
  return 1 + amplitude * macroNoise(u, v);
}

/** Surface coordinate (metres) for a world point: floor/ceiling → xz, walls → (x + z, y). */
export function macroCoord(surface: "floor" | "ceiling" | "wall", x: number, y: number, z: number): [number, number] {
  return surface === "wall" ? [x + z, y] : [x, z];
}

const f = (n: number) => n.toFixed(4);

/** GLSL declarations (needs `ROOM_AO_SURFACE` defined and `vRoomAoWorldPos`, see roomAoMaterial.ts). */
export const MACRO_VARIATION_DECL = /* glsl */ `
uniform float uMacroVariation;
float macroHash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float macroValueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = p - i;
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = macroHash12(i);
  float b = macroHash12(i + vec2(1.0, 0.0));
  float c = macroHash12(i + vec2(0.0, 1.0));
  float d = macroHash12(i + vec2(1.0, 1.0));
  return a + (b - a) * u.x + (c - a) * u.y + (a - b - c + d) * u.x * u.y;
}
float macroNoise(vec2 p) {
  float n = ${f(MACRO_WEIGHTS[0])} * macroValueNoise(p / ${f(MACRO_SCALES[0])})
          + ${f(MACRO_WEIGHTS[1])} * macroValueNoise(p / ${f(MACRO_SCALES[1])});
  return n * 2.0 - 1.0;
}
vec2 macroCoord() {
  #if ROOM_AO_SURFACE == 2
    return vec2(vRoomAoWorldPos.x + vRoomAoWorldPos.z, vRoomAoWorldPos.y);
  #else
    return vRoomAoWorldPos.xz;
  #endif
}
`;

/** After `#include <map_fragment>`: tone variation on the albedo (also tints custom-colour rooms). */
export const MACRO_VARIATION_ALBEDO = /* glsl */ `
diffuseColor.rgb *= 1.0 + uMacroVariation * macroNoise(macroCoord());
`;

/** After `#include <roughnessmap_fragment>`: a gentle, decorrelated gloss variation. */
export const MACRO_VARIATION_ROUGHNESS = /* glsl */ `
roughnessFactor = clamp(
  roughnessFactor * (1.0 + ${f(MACRO_ROUGHNESS_SHARE)} * uMacroVariation * macroNoise(macroCoord() + vec2(57.3, -91.7))),
  0.04, 1.0);
`;
