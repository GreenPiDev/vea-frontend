// Daylight step 3 — the light that daylight bounces around the room (what a baked lightmap would add):
//
// 1. Sun-patch bounce: each sun patch on the floor reflects light upward, softly lighting the sill wall,
//    the reveals and (faintly) the ceiling above it. The patch is the window's glass rectangle projected along
//    the sun onto the floor, clamped into the room, and becomes one more upward-facing Lambertian area light
//    in windowLight.ts's arrays (same polygon formula, same shader loop — nothing new on the GPU). Radiance =
//    sun irradiance on the floor × the window's glass share × floor albedo / π.
//
// 2. Room fill (split-flux method from daylighting practice): all daylight entering the room — sky through
//    every window plus direct sun — ends up inter-reflected over the whole room. Its average indirect
//    irradiance is Φ·ρ / (A·(1 − ρ)) with Φ the entering flux, A the room's total surface area and ρ the
//    average reflectance. Added as an extra ambient light (indirect, so room AO still darkens corners).
//    Scaled by DAYLIGHT_FILL_SCALE and capped (DAYLIGHT_FILL_MAX) so a glass pavilion stays a gallery where
//    the picture-lit works remain the brightest things in view.
//
// Pure; tested in daylightBounce.test.ts.

import * as THREE from "three";
import type { RoomLayout } from "./galleryLayout";
import { WALL_THICKNESS } from "./galleryLayout";
import type { SunSetup } from "./sunLight";
import type { WindowLight } from "./windowLight";
import { DAYLIGHT_AVG_REFLECTANCE, DAYLIGHT_FILL_MAX, DAYLIGHT_FILL_SCALE } from "./sceneLighting";

const luma = (c: [number, number, number]) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

/** Linear RGB albedo of a hex colour (the theme's floor colour stands in for a textured floor's average). */
export function linearAlbedo(hex: string): [number, number, number] {
  const c = new THREE.Color(hex);
  return [c.r, c.g, c.b];
}

/** Inner floor rectangle [minX, maxX, minZ, maxZ] (bounding box for a custom room). */
function innerBounds(layout: RoomLayout): [number, number, number, number] {
  const [cx, cz] = layout.room.center;
  const hw = layout.room.size[0] / 2 - WALL_THICKNESS / 2;
  const hd = layout.room.size[1] / 2 - WALL_THICKNESS / 2;
  return [cx - hw, cx + hw, cz - hd, cz + hd];
}

/**
 * One upward-facing area light per sunlit window: its glass rectangle projected onto the floor along the
 * sun. `windows` are windowLightsFor()'s lights, in the same order as the sun setup's windows.
 */
export function sunBounceLights(
  windows: WindowLight[],
  sun: SunSetup,
  layout: RoomLayout,
  floorAlbedo: [number, number, number]
): WindowLight[] {
  const s = sun.direction;
  if (!s || s.y < 0.05) return [];
  const [minX, maxX, minZ, maxZ] = innerBounds(layout);
  const up = new THREE.Vector3(0, 1, 0);
  const out: WindowLight[] = [];
  for (const w of windows.slice(0, sun.windows.length)) {
    if (s.dot(w.normal) >= -1e-4) continue; // sun not outside this window
    const projected = w.corners.map((c) => {
      const p = c.clone().addScaledVector(s, -c.y / s.y);
      return new THREE.Vector3(THREE.MathUtils.clamp(p.x, minX, maxX), 0, THREE.MathUtils.clamp(p.z, minZ, maxZ));
    }) as WindowLight["corners"];
    const [a, b, , d] = projected;
    const area = Math.abs(b.clone().sub(a).cross(d.clone().sub(a)).y);
    if (area < 1e-4) continue;
    // Counter-clockwise seen from above, so the polygon formula comes out positive over the floor.
    const corners: WindowLight["corners"] =
      b.clone().sub(a).cross(d.clone().sub(a)).dot(up) > 0 ? projected : [projected[0], projected[3], projected[2], projected[1]];
    const radiance = sun.color.map((c, i) => (c * s.y * w.share * floorAlbedo[i]) / Math.PI) as [number, number, number];
    out.push({ corners, normal: up, radiance, area, share: 1 });
  }
  return out;
}

/** Total daylight flux entering through the windows (linear RGB, W-like units of this scene). */
export function enteringFlux(windows: WindowLight[], sun: SunSetup): [number, number, number] {
  const flux: [number, number, number] = [0, 0, 0];
  for (const w of windows) for (let i = 0; i < 3; i++) flux[i] += Math.PI * w.radiance[i] * w.area;
  const s = sun.direction;
  if (s) {
    windows.slice(0, sun.windows.length).forEach((w) => {
      const cos = -s.dot(w.normal);
      if (cos <= 0) return;
      for (let i = 0; i < 3; i++) flux[i] += sun.color[i] * cos * w.area * w.share;
    });
  }
  return flux;
}

/** Average inter-reflected daylight (linear RGB irradiance) for the room — the extra ambient fill. */
export function daylightFill(windows: WindowLight[], sun: SunSetup, layout: RoomLayout): [number, number, number] {
  if (!windows.length) return [0, 0, 0];
  const [W, D] = layout.room.size;
  const area = 2 * W * D + 2 * (W + D) * layout.wallHeight;
  const rho = DAYLIGHT_AVG_REFLECTANCE;
  const flux = enteringFlux(windows, sun);
  const fill = flux.map((f) => ((f * rho) / (area * (1 - rho))) * DAYLIGHT_FILL_SCALE) as [number, number, number];
  const y = luma(fill);
  return y > DAYLIGHT_FILL_MAX ? (fill.map((c) => (c * DAYLIGHT_FILL_MAX) / y) as [number, number, number]) : fill;
}
