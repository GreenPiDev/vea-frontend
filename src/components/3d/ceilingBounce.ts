// First bounce of the ceiling fixtures' light onto the ceiling (2026-11-25).
//
// The fixtures (ceilingLight.ts) are downlights: the ceiling itself gets almost none of their direct light
// (CEILING_LIGHT_UPLIGHT), and its indirect fill is cut on purpose (CEILING_FILL_SCALE). In a real room the
// ceiling is lit by what the floor and walls reflect back up — without that term a light-coloured ceiling
// reads as a dark, muddy lid. This estimates that first bounce once per room, on the CPU:
//
//   E_ceiling = SCALE · ( F · ρ_floor · Ē_floor + (1 − F) · ρ_wall · Ē_wall )
//
// Ē_floor / Ē_wall: average fixture irradiance on the floor and the walls (the exact CPU mirror of the shader
// term, ceilingIrradiance), ρ: their linear albedo (theme colours stand in for a texture's average, same as
// daylightBounce.ts), F: the ceiling → floor view factor of two aligned parallel rectangles (the rest of
// what the ceiling sees is wall). One uniform on the ceiling material, added as direct-diffuse-like light in
// roomAoMaterial.ts — fixed cost, no extra loop per fragment.
//
// Pure; tested in ceilingBounce.test.ts.

import type { RoomLayout } from "./galleryLayout";
import { ceilingIrradiance, type CeilingLight } from "./ceilingLight";
import { CEILING_BOUNCE_DESATURATION, CEILING_BOUNCE_SCALE } from "./sceneLighting";

type Rgb = [number, number, number];

/** Floor samples per axis / wall samples along each wall and up it — enough for a smooth average, once per room. */
const FLOOR_SAMPLES = 16;
const WALL_SAMPLES_ALONG = 16;
const WALL_SAMPLES_UP = 4;

/**
 * View factor between two aligned, parallel, directly opposed rectangles a × b at distance h
 * (standard closed form, e.g. Incropera's view-factor table). → 1 as the room gets wide and low.
 */
export function parallelRectViewFactor(a: number, b: number, h: number): number {
  if (h <= 0) return 1;
  const x = a / h;
  const y = b / h;
  const x2 = 1 + x * x;
  const y2 = 1 + y * y;
  const sx = Math.sqrt(y2);
  const sy = Math.sqrt(x2);
  const f =
    (2 / (Math.PI * x * y)) *
    (Math.log(Math.sqrt((x2 * y2) / (x2 + y2 - 1))) +
      x * sx * Math.atan(x / sx) +
      y * sy * Math.atan(y / sy) -
      x * Math.atan(x) -
      y * Math.atan(y));
  return Math.min(Math.max(f, 0), 1);
}

/** Average fixture irradiance over the floor and over the walls of the room's bounding box. */
export function averageFixtureIrradiance(
  layout: Pick<RoomLayout, "room" | "wallHeight">,
  lights: CeilingLight[]
): { floor: number; wall: number } {
  if (lights.length === 0) return { floor: 0, wall: 0 };
  const [cx, cz] = layout.room.center;
  const [w, d] = layout.room.size;
  const h = layout.wallHeight;
  const up = { x: 0, y: 1, z: 0 };

  let floor = 0;
  for (let i = 0; i < FLOOR_SAMPLES; i++) {
    for (let j = 0; j < FLOOR_SAMPLES; j++) {
      const x = cx - w / 2 + (w * (i + 0.5)) / FLOOR_SAMPLES;
      const z = cz - d / 2 + (d * (j + 0.5)) / FLOOR_SAMPLES;
      floor += ceilingIrradiance({ x, y: 0, z }, up, lights);
    }
  }
  floor /= FLOOR_SAMPLES * FLOOR_SAMPLES;

  // Each wall weighted by its area, sampled just inside it, facing into the room.
  const walls = [
    { from: [cx - w / 2, cz - d / 2], to: [cx + w / 2, cz - d / 2], n: { x: 0, y: 0, z: 1 }, len: w },
    { from: [cx - w / 2, cz + d / 2], to: [cx + w / 2, cz + d / 2], n: { x: 0, y: 0, z: -1 }, len: w },
    { from: [cx - w / 2, cz - d / 2], to: [cx - w / 2, cz + d / 2], n: { x: 1, y: 0, z: 0 }, len: d },
    { from: [cx + w / 2, cz - d / 2], to: [cx + w / 2, cz + d / 2], n: { x: -1, y: 0, z: 0 }, len: d },
  ];
  let wallSum = 0;
  let wallWeight = 0;
  for (const wall of walls) {
    let sum = 0;
    for (let i = 0; i < WALL_SAMPLES_ALONG; i++) {
      const t = (i + 0.5) / WALL_SAMPLES_ALONG;
      const x = wall.from[0] + (wall.to[0] - wall.from[0]) * t;
      const z = wall.from[1] + (wall.to[1] - wall.from[1]) * t;
      for (let k = 0; k < WALL_SAMPLES_UP; k++) {
        const y = (h * (k + 0.5)) / WALL_SAMPLES_UP;
        sum += ceilingIrradiance({ x, y, z }, wall.n, lights);
      }
    }
    wallSum += (sum / (WALL_SAMPLES_ALONG * WALL_SAMPLES_UP)) * wall.len;
    wallWeight += wall.len;
  }
  return { floor, wall: wallWeight > 0 ? wallSum / wallWeight : 0 };
}

/**
 * Irradiance the ceiling gets from the fixtures' light reflected once by the floor and the walls, per linear
 * RGB channel, before the fixtures' own colour (the shader multiplies by uCeilingLightColor).
 */
export function ceilingBounceIrradiance(
  layout: Pick<RoomLayout, "room" | "wallHeight">,
  lights: CeilingLight[],
  floorAlbedo: Rgb,
  wallAlbedo: Rgb
): Rgb {
  const { floor, wall } = averageFixtureIrradiance(layout, lights);
  const f = parallelRectViewFactor(layout.room.size[0], layout.room.size[1], layout.wallHeight);
  const rgb = [0, 1, 2].map(
    (i) => CEILING_BOUNCE_SCALE * (f * floorAlbedo[i] * floor + (1 - f) * wallAlbedo[i] * wall)
  ) as Rgb;
  // Most of the floor's tint is washed out by the further bounces (CEILING_BOUNCE_DESATURATION).
  const luma = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
  return rgb.map((c) => c + (luma - c) * CEILING_BOUNCE_DESATURATION) as Rgb;
}
