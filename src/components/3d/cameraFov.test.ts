import { describe, expect, it } from "vitest";
import {
  MAX_VERTICAL_FOV,
  MAX_ZOOM,
  MIN_VERTICAL_FOV,
  TARGET_HORIZONTAL_FOV,
  clampZoom,
  fovAtZoom,
  fovForAspect,
  horizontalFov,
} from "./cameraFov";

const half = (deg: number) => Math.tan((deg * Math.PI) / 360);

describe("fovForAspect", () => {
  it("is ~48° vertical on a 16:9 screen (≈77° horizontal)", () => {
    const fov = fovForAspect(16 / 9);
    expect(fov).toBeGreaterThan(47);
    expect(fov).toBeLessThan(49);
    expect(horizontalFov(fov, 16 / 9)).toBeCloseTo(TARGET_HORIZONTAL_FOV);
  });

  it("is never as wide as the old fixed 65°", () => {
    for (const aspect of [0.5, 1, 4 / 3, 16 / 9, 19.5 / 9, 21 / 9, 3]) {
      expect(fovForAspect(aspect)).toBeLessThan(65);
    }
  });

  it("keeps a usable vertical view on very wide screens (phone landscape)", () => {
    expect(fovForAspect(19.5 / 9)).toBe(MIN_VERTICAL_FOV);
    expect(fovForAspect(3)).toBe(MIN_VERTICAL_FOV);
  });

  it("doesn't balloon on narrow / portrait viewports", () => {
    expect(fovForAspect(4 / 3)).toBeLessThanOrEqual(MAX_VERTICAL_FOV);
    expect(fovForAspect(0.6)).toBe(MAX_VERTICAL_FOV);
  });

  it("falls back safely on a zero-size canvas", () => {
    expect(fovForAspect(0)).toBe(MAX_VERTICAL_FOV);
    expect(fovForAspect(Number.NaN)).toBe(MAX_VERTICAL_FOV);
  });
});

describe("zoom", () => {
  it("magnifies by the zoom factor", () => {
    expect(half(48) / half(fovAtZoom(48, 2))).toBeCloseTo(2);
  });

  it("is the base view at 1×", () => {
    expect(fovAtZoom(48, 1)).toBeCloseTo(48);
  });

  it("clamps between the normal view and the maximum magnification", () => {
    expect(clampZoom(0.1)).toBe(1);
    expect(clampZoom(100)).toBe(MAX_ZOOM);
    expect(clampZoom(1.7)).toBe(1.7);
  });
});
