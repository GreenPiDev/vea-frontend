import { describe, expect, it } from "vitest";
import {
  CROP_SAFETY_PIXELS,
  MAX_CROP_FRACTION,
  NO_CROP,
  cropToUvTransform,
  detectImageCrop,
  measureImageCrop,
} from "./artworkImageCrop";

/** Deterministic pseudo-random "paint": textured, mid-tone, never a flat line. */
function paint(x: number, y: number): [number, number, number] {
  const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  const f = n - Math.floor(n);
  return [80 + f * 120, 60 + f * 90, 40 + ((x * 7 + y * 3) % 60)];
}

function grid(
  width: number,
  height: number,
  pixel: (x: number, y: number) => [number, number, number] = paint
) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const [r, g, b] = pixel(x, y);
      const o = (y * width + x) * 4;
      data[o] = r;
      data[o + 1] = g;
      data[o + 2] = b;
      data[o + 3] = 255;
    }
  return { data, width, height };
}

/** Paint with flat margins of the given pixel depths and colour (slight JPEG-like jitter). */
function withMargins(
  width: number,
  height: number,
  m: { top?: number; bottom?: number; left?: number; right?: number },
  color: [number, number, number] = [248, 247, 244]
) {
  return grid(width, height, (x, y) => {
    const inMargin =
      y < (m.top ?? 0) || y >= height - (m.bottom ?? 0) || x < (m.left ?? 0) || x >= width - (m.right ?? 0);
    if (!inMargin) return paint(x, y);
    const j = ((x * 31 + y * 17) % 7) - 3;
    return [color[0] + j, color[1] + j, color[2] + j];
  });
}

describe("detectImageCrop", () => {
  it("leaves a clean painting untouched", () => {
    expect(detectImageCrop(grid(200, 150))).toEqual(NO_CROP);
  });

  it("removes a white scan strip along the top and left (the Saint-Rémy case), plus a safety pixel", () => {
    const crop = detectImageCrop(withMargins(200, 160, { top: 6, left: 4 }));
    expect(crop.top).toBeCloseTo((6 + CROP_SAFETY_PIXELS) / 160, 10);
    expect(crop.left).toBeCloseTo((4 + CROP_SAFETY_PIXELS) / 200, 10);
    expect(crop.bottom).toBe(0);
    expect(crop.right).toBe(0);
  });

  it("handles black backdrops on all four sides", () => {
    const crop = detectImageCrop(withMargins(200, 200, { top: 5, bottom: 5, left: 8, right: 8 }, [8, 8, 10]));
    for (const v of Object.values(crop)) expect(v).toBeGreaterThan(0);
  });

  it("never cuts more than MAX_CROP_FRACTION from a side (a pale painting isn't eaten)", () => {
    const allWhite = detectImageCrop(grid(100, 100, () => [250, 250, 250]));
    for (const v of Object.values(allWhite)) expect(v).toBeLessThanOrEqual(MAX_CROP_FRACTION + 1e-12);
  });

  it("ignores flat mid-tone areas (a grey sky is paint, not a margin)", () => {
    expect(detectImageCrop(grid(120, 120, (x, y) => (y < 20 ? [140, 150, 160] : paint(x, y))))).toEqual(NO_CROP);
  });

  it("ignores light but textured edges (a bright painted sky)", () => {
    const sky = grid(120, 120, (x, y) => {
      if (y >= 20) return paint(x, y);
      const v = 215 + ((x * 13 + y * 7) % 40);
      return [v, v, Math.min(255, v + 5)];
    });
    expect(detectImageCrop(sky).top).toBe(0);
  });

  it("stops at a colour change (white mount, then a black line, is only cut to the line)", () => {
    const img = grid(100, 100, (x, y) => (y < 4 ? [250, 250, 250] : y < 8 ? [5, 5, 5] : paint(x, y)));
    expect(detectImageCrop(img).top).toBeCloseTo((4 + CROP_SAFETY_PIXELS) / 100, 10);
  });

  it("skips images too small to judge", () => {
    expect(detectImageCrop(grid(4, 4, () => [255, 255, 255]))).toEqual(NO_CROP);
  });
});

describe("cropToUvTransform", () => {
  it("maps the crop to three's offset/repeat (uv.y = 0 is the image bottom)", () => {
    const t = cropToUvTransform({ left: 0.02, right: 0.01, top: 0.05, bottom: 0.03 });
    expect(t.offset).toEqual([0.02, 0.03]);
    expect(t.repeat[0]).toBeCloseTo(0.97, 12);
    expect(t.repeat[1]).toBeCloseTo(0.92, 12);
    expect(cropToUvTransform(NO_CROP)).toEqual({ offset: [0, 0], repeat: [1, 1] });
  });
});

describe("measureImageCrop", () => {
  it("falls back to no crop when the pixels can't be read (jsdom has no 2D canvas)", () => {
    const img = { width: 100, height: 80 } as unknown as HTMLImageElement;
    expect(measureImageCrop("/x.jpg", img)).toEqual(NO_CROP);
  });
});
