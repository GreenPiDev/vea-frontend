import { describe, expect, it } from "vitest";
import {
  MAX_CEILING_LIGHTS,
  ceilingIrradiance,
  ceilingLightUniforms,
  ceilingLightsForLayout,
  clusterCeilingLights,
  fixturePower,
  setCeilingLights,
  type CeilingLight,
} from "./ceilingLight";
import { CEILING_LIGHT_FLOOR_IRRADIANCE } from "./sceneLighting";

const UP = { x: 0, y: 1, z: 0 };
const DOWN = { x: 0, y: -1, z: 0 };

/** One fixture 10 cm below a 4 m ceiling, at the origin, at the reference brightness. */
function lamp(x = 0, z = 0, ceiling = 4): CeilingLight {
  const y = ceiling - 0.1;
  return { x, y, z, power: fixturePower(y, CEILING_LIGHT_FLOOR_IRRADIANCE) };
}

describe("ceiling light: floor pools", () => {
  it("gives the target irradiance on the floor straight below a fixture", () => {
    const e = ceilingIrradiance({ x: 0, y: 0, z: 0 }, UP, [lamp()]);
    expect(e).toBeGreaterThan(CEILING_LIGHT_FLOOR_IRRADIANCE * 0.97);
    expect(e).toBeLessThanOrEqual(CEILING_LIGHT_FLOOR_IRRADIANCE);
  });

  it("looks the same under a 3 m and a 13 m ceiling (power scales with height²)", () => {
    const low = ceilingIrradiance({ x: 0, y: 0, z: 0 }, UP, [lamp(0, 0, 3)]);
    const high = ceilingIrradiance({ x: 0, y: 0, z: 0 }, UP, [lamp(0, 0, 13)]);
    expect(high / low).toBeCloseTo(1, 1);
  });

  it("falls off softly away from the fixture — a pool, not a flat wash", () => {
    const below = ceilingIrradiance({ x: 0, y: 0, z: 0 }, UP, [lamp()]);
    const near = ceilingIrradiance({ x: 1.5, y: 0, z: 0 }, UP, [lamp()]);
    const far = ceilingIrradiance({ x: 4, y: 0, z: 0 }, UP, [lamp()]);
    expect(near).toBeLessThan(below);
    expect(near).toBeGreaterThan(below * 0.5);
    expect(far).toBeLessThan(below * 0.3);
  });
});

describe("ceiling light: walls", () => {
  // A wall 2.5 m east of the fixture, facing it (-X).
  const wallN = { x: -1, y: 0, z: 0 };
  const onWall = (y: number) => ceilingIrradiance({ x: 2.5, y, z: 0 }, wallN, [lamp()]);

  it("is darker right under the ceiling than lower down (downlight scallop)", () => {
    expect(onWall(1.5)).toBeGreaterThan(onWall(3.7) * 1.3);
  });

  it("peaks somewhere mid-wall, fading toward the floor too", () => {
    expect(onWall(1.5)).toBeGreaterThan(onWall(0.2));
  });

  it("lights only the face turned toward the fixture", () => {
    const back = ceilingIrradiance({ x: 2.5, y: 1.5, z: 0 }, { x: 1, y: 0, z: 0 }, [lamp()]);
    expect(back).toBe(0);
  });

  it("gives the two walls of a corner different brightness when the lamp is nearer one", () => {
    // Corner at (3, *, 3); the lamp is 1.5 m from the east wall and 3 m from the north wall. Sampled
    // 0.3 m either side of the corner line: the light strikes the north wall far more squarely.
    const l = lamp(1.5, 0);
    const east = ceilingIrradiance({ x: 3, y: 1.5, z: 2.7 }, { x: -1, y: 0, z: 0 }, [l]);
    const north = ceilingIrradiance({ x: 2.7, y: 1.5, z: 3 }, { x: 0, y: 0, z: -1 }, [l]);
    expect(Math.abs(east - north) / Math.max(east, north)).toBeGreaterThan(0.3);
  });
});

describe("ceiling light: objects and ceiling", () => {
  it("lights the side of a plinth facing the lamp and leaves the far side to the fill", () => {
    const l = lamp(-2, 0);
    const lit = ceilingIrradiance({ x: 0, y: 0.8, z: 0 }, { x: -1, y: 0, z: 0 }, [l]);
    const shaded = ceilingIrradiance({ x: 0, y: 0.8, z: 0 }, { x: 1, y: 0, z: 0 }, [l]);
    expect(lit).toBeGreaterThan(0.2);
    expect(shaded).toBe(0);
  });

  it("leaves a faint halo on the ceiling around the fixture, fading within a metre", () => {
    const halo = ceilingIrradiance({ x: 0.3, y: 4, z: 0 }, DOWN, [lamp()]);
    const away = ceilingIrradiance({ x: 1.5, y: 4, z: 0 }, DOWN, [lamp()]);
    expect(halo).toBeGreaterThan(away * 5);
    // A halo, not a second lamp: well below the floor pool.
    expect(halo).toBeLessThan(CEILING_LIGHT_FLOOR_IRRADIANCE * 2);
  });
});

describe("ceilingLightsForLayout", () => {
  it("scales with the theme's own ambient level, so dark rooms stay dark", () => {
    const spots: [number, number, number][] = [[0, 3.9, 0]];
    const [ref] = ceilingLightsForLayout(spots, 0.4);
    const [dark] = ceilingLightsForLayout(spots, 0.16);
    expect(dark.power / ref.power).toBeCloseTo(0.4);
    expect(ref.power).toBeCloseTo(fixturePower(3.9, CEILING_LIGHT_FLOOR_IRRADIANCE));
  });
});

describe("clusterCeilingLights", () => {
  const grid: CeilingLight[] = [];
  for (let i = 0; i < 6; i++) for (let j = 0; j < 5; j++) grid.push({ x: i * 2, y: 3.9, z: j * 2, power: 10 + i });

  it("leaves a room within the limit untouched", () => {
    const few = grid.slice(0, 4);
    expect(clusterCeilingLights(few, 8)).toEqual(few);
  });

  it("merges down to the limit and keeps the total power", () => {
    const merged = clusterCeilingLights(grid, 12);
    expect(merged).toHaveLength(12);
    const total = (ls: CeilingLight[]) => ls.reduce((s, l) => s + l.power, 0);
    expect(total(merged)).toBeCloseTo(total(grid));
  });

  it("merges the closest pair into its power-weighted centroid", () => {
    const merged = clusterCeilingLights(
      [
        { x: 0, y: 4, z: 0, power: 3 },
        { x: 1, y: 4, z: 0, power: 1 },
        { x: 10, y: 4, z: 0, power: 5 },
      ],
      2
    );
    expect(merged).toContainEqual({ x: 0.25, y: 4, z: 0, power: 4 });
    expect(merged).toContainEqual({ x: 10, y: 4, z: 0, power: 5 });
  });

  it("doesn't mutate its input", () => {
    const copy = grid.map((l) => ({ ...l }));
    clusterCeilingLights(grid, 3);
    expect(grid).toEqual(copy);
  });
});

describe("setCeilingLights", () => {
  it("packs lights into the fixed-size uniform array and zeroes the rest", () => {
    setCeilingLights([lamp(1, 2), lamp(-1, -2)], "#ffffff");
    expect(ceilingLightUniforms.uCeilingLightCount.value).toBe(2);
    expect(ceilingLightUniforms.uCeilingLights.value).toHaveLength(MAX_CEILING_LIGHTS);
    expect(ceilingLightUniforms.uCeilingLights.value[0].x).toBe(1);
    expect(ceilingLightUniforms.uCeilingLights.value[2].w).toBe(0);
  });

  it("never exceeds the uniform array, however many fixtures a room has", () => {
    const many = Array.from({ length: MAX_CEILING_LIGHTS + 10 }, (_, i) => lamp(i, 0));
    setCeilingLights(many, "#ffffff");
    expect(ceilingLightUniforms.uCeilingLightCount.value).toBe(MAX_CEILING_LIGHTS);
  });
});
