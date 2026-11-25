/**
 * The renderer's pixel ratio (render pixels per CSS pixel).
 *
 * It has to be expressed relative to the screen's own `devicePixelRatio`: a phone like a Galaxy A56 has
 * ~2.6 physical pixels per CSS pixel, so a flat ratio of 1 (what we used to start at) renders a third of
 * the screen's resolution and upscales it — visibly blurry, while a 1× desktop monitor looked fine.
 */

/**
 * Total render-pixel ceiling per frame. Render cost scales with the pixels the GPU fills, so a window on a
 * 4K TV or a wide monitor gets a lower ratio rather than a choppy frame rate. A phone's CSS area is small
 * enough to stay close to native under this budget.
 */
export const MAX_RENDER_PIXELS = 1920 * 1080;
/** Never below this, even on an enormous screen — past it the blur costs more than the fluidity gains. */
export const MIN_RENDER_SCALE = 0.5;
/** On the slowest path a high-density screen still gets at least this share of its native density. */
export const MIN_DENSITY_SHARE = 0.5;
/** At or above this density a touch device gets the cheaper FXAA instead of SMAA. */
export const FXAA_MIN_DEVICE_PIXEL_RATIO = 2;

export type AntialiasMode = "smaa" | "fxaa";

/**
 * SMAA is three full-screen passes — fine on a desktop, a real cost at phone resolutions. FXAA is a single
 * pass; its slight softening, visible at 1×, disappears at phone density. Without any pass, painting
 * frame edges look jagged even on a 2.6× phone screen, so one of the two always runs.
 *
 * Desktops always get SMAA (2026-11-25): a Retina Mac is also dpr 2, but MAX_RENDER_PIXELS caps it at
 * ~1.3× (≈ 65 % of native, upscaled), so FXAA's "density hides it" assumption fails there — the wall/ceiling
 * line and the skirting read as stair-steps and the skirting's thin chamfer shimmered while walking.
 */
export function antialiasMode(devicePixelRatio: number, touchPrimary: boolean): AntialiasMode {
  return touchPrimary && devicePixelRatio >= FXAA_MIN_DEVICE_PIXEL_RATIO ? "fxaa" : "smaa";
}

export interface RenderScaleInput {
  devicePixelRatio: number;
  cssWidth: number;
  cssHeight: number;
  /** 0 = the device struggles (lowest ratio), 1 = it has headroom (sharpest allowed). FPS-driven. */
  quality: number;
}

/** Pixel ratio for the renderer, rounded to 0.05 so small quality changes don't reallocate buffers. */
export function renderPixelRatio({ devicePixelRatio, cssWidth, cssHeight, quality }: RenderScaleInput): number {
  const dpr = devicePixelRatio > 0 ? devicePixelRatio : 1;
  const area = Math.max(1, cssWidth * cssHeight);
  const budgetCap = Math.sqrt(MAX_RENDER_PIXELS / area);
  const max = Math.max(MIN_RENDER_SCALE, Math.min(dpr, budgetCap));
  const min = Math.min(max, Math.max(1, dpr * MIN_DENSITY_SHARE));
  const q = Math.min(1, Math.max(0, quality));
  const ratio = min + (max - min) * q;
  return Math.round(ratio * 20) / 20;
}
