import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { buildRoomLayout } from "./galleryLayout";
import { resolveWindowOpenings, type WindowPlacement } from "./windowOpenings";
import { WINDOW_SETBACK, buildWindowParts, windowTransmissionMask } from "./windowGeometry";
import { CONCEPT_EXHIBITIONS } from "./conceptRooms";
import { PANORAMA_LIGHT } from "./outdoorPanoramaLight";
import { SUN_MASK_TILE, setSunLight, sunLightUniforms, sunSetupFor, sunTint, sunVisibility } from "./sunLight";
import { glassShare } from "./windowLight";

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
const openings = (over: Partial<WindowPlacement> = {}) => resolveWindowOpenings(room.walls, [win(over)], [0, 0]);

/** Rotation that puts the garden's sun at world azimuth phi' (atan2(z, x)). */
const rotationFor = (phiWorld: number) => PANORAMA_LIGHT.garden.sun!.phi - phiWorld;

describe("transmission mask", () => {
  it("is clear glass between the bars and blocked on the frame and the bars", () => {
    const [o] = openings({ styleId: "modern" });
    const parts = buildWindowParts(o);
    const res = 128;
    const mask = windowTransmissionMask(o, parts, res);
    expect(mask[0]).toBe(0); // frame corner
    for (const b of parts.localBars.filter((b) => b.w < 0.05)) {
      // a vertical bar: the cell under its centre line is mostly blocked
      const i = Math.floor(((b.x + o.width / 2) / o.width) * res);
      expect(mask[(res / 2) * res + i]).toBeLessThan(0.5);
    }
    const p = parts.localPanes[0];
    expect(Math.max(...mask)).toBe(1);
    expect(p.w).toBeGreaterThan(0);
  });

  it("gives a classic window less glass than a panorama one (bars count)", () => {
    expect(glassShare(openings({ styleId: "classic" })[0])).toBeLessThan(glassShare(openings({ styleId: "panorama" })[0]));
  });
});

describe("sun visibility", () => {
  // Sun outside the north window, straight on (phi' = −90°, i.e. toward −z).
  const setup = sunSetupFor(openings(), "garden", rotationFor(-Math.PI / 2));
  const s = setup.direction!;

  it("comes from the panorama's sun, turned by the room's rotation", () => {
    expect(s.z).toBeLessThan(0);
    expect(Math.abs(s.x)).toBeLessThan(1e-9);
    expect(s.y).toBeCloseTo(Math.sin(PANORAMA_LIGHT.garden.sun!.elevation), 9);
  });

  it("lights the floor where the ray through the window's middle lands, and not beside it", () => {
    // Glass plane at z = −4 − setback, window centre y = 2. Follow the sun ray back down to the floor.
    const centre = new THREE.Vector3(0.35, 1.6, -4 - WINDOW_SETBACK); // inside a pane, off the mullion
    const t = centre.y / s.y;
    const floorSpot = centre.clone().addScaledVector(s, -t);
    expect(floorSpot.z).toBeGreaterThan(-4);
    expect(sunVisibility(floorSpot, setup)).toBeGreaterThan(0.9);
    expect(sunVisibility(floorSpot.clone().setX(3), setup)).toBe(0);
    expect(sunVisibility(new THREE.Vector3(0, 0, 3.5), setup)).toBe(0); // far side of the room: shadow
  });

  it("is blocked under a glazing bar", () => {
    const [o] = openings({ styleId: "modern" });
    const modern = sunSetupFor([o], "garden", rotationFor(-Math.PI / 2));
    const bar = buildWindowParts(o).localBars.find((b) => b.w < 0.05)!;
    // A point on the glass plane, under the bar, then traced back to the floor.
    const onGlass = new THREE.Vector3(bar.x, o.center[1], -4 - WINDOW_SETBACK);
    const floor = onGlass.clone().addScaledVector(s, -onGlass.y / s.y);
    expect(sunVisibility(floor, modern)).toBeLessThan(0.5);
  });

  it("gives nothing when the sun is behind the window's wall, or the sky is overcast", () => {
    const behind = sunSetupFor(openings(), "garden", rotationFor(Math.PI / 2));
    expect(sunVisibility(new THREE.Vector3(0, 0, -3), behind)).toBe(0);
    expect(sunSetupFor(openings(), "city", 0).direction).toBeNull();
  });

  it("warms the low sun and keeps the high one near white", () => {
    const low = sunTint(THREE.MathUtils.degToRad(8));
    const high = sunTint(THREE.MathUtils.degToRad(65));
    expect(low[2]).toBeLessThan(high[2]);
    expect(high[1]).toBeGreaterThan(0.95);
  });

  it("writes the atlas and uniforms, and switches off for an overcast room", () => {
    setSunLight(setup);
    expect(sunLightUniforms.uSunWindowCount.value).toBe(1);
    const data = sunLightUniforms.uSunMask.value.image.data as Uint8Array;
    expect(data.length).toBe(SUN_MASK_TILE * SUN_MASK_TILE * 8);
    expect(Math.max(...data.subarray(0, SUN_MASK_TILE * 4 * 10))).toBeLessThanOrEqual(255);
    setSunLight(sunSetupFor(openings(), "city", 0));
    expect(sunLightUniforms.uSunWindowCount.value).toBe(0);
  });
});

describe("vitrin-6 sun", () => {
  const ex = CONCEPT_EXHIBITIONS.find((e) => e.id === "vitrin-6")!;
  const setup = sunSetupFor(ex.customLayout!.windows!, ex.outdoor!.panoramaId, ex.outdoor!.rotationY ?? 0);

  it("stands outside the north windows, so patches fall on the floor in front of them", () => {
    expect(setup.direction!.z).toBeLessThan(-0.2);
    let lit = 0;
    for (let x = -7.5; x <= 7.5; x += 0.1) for (let z = -4.8; z <= -2; z += 0.1) if (sunVisibility(new THREE.Vector3(x, 0, z), setup) > 0.5) lit++;
    expect(lit).toBeGreaterThan(100);
    // …and nowhere near the south half of the room.
    for (let x = -7.5; x <= 7.5; x += 0.5) expect(sunVisibility(new THREE.Vector3(x, 0, 2), setup)).toBe(0);
  });
});
