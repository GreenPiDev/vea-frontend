// Specular anti-aliasing for room surfaces (sergi-gercekcilestirme.md Adım 10).
//
// Glossy floors (marble, polished concrete, metal plates) sparkle in the distance: a normal-mapped texel far
// smaller than a pixel tilts the reflection vector at random from pixel to pixel and frame to frame, so the
// env map's bright fixture discs flash on and off as the camera moves — white, glittering dots. Post AA (SMAA /
// FXAA) can't fix it: the aliasing is inside the shading, not on geometry edges. The usual cure is to turn the
// normal detail a pixel can't resolve into roughness — the reflection gets softer exactly where it would
// otherwise flicker, and stays sharp up close. Three cooperating terms, all ALU only (no texture, no pass):
//
// 1. Toksvig: mipmapping averages the normal map's vectors, and the averaged vector is shorter than 1 where the
//    texels it covers point in different directions. (1 − |n|) / |n| is the variance of those slopes, a stable
//    per-mip measure of the detail that was filtered away — added to α² (α = roughness², three's GGX alpha).
//    Scaled by normalScale², since that's what the perturbation was exaggerated by.
// 2. Normal-detail fade: once a pixel covers many texels the residual (averaged) perturbation is just noise
//    times normalScale, so it's eased toward `SPEC_AA_MIN_NORMAL` of its strength. Uses the minor axis of the
//    texel footprint (what the anisotropic filter actually resolves), via textureSize — WebGL2 only, as three
//    r185 is.
// 3. Kaplanyan–Tokuyoshi screen-space variance ("roughness from normal variance", as in Filament / HDRP): the
//    final normal's change across the 2×2 pixel quad is added to α² (clamped by `SPEC_AA_MAX_KERNEL`). Catches
//    what Toksvig misses — normal-map detail at the base mip under a grazing view, and normal-map seams.
//
// three already adds the *geometry* normal's derivative to roughness (lights_physical_fragment), which is zero on
// a flat floor, so it doesn't cover any of this. Mirrored on the CPU below for tests.

/** Kaplanyan screen-space variance multiplier (Filament's default `specularAntiAliasingVariance` is 0.15). */
export const SPEC_AA_SCREEN_VARIANCE = 0.15;
/** Upper bound of the screen-space kernel added to α² (Filament's default threshold is 0.2). */
export const SPEC_AA_MAX_KERNEL = 0.18;
/** 8-bit / JPEG normal maps aren't exactly unit length even at the base mip — ignore that much shortening. */
export const SPEC_AA_TOKSVIG_BIAS = 0.02;
/** Texels per pixel (minor footprint axis) where the normal-detail fade starts, and where it bottoms out. */
export const SPEC_AA_FADE_TEXELS: readonly [number, number] = [1.5, 6];
/** Remaining strength of the normal map once a pixel covers `SPEC_AA_FADE_TEXELS[1]` texels or more. */
export const SPEC_AA_MIN_NORMAL = 0.45;

const clamp01 = (x: number) => Math.min(Math.max(x, 0), 1);
const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/** Toksvig slope variance from a mip-filtered (unnormalized) normal's length, scaled by normalScale². */
export function toksvigVariance(length: number, normalScale: number): number {
  const v = (1 - length) / Math.max(length, 1e-3) - SPEC_AA_TOKSVIG_BIAS;
  return Math.max(v, 0) * normalScale * normalScale;
}

/** Strength multiplier for the normal map's perturbation at a footprint of `texelsPerPixel` (minor axis). */
export function normalDetailFade(texelsPerPixel: number): number {
  const [a, b] = SPEC_AA_FADE_TEXELS;
  return 1 + (SPEC_AA_MIN_NORMAL - 1) * smoothstep(a, b, texelsPerPixel);
}

/** Screen-space kernel added to α² from the squared lengths of the normal's x/y screen derivatives. */
export function screenSpaceKernel(dndxSq: number, dndySq: number): number {
  return Math.min(2 * SPEC_AA_SCREEN_VARIANCE * (dndxSq + dndySq), SPEC_AA_MAX_KERNEL);
}

/** Perceptual roughness after adding `variance` to α² (α = roughness²). Never lowers it. */
export function filteredRoughness(roughness: number, variance: number): number {
  const alpha2 = roughness ** 4;
  return clamp01(alpha2 + Math.max(variance, 0)) ** 0.25;
}

const f = (n: number) => n.toFixed(4);

/** Before `#include <normal_fragment_begin>`: the variance accumulator, defined even without a normal map. */
export const SPEC_AA_DECLARE = /* glsl */ `
float specAaVariance = 0.0;
`;

/**
 * Replaces three's `mapN.xy *= normalScale;` inside normal_fragment_maps' tangent-space branch: Toksvig
 * variance from the raw (filtered) vector, then the footprint fade on the scaled perturbation.
 */
export const SPEC_AA_NORMAL_MAP = /* glsl */ `
{
  float specAaScale = max(abs(normalScale.x), abs(normalScale.y));
  float specAaLen = length(mapN);
  specAaVariance += max((1.0 - specAaLen) / max(specAaLen, 1e-3) - ${f(SPEC_AA_TOKSVIG_BIAS)}, 0.0) * specAaScale * specAaScale;
  vec2 specAaTexels = vNormalMapUv * vec2(textureSize(normalMap, 0));
  float specAaFootprint = min(length(dFdx(specAaTexels)), length(dFdy(specAaTexels)));
  mapN.xy *= normalScale * mix(1.0, ${f(SPEC_AA_MIN_NORMAL)}, smoothstep(${f(SPEC_AA_FADE_TEXELS[0])}, ${f(SPEC_AA_FADE_TEXELS[1])}, specAaFootprint));
}
`;

/** After `#include <lights_physical_fragment>`: fold the variance (+ screen-space kernel) into the roughness. */
export const SPEC_AA_ROUGHNESS = /* glsl */ `
{
  vec3 specAaDx = dFdx(normal);
  vec3 specAaDy = dFdy(normal);
  float specAaKernel = min(${f(2 * SPEC_AA_SCREEN_VARIANCE)} * (dot(specAaDx, specAaDx) + dot(specAaDy, specAaDy)), ${f(SPEC_AA_MAX_KERNEL)});
  float specAaAlpha2 = pow2(pow2(material.roughness));
  material.roughness = sqrt(sqrt(saturate(specAaAlpha2 + specAaVariance + specAaKernel)));
}
`;

/** The exact line of three's normal_fragment_maps that SPEC_AA_NORMAL_MAP replaces. */
export const NORMAL_SCALE_LINE = "mapN.xy *= normalScale;";
