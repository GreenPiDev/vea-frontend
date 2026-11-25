import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { buildRoomLayout } from "./galleryLayout";
import type { WindowPlacement } from "./windowOpenings";
import { PANORAMA_LIGHT } from "./outdoorPanoramaLight";
import { sunSetupFor, sunVisibility } from "./sunLight";
import { windowFormFactor, windowLightsFor } from "./windowLight";
import { daylightFill, enteringFlux, linearAlbedo, sunBounceLights } from "./daylightBounce";
import { DAYLIGHT_FILL_MAX } from "./sceneLighting";
import { CONCEPT_EXHIBITIONS } from "./__fixtures__/demoRooms";

const layout = buildRoomLayout([10, 8], 4, undefined, undefined, [
  { id: "w", wallId: "north", alongFraction: 0.5, width: 2, height: 2, sillHeight: 1, styleId: "panorama" } satisfies WindowPlacement,
]);
const openings = layout.windows!;
const rotationFor = (phiWorld: number) => PANORAMA_LIGHT.garden.sun!.phi - phiWorld;
const luma = (c: number[]) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

describe("sun-patch bounce", () => {
  const windows = windowLightsFor(openings, "garden", 0);
  const sun = sunSetupFor(openings, "garden", rotationFor(-Math.PI / 2));
  const [bounce] = sunBounceLights(windows, sun, layout, [0.4, 0.3, 0.2]);

  it("is an upward area light on the floor, where the sun patch is", () => {
    expect(bounce.normal.y).toBe(1);
    for (const c of bounce.corners) expect(c.y).toBe(0);
    const centre = bounce.corners.reduce((s, c) => s.add(c), new THREE.Vector3()).multiplyScalar(0.25);
    expect(sunVisibility(centre, sun)).toBeGreaterThan(0.5);
  });

  it("lights the ceiling above it and the wall beside it, but not the floor itself", () => {
    const centre = bounce.corners.reduce((s, c) => s.add(c), new THREE.Vector3()).multiplyScalar(0.25);
    expect(windowFormFactor(centre.clone().setY(3.9), new THREE.Vector3(0, -1, 0), bounce)).toBeGreaterThan(0);
    expect(windowFormFactor(new THREE.Vector3(centre.x, 0.5, -3.84), new THREE.Vector3(0, 0, 1), bounce)).toBeGreaterThan(0);
    expect(windowFormFactor(centre.clone().setX(centre.x + 0.1), new THREE.Vector3(0, 1, 0), bounce)).toBe(0);
  });

  it("is floor-coloured and much dimmer than the window", () => {
    expect(bounce.radiance[0]).toBeGreaterThan(bounce.radiance[2]);
    expect(luma(bounce.radiance)).toBeLessThan(luma(windows[0].radiance));
  });

  it("doesn't exist without sun outside the window", () => {
    expect(sunBounceLights(windows, sunSetupFor(openings, "garden", rotationFor(Math.PI / 2)), layout, [0.5, 0.5, 0.5])).toEqual([]);
    expect(sunBounceLights(windows, sunSetupFor(openings, "city", 0), layout, [0.5, 0.5, 0.5])).toEqual([]);
  });

  it("stays inside the room even when the patch would reach past it", () => {
    for (const c of bounce.corners) {
      expect(Math.abs(c.x)).toBeLessThanOrEqual(5);
      expect(Math.abs(c.z)).toBeLessThanOrEqual(4);
    }
  });
});

describe("daylight fill", () => {
  it("adds sun flux on top of the sky's when the sun shines in", () => {
    const windows = windowLightsFor(openings, "garden", 0);
    const sky = enteringFlux(windows, sunSetupFor(openings, "garden", rotationFor(Math.PI / 2)));
    const sunny = enteringFlux(windows, sunSetupFor(openings, "garden", rotationFor(-Math.PI / 2)));
    expect(luma(sunny)).toBeGreaterThan(luma(sky));
  });

  it("is zero without windows and capped for glass-walled rooms", () => {
    const sun = sunSetupFor([], "garden", 0);
    expect(daylightFill([], sun, layout)).toEqual([0, 0, 0]);
    const v7 = CONCEPT_EXHIBITIONS.find((e) => e.id === "vitrin-7")!;
    const l7 = v7.customLayout!;
    const w7 = windowLightsFor(l7.windows!, "seaside", 0);
    expect(luma(daylightFill(w7, sunSetupFor(l7.windows!, "seaside", 0), l7))).toBeLessThanOrEqual(DAYLIGHT_FILL_MAX + 1e-9);
  });

  it("reads the theme colour as linear albedo", () => {
    expect(linearAlbedo("#ffffff")).toEqual([1, 1, 1]);
    expect(linearAlbedo("#808080")[0]).toBeCloseTo(0.2158, 3);
  });
});
