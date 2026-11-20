import { describe, expect, it } from "vitest";
import { outlineColorsForWall, setOutlineWallColor, outlineMaterial, wallLightness } from "./artworkOutline";

describe("outlineColorsForWall", () => {
  it("keeps the light champagne palette on dark walls", () => {
    const { line } = outlineColorsForWall("#22303f");
    expect(wallLightness("#" + line.getHexString())).toBeGreaterThan(0.7);
  });

  it("switches to a dark bronze on light walls so it contrasts", () => {
    for (const wall of ["#efe4cf", "#d9c9ad"]) {
      const { line, glow } = outlineColorsForWall(wall);
      expect(wallLightness(wall) - wallLightness("#" + line.getHexString())).toBeGreaterThan(0.4);
      expect(wallLightness(wall) - wallLightness("#" + glow.getHexString())).toBeGreaterThan(0.25);
    }
  });

  it("crossfades smoothly for mid-tone walls", () => {
    const dark = wallLightness("#" + outlineColorsForWall("#22303f").line.getHexString());
    const mid = wallLightness("#" + outlineColorsForWall("#8d8e90").line.getHexString());
    const light = wallLightness("#" + outlineColorsForWall("#efe4cf").line.getHexString());
    expect(mid).toBeLessThan(dark);
    expect(mid).toBeGreaterThan(light);
  });

  it("setOutlineWallColor writes into the shared material", () => {
    setOutlineWallColor("#efe4cf");
    const u = outlineMaterial.uniforms.uLineColor.value;
    expect(wallLightness("#" + u.getHexString())).toBeLessThan(0.4);
  });
});
