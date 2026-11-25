import { describe, expect, it } from "vitest";
import { ARTWORK_DISPLAY_SCALE, artworkDisplayHeight, estimatedFrameCm, frameBorderFraction } from "./artworkDisplayScale";

describe("artworkDisplayHeight", () => {
  it("scales the physical height (cm → m) by the global display scale", () => {
    expect(artworkDisplayHeight({ heightCm: 100, widthCm: 100 })).toBeCloseTo(ARTWORK_DISPLAY_SCALE);
    expect(artworkDisplayHeight({ heightCm: 20, widthCm: 20 })).toBeCloseTo(0.2 * ARTWORK_DISPLAY_SCALE);
  });

  it("keeps relative sizes between works", () => {
    expect(artworkDisplayHeight({ heightCm: 150, widthCm: 150 }) / artworkDisplayHeight({ heightCm: 50, widthCm: 50 })).toBeCloseTo(3);
  });
});

describe("frameBorderFraction", () => {
  it("is the estimated frame's share of the displayed image on each side", () => {
    const art = { heightCm: 100, widthCm: 50, framed: true };
    const f = estimatedFrameCm(art); // 8 cm
    const { x, y } = frameBorderFraction(art);
    expect(x).toBeCloseTo(f / (50 + 2 * f), 9);
    expect(y).toBeCloseTo(f / (100 + 2 * f), 9);
  });

  it("is zero for an unframed work", () => {
    expect(frameBorderFraction({ heightCm: 100, widthCm: 50, framed: false })).toEqual({ x: 0, y: 0 });
  });
});
