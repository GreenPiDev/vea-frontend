import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { buildRoomLayout } from "./galleryLayout";
import { resolveWindowOpenings, type WindowPlacement } from "./windowOpenings";
import { WINDOW_SETBACK } from "./windowGeometry";
import { PANORAMA_LIGHT, PANORAMA_LIGHT_GRID_H, PANORAMA_LIGHT_GRID_W } from "./outdoorPanoramaLight";
import { OUTDOOR_PANORAMAS } from "./outdoorPanoramas";
import {
  MAX_WINDOW_LIGHTS,
  glassShare,
  hemisphereRadiance,
  panoramaToWorld,
  setWindowLights,
  windowFormFactor,
  windowLightUniforms,
  windowLightsFor,
} from "./windowLight";

const room = buildRoomLayout([10, 8], 4);
const win = (over: Partial<WindowPlacement> = {}): WindowPlacement => ({
  id: "w",
  wallId: "north",
  alongFraction: 0.5,
  width: 2,
  height: 2,
  sillHeight: 1,
  styleId: "panorama",
  ...over,
});
const lightFor = (over: Partial<WindowPlacement> = {}) =>
  windowLightsFor(resolveWindowOpenings(room.walls, [win(over)], [0, 0]), "garden", 0)[0];

// North window: glass plane at z = -4 - WINDOW_SETBACK, centre y = 2, facing +z.
const glassZ = -4 - WINDOW_SETBACK;
const facingWindow = new THREE.Vector3(0, 0, -1);

describe("window form factor (Lambert polygon)", () => {
  it("is positive for a surface facing the window, ~π right against it", () => {
    const l = lightFor();
    const near = windowFormFactor(new THREE.Vector3(0, 2, glassZ + 0.01), facingWindow, l);
    expect(near).toBeGreaterThan(Math.PI * 0.97);
    expect(near).toBeLessThanOrEqual(Math.PI + 1e-6);
  });

  it("falls off as area·cos/d² far away", () => {
    const l = lightFor();
    const d = 30;
    const far = windowFormFactor(new THREE.Vector3(0, 2, glassZ + d), facingWindow, l);
    expect(far).toBeCloseTo(4 / (d * d), 4);
  });

  it("matches the exact on-axis value for a square", () => {
    // Square of half-side a at distance h, on axis: F·π = 4·(a/√(a²+h²))·atan(a/√(a²+h²)).
    const l = lightFor();
    const a = 1;
    const h = 1.5;
    const s = Math.sqrt(a * a + h * h);
    const exact = 4 * (a / s) * Math.atan(a / s);
    expect(windowFormFactor(new THREE.Vector3(0, 2, glassZ + h), facingWindow, l)).toBeCloseTo(exact, 6);
  });

  it("gives nothing outside the glass plane or to a surface facing away", () => {
    const l = lightFor();
    expect(windowFormFactor(new THREE.Vector3(0, 2, glassZ - 0.5), new THREE.Vector3(0, 0, 1), l)).toBe(0);
    expect(windowFormFactor(new THREE.Vector3(0, 2, 0), new THREE.Vector3(0, 0, 1), l)).toBe(0);
  });

  it("lights the floor in front of the window more than the floor far away", () => {
    const l = lightFor();
    const up = new THREE.Vector3(0, 1, 0);
    const near = windowFormFactor(new THREE.Vector3(0, 0, -3), up, l);
    const far = windowFormFactor(new THREE.Vector3(0, 0, 3), up, l);
    expect(near).toBeGreaterThan(0);
    expect(near).toBeGreaterThan(4 * far);
  });

  it("is positive whichever wall the window is in", () => {
    for (const [wallId, p, n] of [
      ["south", [0, 2, 2], [0, 0, 1]],
      ["east", [2, 2, 0], [1, 0, 0]],
      ["west", [-2, 2, 0], [-1, 0, 0]],
    ] as const) {
      const l = lightFor({ wallId });
      expect(windowFormFactor(new THREE.Vector3(...p), new THREE.Vector3(...n), l), wallId).toBeGreaterThan(0.05);
    }
  });
});

describe("window radiance", () => {
  it("has light data for every panorama, sized to the grid", () => {
    for (const p of OUTDOOR_PANORAMAS) {
      expect(PANORAMA_LIGHT[p.id], p.id).toBeTruthy();
      expect(PANORAMA_LIGHT[p.id].grid).toHaveLength(PANORAMA_LIGHT_GRID_W * PANORAMA_LIGHT_GRID_H * 3);
    }
    expect(PANORAMA_LIGHT.garden.sun).not.toBeNull();
    expect(PANORAMA_LIGHT.seaside.sun).not.toBeNull();
    expect(PANORAMA_LIGHT.city.sun).toBeNull(); // overcast
  });

  it("maps panorama directions like three's equirectUv, turned by the room's rotation", () => {
    expect(panoramaToWorld(0, 0, 0).toArray().map((v) => +v.toFixed(6))).toEqual([1, 0, 0]);
    expect(panoramaToWorld(Math.PI / 2, 0, 0).z).toBeCloseTo(1);
    expect(panoramaToWorld(0, Math.PI / 2, 0).y).toBeCloseTo(1);
    // makeRotationY(π/2) takes +x to −z.
    expect(panoramaToWorld(0, 0, Math.PI / 2).z).toBeCloseTo(-1);
  });

  it("averages what the window faces, so turning the view changes the light", () => {
    const out = new THREE.Vector3(0, 0, -1);
    const a = hemisphereRadiance("seaside", 0, out);
    const b = hemisphereRadiance("seaside", Math.PI, out);
    for (const v of [...a, ...b]) expect(v).toBeGreaterThan(0);
    expect(Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2])).toBeGreaterThan(0.005);
  });

  it("scales by the glass share: bars block light", () => {
    const [o] = resolveWindowOpenings(room.walls, [win({ styleId: "classic" })], [0, 0]);
    const [p] = resolveWindowOpenings(room.walls, [win({ styleId: "panorama" })], [0, 0]);
    const classic = glassShare(o);
    const panorama = glassShare(p);
    expect(classic).toBeGreaterThan(0.4);
    expect(classic).toBeLessThan(panorama);
    expect(panorama).toBeLessThan(1);
    const [lc, lp] = windowLightsFor([o, p], "garden", 0);
    expect(lc.radiance[1]).toBeLessThan(lp.radiance[1]);
  });

  it("writes the room's windows into the shared uniforms and clears them for a room without", () => {
    setWindowLights([lightFor(), lightFor({ wallId: "east" })]);
    expect(windowLightUniforms.uWindowCount.value).toBe(2);
    expect(windowLightUniforms.uWindowCorners.value).toHaveLength(MAX_WINDOW_LIGHTS * 4);
    expect(windowLightUniforms.uWindowNormal.value[1].x).toBe(-1);
    setWindowLights([]);
    expect(windowLightUniforms.uWindowCount.value).toBe(0);
  });
});

describe("rotationForSunDirection", () => {
  it("turns the panorama so its sun lies in the dragged plan direction", async () => {
    const { panoramaToWorld, rotationForSunDirection } = await import("./windowLight");
    for (const [phi, dx, dz] of [
      [0.6413, 1, 0],
      [0.6413, -2, 3],
      [-2.1, 0, -1],
      [3, -1, -1],
    ]) {
      const r = rotationForSunDirection(phi, dx, dz);
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThan(Math.PI * 2);
      const d = panoramaToWorld(phi, 0.4, r);
      const len = Math.hypot(dx, dz);
      expect(d.x / Math.hypot(d.x, d.z)).toBeCloseTo(dx / len, 6);
      expect(d.z / Math.hypot(d.x, d.z)).toBeCloseTo(dz / len, 6);
    }
  });
});
