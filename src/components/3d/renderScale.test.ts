import { describe, expect, it } from "vitest";
import { MIN_RENDER_SCALE, antialiasMode, renderPixelRatio } from "./renderScale";

// Galaxy A56: 1080×2340 physical, ~412×892 CSS, devicePixelRatio 2.625 (landscape in the exhibition).
const phone = { devicePixelRatio: 2.625, cssWidth: 892, cssHeight: 412 };

describe("renderPixelRatio", () => {
  it("renders a high-density phone close to its native resolution when it has headroom", () => {
    const ratio = renderPixelRatio({ ...phone, quality: 1 });
    expect(ratio).toBeGreaterThan(2.2);
    expect(ratio).toBeLessThanOrEqual(2.625);
  });

  it("keeps a struggling phone above 1× (the old blurry default)", () => {
    expect(renderPixelRatio({ ...phone, quality: 0 })).toBeGreaterThanOrEqual(1.3);
  });

  it("uses the cheaper FXAA only on high-density touch screens", () => {
    expect(antialiasMode(1, true)).toBe("smaa");
    expect(antialiasMode(1.5, true)).toBe("smaa");
    expect(antialiasMode(2, true)).toBe("fxaa");
    expect(antialiasMode(2.625, true)).toBe("fxaa");
  });

  it("keeps SMAA on a desktop even at retina density (rendered below native there)", () => {
    expect(antialiasMode(2, false)).toBe("smaa");
    expect(antialiasMode(1, false)).toBe("smaa");
  });

  it("never exceeds the device's own density", () => {
    expect(renderPixelRatio({ devicePixelRatio: 1, cssWidth: 800, cssHeight: 600, quality: 1 })).toBe(1);
    expect(renderPixelRatio({ devicePixelRatio: 2, cssWidth: 400, cssHeight: 300, quality: 1 })).toBe(2);
  });

  it("caps the total pixel budget on huge windows", () => {
    const ratio = renderPixelRatio({ devicePixelRatio: 2, cssWidth: 3840, cssHeight: 2160, quality: 1 });
    expect(ratio).toBe(MIN_RENDER_SCALE);
    const laptop = renderPixelRatio({ devicePixelRatio: 2, cssWidth: 1440, cssHeight: 900, quality: 1 });
    expect(1440 * 900 * laptop * laptop).toBeLessThanOrEqual(1920 * 1080 * 1.05);
  });

  it("grows monotonically with quality and clamps out-of-range input", () => {
    const low = renderPixelRatio({ ...phone, quality: 0 });
    const mid = renderPixelRatio({ ...phone, quality: 0.5 });
    const high = renderPixelRatio({ ...phone, quality: 1 });
    expect(low).toBeLessThan(mid);
    expect(mid).toBeLessThan(high);
    expect(renderPixelRatio({ ...phone, quality: 7 })).toBe(high);
    expect(renderPixelRatio({ ...phone, quality: -1 })).toBe(low);
  });

  it("falls back to 1 for a missing devicePixelRatio", () => {
    expect(renderPixelRatio({ devicePixelRatio: 0, cssWidth: 800, cssHeight: 600, quality: 1 })).toBe(1);
  });
});
