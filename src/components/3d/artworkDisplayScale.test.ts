import { describe, expect, it } from "vitest";
import { ARTWORK_DISPLAY_SCALE, artworkDisplayHeight } from "./artworkDisplayScale";

describe("artworkDisplayHeight", () => {
  it("scales the physical height (cm → m) by the global display scale", () => {
    expect(artworkDisplayHeight({ heightCm: 100, widthCm: 100 })).toBeCloseTo(ARTWORK_DISPLAY_SCALE);
    expect(artworkDisplayHeight({ heightCm: 20, widthCm: 20 })).toBeCloseTo(0.2 * ARTWORK_DISPLAY_SCALE);
  });

  it("keeps relative sizes between works", () => {
    expect(artworkDisplayHeight({ heightCm: 150, widthCm: 150 }) / artworkDisplayHeight({ heightCm: 50, widthCm: 50 })).toBeCloseTo(3);
  });
});
