// Automatic crop of flat scan margins on artwork images (sergi-gercekcilestirme.md Adım 12).
//
// Museum/Wikimedia photos often carry a strip of the scanner bed or mount board — a flat white (or black)
// band along one or more edges. Inside a frame it reads as a printing error, not paint. Artists paste an
// image URL in the panel (no upload step to crop in), so the crop happens when the 3D scene loads the
// texture: the image is drawn once into a small canvas, edge rows/columns that are a single flat light or
// dark colour are measured, and the texture's offset/repeat skip them. The cropped content is the actual
// painting, whose proportions the artist's entered width/height describe, so nothing gets stretched.
//
// Deliberately conservative: a row only counts as margin when practically every sample sits within a few
// levels of one near-white/near-black value (JPEG flat fill), which real paint never does — and a side is
// never cut by more than `MAX_CROP_FRACTION`, so a genuinely pale painting can't be eaten.

export interface ImageCrop {
  /** Fractions of the image width/height removed from each side (0 = untouched). */
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export const NO_CROP: ImageCrop = { left: 0, right: 0, top: 0, bottom: 0 };

/** Longest edge of the analysis canvas. */
export const CROP_ANALYSIS_SIZE = 512;
/** Never remove more than this fraction of the image from one side. */
export const MAX_CROP_FRACTION = 0.12;
/** Luma above / below which a flat line can be a margin (mount board, scanner bed, black backdrop). */
export const MARGIN_LIGHT = 205;
export const MARGIN_DARK = 40;
/** A pixel belongs to the flat line if every channel is within this many levels of the line's mean. */
export const MARGIN_TOLERANCE = 14;
/** ...and at least this share of the line's pixels must. */
export const MARGIN_COVERAGE = 0.98;
/** Extra analysis pixels cut past the detected margin (JPEG ringing / antialiased transition / mip bleed). */
export const CROP_SAFETY_PIXELS = 1.5;

/** RGBA pixels, row-major (ImageData layout). */
export interface PixelGrid {
  data: ArrayLike<number>;
  width: number;
  height: number;
}

type Line = (i: number) => [number, number, number];

/** Is this line a flat light/dark margin? Returns its mean colour, or null. */
function flatMarginColor(px: Line, length: number): [number, number, number] | null {
  let r = 0, g = 0, b = 0;
  for (let i = 0; i < length; i++) {
    const p = px(i);
    r += p[0]; g += p[1]; b += p[2];
  }
  r /= length; g /= length; b /= length;
  const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  if (luma < MARGIN_LIGHT && luma > MARGIN_DARK) return null;
  let inside = 0;
  for (let i = 0; i < length; i++) {
    const p = px(i);
    if (Math.abs(p[0] - r) <= MARGIN_TOLERANCE && Math.abs(p[1] - g) <= MARGIN_TOLERANCE && Math.abs(p[2] - b) <= MARGIN_TOLERANCE) inside++;
  }
  return inside >= MARGIN_COVERAGE * length ? [r, g, b] : null;
}

/** Number of consecutive flat margin lines from one side, all of (about) the same colour. */
function marginDepth(count: number, lineAt: (k: number) => Line, length: number): number {
  const max = Math.floor(count * MAX_CROP_FRACTION);
  let first: [number, number, number] | null = null;
  let k = 0;
  for (; k < max; k++) {
    const c = flatMarginColor(lineAt(k), length);
    if (!c) break;
    if (!first) first = c;
    else if (Math.abs(c[0] - first[0]) > MARGIN_TOLERANCE || Math.abs(c[1] - first[1]) > MARGIN_TOLERANCE || Math.abs(c[2] - first[2]) > MARGIN_TOLERANCE) break;
  }
  return k;
}

/** Detects flat scan margins along the four edges. */
export function detectImageCrop({ data, width, height }: PixelGrid): ImageCrop {
  if (width < 8 || height < 8) return NO_CROP;
  const at = (x: number, y: number): [number, number, number] => {
    const o = (y * width + x) * 4;
    return [data[o], data[o + 1], data[o + 2]];
  };
  const row = (y: number): Line => (x) => at(x, y);
  const col = (x: number): Line => (y) => at(x, y);
  const side = (depth: number, size: number) =>
    depth === 0 ? 0 : Math.min((depth + CROP_SAFETY_PIXELS) / size, MAX_CROP_FRACTION);
  return {
    top: side(marginDepth(height, (k) => row(k), width), height),
    bottom: side(marginDepth(height, (k) => row(height - 1 - k), width), height),
    left: side(marginDepth(width, (k) => col(k), height), width),
    right: side(marginDepth(width, (k) => col(width - 1 - k), height), width),
  };
}

/** Texture repeat/offset for a crop (three's UV transform; `uv.y` = 0 is the image's bottom with flipY). */
export function cropToUvTransform(crop: ImageCrop): { offset: [number, number]; repeat: [number, number] } {
  return {
    offset: [crop.left, crop.bottom],
    repeat: [1 - crop.left - crop.right, 1 - crop.top - crop.bottom],
  };
}

const cropCache = new Map<string, ImageCrop>();

/**
 * Measures an image's margins in the browser (one small canvas draw per URL, cached). Returns NO_CROP when
 * the pixels can't be read — e.g. no 2D canvas, or a cross-origin image that taints it (the texture loaded,
 * so this is rare, but never worth failing the artwork over).
 */
export function measureImageCrop(url: string, image: CanvasImageSource & { width: number; height: number }): ImageCrop {
  const cached = cropCache.get(url);
  if (cached) return cached;
  let crop = NO_CROP;
  try {
    const scale = Math.min(1, CROP_ANALYSIS_SIZE / Math.max(image.width, image.height));
    const w = Math.max(1, Math.round(image.width * scale));
    const h = Math.max(1, Math.round(image.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (ctx) {
      ctx.drawImage(image, 0, 0, w, h);
      crop = detectImageCrop(ctx.getImageData(0, 0, w, h));
    }
  } catch {
    crop = NO_CROP;
  }
  cropCache.set(url, crop);
  return crop;
}
