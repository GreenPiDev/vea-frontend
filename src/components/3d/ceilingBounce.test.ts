import { describe, expect, it } from "vitest";
import { buildRoomLayout } from "./galleryLayout";
import { ceilingIrradiance, ceilingLightsForLayout } from "./ceilingLight";
import { averageFixtureIrradiance, ceilingBounceIrradiance, parallelRectViewFactor } from "./ceilingBounce";
import { CEILING_BOUNCE_SCALE } from "./sceneLighting";

const GREY: [number, number, number] = [0.5, 0.5, 0.5];
const BLACK: [number, number, number] = [0, 0, 0];

function room(size: [number, number], h: number) {
  const layout = buildRoomLayout(size, h);
  return { layout, lights: ceilingLightsForLayout(layout.ceilingSpots, 0.4) };
}

describe("parallelRectViewFactor", () => {
  it("matches the tabulated value for unit squares one unit apart (≈ 0.1998)", () => {
    expect(parallelRectViewFactor(1, 1, 1)).toBeCloseTo(0.1998, 3);
  });

  it("tends to 1 for a wide, low room and to 0 for a tall, narrow one", () => {
    expect(parallelRectViewFactor(200, 200, 1)).toBeGreaterThan(0.98);
    expect(parallelRectViewFactor(1, 1, 50)).toBeLessThan(0.001);
  });

  it("is symmetric in the two sides and drops as the ceiling rises", () => {
    expect(parallelRectViewFactor(24, 20, 5)).toBeCloseTo(parallelRectViewFactor(20, 24, 5), 10);
    expect(parallelRectViewFactor(24, 20, 8)).toBeLessThan(parallelRectViewFactor(24, 20, 4));
  });
});

describe("averageFixtureIrradiance", () => {
  it("is zero without fixtures", () => {
    const { layout } = room([10, 8], 4);
    expect(averageFixtureIrradiance(layout, [])).toEqual({ floor: 0, wall: 0 });
  });

  it("averages the shader-mirror irradiance: below the floor peak, above zero", () => {
    const { layout, lights } = room([24, 20], 5);
    const { floor, wall } = averageFixtureIrradiance(layout, lights);
    const peak = Math.max(...lights.map((l) => ceilingIrradiance({ x: l.x, y: 0, z: l.z }, { x: 0, y: 1, z: 0 }, lights)));
    expect(floor).toBeGreaterThan(0);
    expect(floor).toBeLessThan(peak);
    expect(wall).toBeGreaterThan(0);
    expect(wall).toBeLessThan(floor);
  });
});

describe("ceilingBounceIrradiance", () => {
  it("is zero when floor and walls absorb everything", () => {
    const { layout, lights } = room([24, 20], 5);
    expect(ceilingBounceIrradiance(layout, lights, BLACK, BLACK)).toEqual([0, 0, 0]);
  });

  it("is the view-factor blend of floor and wall bounce, linear in albedo", () => {
    const { layout, lights } = room([24, 20], 5);
    const { floor, wall } = averageFixtureIrradiance(layout, lights);
    const f = parallelRectViewFactor(24, 20, 5);
    const [r] = ceilingBounceIrradiance(layout, lights, GREY, GREY);
    expect(r).toBeCloseTo(CEILING_BOUNCE_SCALE * 0.5 * (f * floor + (1 - f) * wall), 10);
    const [r2] = ceilingBounceIrradiance(layout, lights, [1, 1, 1], [1, 1, 1]);
    expect(r2).toBeCloseTo(2 * r, 10);
  });

  it("keeps the floor's tint: a warm floor gives a warm bounce", () => {
    const { layout, lights } = room([24, 20], 5);
    const [r, g, b] = ceilingBounceIrradiance(layout, lights, [0.55, 0.37, 0.21], BLACK);
    expect(r).toBeGreaterThan(g);
    expect(g).toBeGreaterThan(b);
  });

  it("lands in the range of the ceiling's own fill for a light room (not a second lamp)", () => {
    // Light parquet + off-white walls, the 'Balkonlu Salon' case: a few tenths, well under a floor pool (1.1).
    const { layout, lights } = room([24, 20], 5);
    const [r] = ceilingBounceIrradiance(layout, lights, [0.55, 0.55, 0.55], [0.9, 0.9, 0.9]);
    expect(r).toBeGreaterThan(0.15);
    expect(r).toBeLessThan(0.8);
  });
});
