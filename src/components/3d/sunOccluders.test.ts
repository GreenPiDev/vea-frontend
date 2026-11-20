import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  MAX_SUN_OCCLUDERS,
  SUN_OCCLUDER_FRAGMENT_DECL,
  artworkOccluder,
  furnitureOccluder,
  occluderTransmission,
  packSunOccluders,
  removeSunOccluderSource,
  setSunOccluderSource,
  setSunReachTest,
  sunOccluderUniforms,
  writeSunOccluderUniforms,
  type SunOccluder,
} from "./sunOccluders";
import { CONCEPT_EXHIBITIONS } from "./conceptRooms";
import { sunSetupFor, sunVisibility } from "./sunLight";

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
/** Low sun from −x, 20° up. */
const SUN = v(-Math.cos(0.35), Math.sin(0.35), 0).normalize();
/** 1 m cube standing on the floor at the origin. */
const cube: SunOccluder = { center: [0, 0.5, 0], half: [0.5, 0.5, 0.5], rotationY: 0 };

/** Floor point whose ray toward the sun passes through (x0, y0, z) — i.e. the shadow of that point. */
const shadowOf = (x0: number, y0: number, z: number) => v(x0 + y0 / Math.tan(0.35), 0, z);

describe("occluderTransmission", () => {
  it("blocks the floor behind a box and leaves the floor beside it lit", () => {
    expect(occluderTransmission(shadowOf(0, 0.5, 0), SUN, [cube])).toBe(0);
    expect(occluderTransmission(shadowOf(0, 0.5, 1.2), SUN, [cube])).toBe(1);
    // In front of the box (sun side) nothing blocks.
    expect(occluderTransmission(v(-2, 0, 0), SUN, [cube])).toBe(1);
  });

  it("casts a long shadow from a low sun: a 1 m box shades ~2.7 m of floor behind it", () => {
    const len = 1 / Math.tan(0.35);
    // The tip, where rays only clip the box's top edge, fades out over a few decimetres.
    expect(occluderTransmission(v(0.5 + len - 0.4, 0, 0), SUN, [cube])).toBeLessThan(0.5);
    expect(occluderTransmission(v(0.5 + len + 0.05, 0, 0), SUN, [cube])).toBe(1);
  });

  it("softens toward the edge, over a wider band the further the shadow falls from its caster", () => {
    // Even along a face parallel to the sun (the z edges here), the shadow fades in over a band.
    const edge = [0.47, 0.485, 0.495].map((z) => occluderTransmission(shadowOf(0, 0.5, z), SUN, [cube]));
    expect(edge[0]).toBeLessThan(edge[1]);
    expect(edge[1]).toBeLessThan(edge[2]);
    expect(edge[2]).toBeLessThan(1);
    // 2 cm inside the edge: almost hard right behind the box, clearly soft 5 m away.
    const near = occluderTransmission(v(0.6, 0.0, 0.48), SUN, [cube]);
    const far = occluderTransmission(v(0.5, 1, 0.48).addScaledVector(SUN, -5), SUN, [cube]);
    expect(near).toBeLessThan(far);
  });

  it("never shadows a point on or inside its own volume", () => {
    expect(occluderTransmission(v(0.5, 0.9, 0), SUN, [cube])).toBe(1); // sunlit-side-away face
    expect(occluderTransmission(v(0, 0.2, 0), SUN, [cube])).toBe(1);
  });

  it("uses a cylinder for a round piece: the box's corners cast no shadow", () => {
    // Sun from the north-west; a ray passing 0.6 m from the axis crosses the box's corner but misses the r = 0.5 cylinder.
    const sun45 = v(-Math.cos(0.35) * Math.SQRT1_2, Math.sin(0.35), -Math.cos(0.35) * Math.SQRT1_2);
    const through = v(0.6 * Math.SQRT1_2, 0.3, -0.6 * Math.SQRT1_2);
    const floor = through.clone().addScaledVector(sun45, -through.y / sun45.y);
    const round = { ...cube, round: true };
    expect(occluderTransmission(floor, sun45, [cube])).toBe(0);
    expect(occluderTransmission(floor, sun45, [round])).toBe(1);
    expect(occluderTransmission(shadowOf(0, 0.5, 0), SUN, [round])).toBe(0);
  });

  it("follows the volume's yaw", () => {
    // A thin wall 2 m long along z at rotationY 0 blocks the ray at z = 0.8; turned 90° it no longer does.
    const slab: SunOccluder = { center: [0, 0.5, 0], half: [0.05, 0.5, 1], rotationY: 0 };
    const p = shadowOf(0, 0.5, 0.8);
    expect(occluderTransmission(p, SUN, [slab])).toBe(0);
    expect(occluderTransmission(p, SUN, [{ ...slab, rotationY: Math.PI / 2 }])).toBe(1);
  });

  it("scales by opacity", () => {
    expect(occluderTransmission(shadowOf(0, 0.5, 0), SUN, [{ ...cube, opacity: 0.6 }])).toBeCloseTo(0.4, 6);
  });
});

describe("volumes", () => {
  it("place a furniture box at the piece's transform, offset centre turned with it", () => {
    const box = new THREE.Box3(v(0, 0, -0.2), v(1, 0.8, 0.2)); // model origin at its left end
    const o = furnitureOccluder(box, [2, 0, 3], Math.PI / 2, true);
    expect(o.half).toEqual([0.5, 0.4, 0.2]);
    expect(o.center[0]).toBeCloseTo(2, 9);
    expect(o.center[1]).toBeCloseTo(0.4, 9);
    expect(o.center[2]).toBeCloseTo(3 - 0.5, 9); // +x turned by +90° about y → −z
    expect(o.round).toBe(true);
  });

  it("make a painting a slab from the wall face to its front face", () => {
    // South-facing painting (rotationY 0) whose origin is 7 cm off the wall.
    const o = artworkOccluder([1, 1.5, -4.8], 0, 1.2, 0.9, 0.07, 0);
    expect(o.half[2]).toBeCloseTo(0.035, 9);
    expect(o.center[2]).toBeCloseTo(-4.835, 9);
    // Sun grazing the wall from the side: the wall just past the frame edge is shaded, its own canvas isn't.
    const graze = v(-Math.cos(0.2), Math.sin(0.1), Math.sin(0.2)).normalize();
    expect(occluderTransmission(v(1.7, 1.5, -4.87), graze, [o])).toBeLessThan(0.5);
    expect(occluderTransmission(v(1, 1.5, -4.814), graze, [o])).toBe(1);
  });
});

describe("packing", () => {
  const a: SunOccluder = { ...cube, center: [-3, 0.5, 0] };
  const b: SunOccluder = { ...cube, center: [3, 0.5, 0] };

  it("keeps only volumes the sun reaches, in order, capped", () => {
    const reaches = (p: THREE.Vector3) => p.x > 0;
    expect(packSunOccluders([a, b], reaches)).toEqual([b]);
    expect(packSunOccluders([b, b, b], () => true, 2)).toHaveLength(2);
  });

  it("encodes round volumes with a negative opacity and clears the count without sun", () => {
    writeSunOccluderUniforms([{ ...cube, round: true, opacity: 0.5 }, cube]);
    expect(sunOccluderUniforms.uSunOccluderCount.value).toBe(2);
    expect(sunOccluderUniforms.uSunOccluders.value[1].w).toBe(-0.5);
    expect(sunOccluderUniforms.uSunOccluders.value[4].w).toBe(1);
    expect(sunOccluderUniforms.uSunOccluders.value[0].w).toBeCloseTo(Math.hypot(0.5, 0.5, 0.5) + 0.01, 9);

    setSunOccluderSource("test:a", [a, b], 1);
    setSunOccluderSource("test:b", [b], 0);
    setSunReachTest(null);
    expect(sunOccluderUniforms.uSunOccluderCount.value).toBe(0);
    setSunReachTest(() => true);
    expect(sunOccluderUniforms.uSunOccluderCount.value).toBe(3);
    // Lower priority value first: test:b's volume leads.
    expect(sunOccluderUniforms.uSunOccluders.value[0].x).toBe(3);
    removeSunOccluderSource("test:a");
    removeSunOccluderSource("test:b");
    expect(sunOccluderUniforms.uSunOccluderCount.value).toBe(0);
    setSunReachTest(null);
  });

  it("declares a fixed-size array in the shader", () => {
    expect(SUN_OCCLUDER_FRAGMENT_DECL).toContain(`#define MAX_SUN_OCCLUDERS ${MAX_SUN_OCCLUDERS}`);
    expect(SUN_OCCLUDER_FRAGMENT_DECL).toContain("float sunOccluderVisibility(vec3 p, vec3 dir)");
  });
});

describe("vitrin-8 (low sun demo room)", () => {
  const ex = CONCEPT_EXHIBITIONS.find((e) => e.id === "vitrin-8")!;
  const layout = ex.customLayout!;
  const setup = sunSetupFor(layout.windows!, ex.outdoor!.panoramaId, ex.outdoor!.rotationY ?? 0);

  it("has a low sun whose patches reach more than 8 m into the room", () => {
    expect(setup.direction!.y).toBeLessThan(Math.sin(THREE.MathUtils.degToRad(16)));
    let farthest = -Infinity;
    for (let x = -7.8; x <= 7.8; x += 0.2)
      for (let z = -4.8; z <= 4.8; z += 0.2) if (sunVisibility(v(x, 0.01, z), setup) > 0.3) farthest = Math.max(farthest, x);
    expect(farthest - -8).toBeGreaterThan(8);
  });

  it("puts the bench and the pedestal in the sun, so both cast shadows", () => {
    const reaches = (p: THREE.Vector3) => sunVisibility(p, setup) > 0;
    for (const f of ex.furniture!.filter((f) => !f.modelUrl.includes("bitki"))) {
      const box = new THREE.Box3(v(-0.2, 0, -0.2), v(0.2, 0.4, 0.2));
      expect(packSunOccluders([furnitureOccluder(box, f.position, f.rotationY)], reaches), f.modelUrl).toHaveLength(1);
    }
  });

  it("lets the sun fall on a painting (starry-night, on the north wall)", () => {
    const a = ex.artworks!.find((w) => w.id === "vitrin-8-starry-night")!;
    const w = a.height * a.aspect;
    let lit = 0;
    for (let i = 0; i < 5; i++)
      for (let j = 0; j < 5; j++)
        if (sunVisibility(v(a.position[0] + ((i + 0.5) / 5 - 0.5) * w, a.position[1] + ((j + 0.5) / 5 - 0.5) * a.height, a.position[2]), setup) > 0) lit++;
    expect(lit).toBeGreaterThanOrEqual(5);
  });
});
