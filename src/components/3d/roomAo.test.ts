import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { isRoundFurnitureName } from "./furniture";
import { applyRoomAo, createRoomAoUniforms } from "./roomAoMaterial";
import {
  CEILING_AO,
  DEFAULT_AO_FIELD_OPTIONS,
  FURNITURE_CONTACT,
  FURNITURE_FIELD_RANGE,
  buildRoomAoField,
  ceilingOcclusion,
  contactFootprint,
  decodeFurnitureDistance,
  distanceToFurnitureFootprint,
  encodeFurnitureDistance,
  furnitureContact,
  signedDistanceToFurniture,
  distanceToWallFootprint,
  occlusionAtDistance,
  type AoField,
} from "./roomAo";
import { buildRoomLayout, type PlacedFurnitureInput, type WallSegment } from "./galleryLayout";

const wall: WallSegment = { id: "w", position: [0, 1.5, 0], size: [4, 3, 0.2] };

/** Samples one channel (0 = wall, 1 = furniture) of the texel containing (x, z), as 0..1. */
function sample(field: AoField, x: number, z: number, channel: 0 | 1 = 0) {
  const i = Math.floor(((x - field.minX) / field.sizeX) * field.width);
  const j = Math.floor(((z - field.minZ) / field.sizeZ) * field.height);
  return field.data[(j * field.width + i) * 2 + channel] / 255;
}

describe("distanceToWallFootprint", () => {
  it("is 0 inside the footprint", () => {
    expect(distanceToWallFootprint(1, 0.05, wall)).toBe(0);
  });

  it("measures perpendicular distance from the face", () => {
    expect(distanceToWallFootprint(0, 1.1, wall)).toBeCloseTo(1);
  });

  it("measures diagonal distance past the end cap", () => {
    expect(distanceToWallFootprint(5, 4.1, wall)).toBeCloseTo(5);
  });
});

describe("distanceToFurnitureFootprint", () => {
  const bench: PlacedFurnitureInput = { x: 2, z: 3, rotationY: 0, halfWidth: 1, halfDepth: 0.25 };

  it("is 0 inside the footprint", () => {
    expect(distanceToFurnitureFootprint(2.9, 3.2, bench)).toBe(0);
  });

  it("measures from the long and short sides at rotation 0", () => {
    expect(distanceToFurnitureFootprint(2, 3.75, bench)).toBeCloseTo(0.5);
    expect(distanceToFurnitureFootprint(3.5, 3, bench)).toBeCloseTo(0.5);
  });

  it("follows the piece's rotation (90° turns the long axis onto Z)", () => {
    const turned = { ...bench, rotationY: Math.PI / 2 };
    expect(distanceToFurnitureFootprint(2, 3.9, turned)).toBe(0);
    expect(distanceToFurnitureFootprint(2.75, 3, turned)).toBeCloseTo(0.5);
  });

  it("uses the exact rotated rectangle, not its bounding box", () => {
    const diagonal = { ...bench, rotationY: Math.PI / 4 };
    // A corner of the 45° AABB lies outside the actual rotated bench.
    expect(distanceToFurnitureFootprint(2.7, 3.7, diagonal)).toBeGreaterThan(0.2);
  });
});

describe("occlusionAtDistance", () => {
  it("is 1 - strength at the footprint and 1 at/after the radius", () => {
    expect(occlusionAtDistance(0, 0.7, 0.6)).toBeCloseTo(0.4);
    expect(occlusionAtDistance(0.7, 0.7, 0.6)).toBe(1);
    expect(occlusionAtDistance(5, 0.7, 0.6)).toBe(1);
  });

  it("increases monotonically with distance", () => {
    let prev = -1;
    for (let d = 0; d <= 0.7; d += 0.05) {
      const v = occlusionAtDistance(d, 0.7, 0.6);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });
});

describe("ceilingOcclusion", () => {
  const { radius, strength } = DEFAULT_AO_FIELD_OPTIONS.wall;
  const floorAt = (d: number) => occlusionAtDistance(d, radius, strength);
  const ceilingAt = (d: number) => ceilingOcclusion(floorAt(d));

  it("is unoccluded where the field is", () => {
    expect(ceilingOcclusion(1)).toBe(1);
    expect(ceilingAt(radius)).toBe(1);
  });

  it("is weaker than the floor right at the wall", () => {
    expect(ceilingAt(0)).toBeCloseTo(1 - CEILING_AO.strength);
    expect(ceilingAt(0)).toBeGreaterThan(floorAt(0));
  });

  it("is a narrow band: practically gone a third of a metre out", () => {
    expect(ceilingAt(0.35)).toBeGreaterThan(0.95);
    // The floor is still clearly darkened at the same distance.
    expect(floorAt(0.35)).toBeLessThan(0.75);
  });

  it("never darkens more than the floor and rises monotonically away from the wall", () => {
    let prev = -1;
    for (let d = 0; d <= radius; d += 0.05) {
      const c = ceilingAt(d);
      expect(c).toBeGreaterThanOrEqual(floorAt(d) - 1e-9);
      expect(c).toBeGreaterThanOrEqual(prev);
      prev = c;
    }
  });

  it("tolerates 8-bit quantisation noise outside 0..1", () => {
    expect(ceilingOcclusion(1.01)).toBe(1);
    expect(ceilingOcclusion(0)).toBeCloseTo(1 - CEILING_AO.strength);
  });
});

describe("buildRoomAoField", () => {
  const layout = buildRoomLayout([10, 8], 3.5);
  const field = buildRoomAoField(layout.room, layout.walls);

  it("covers the room footprint at the requested texel size", () => {
    expect(field.width).toBe(100);
    expect(field.height).toBe(80);
    expect(field.data.length).toBe(100 * 80 * 2);
    expect(field.minX).toBe(-5);
    expect(field.minZ).toBe(-4);
  });

  it("is unoccluded in the middle of the room", () => {
    expect(sample(field, 0, 0)).toBe(1);
    expect(sample(field, 0, 0, 1)).toBe(1);
  });

  it("darkens next to a wall and fades out away from it", () => {
    const nearWall = sample(field, 0, -3.85);
    const midway = sample(field, 0, -3.5);
    expect(nearWall).toBeLessThan(midway);
    expect(midway).toBeLessThan(1);
  });

  it("is symmetric for a symmetric room", () => {
    // texel centers (0.1 m grid starting at -5) — mirrored pair
    expect(sample(field, -4.55, 0.05)).toBeCloseTo(sample(field, 4.55, 0.05), 2);
  });

  it("clamps texture size for very large rooms", () => {
    const huge = buildRoomLayout([200, 200], 4);
    const f = buildRoomAoField(huge.room, huge.walls);
    expect(f.width).toBe(512);
    expect(f.height).toBe(512);
  });

  it("darkens around a free-standing partition, not just the outer walls", () => {
    const partition: WallSegment = { id: "p", position: [0, 1.75, 0], size: [3, 3.5, 0.2] };
    const f = buildRoomAoField(layout.room, [...layout.walls, partition]);
    expect(sample(f, 0.05, 0.25)).toBeLessThan(0.8);
  });

  it("keeps furniture contact in its own channel, as a signed distance", () => {
    const bench: PlacedFurnitureInput = { x: 0, z: 0, rotationY: 0, halfWidth: 0.8, halfDepth: 0.25 };
    const f = buildRoomAoField(layout.room, layout.walls, [bench]);
    // Under the bench: deep inside the footprint, wall channel untouched.
    expect(decodeFurnitureDistance(sample(f, 0.05, 0.05, 1))).toBeLessThan(-0.15);
    expect(sample(f, 0.05, 0.05, 0)).toBe(1);
    // Far away it saturates at the encodable maximum, where the contact shadow is gone.
    expect(sample(f, 0.05, 0.85, 1)).toBe(1);
    expect(furnitureContact(decodeFurnitureDistance(1))).toBe(1);
  });
});

describe("furniture contact shadow (Adım 11)", () => {
  const bench: PlacedFurnitureInput = { x: 0, z: 0, rotationY: 0, halfWidth: 0.8, halfDepth: 0.25 };

  it("encodes the signed distance losslessly enough (≤ 2 mm) across its range", () => {
    for (let d = -FURNITURE_FIELD_RANGE.inside; d <= FURNITURE_FIELD_RANGE.outside; d += 0.013) {
      expect(Math.abs(decodeFurnitureDistance(encodeFurnitureDistance(d) / 255) - d)).toBeLessThan(0.002);
    }
    expect(encodeFurnitureDistance(-5)).toBe(0);
    expect(encodeFurnitureDistance(5)).toBe(255);
  });

  it("shrinks the footprint so the shadow doesn't spill past the object as a rectangle", () => {
    const { hw, hd } = contactFootprint(bench);
    expect(hw).toBeCloseTo(0.8 - FURNITURE_CONTACT.inset);
    expect(hd).toBeCloseTo(0.25 - FURNITURE_CONTACT.inset);
    // The model's own edge lies outside the contact footprint.
    expect(signedDistanceToFurniture(0, 0.25, bench)).toBeCloseTo(FURNITURE_CONTACT.inset, 6);
    // Tiny pieces keep a minimum footprint.
    expect(contactFootprint({ ...bench, halfWidth: 0.02, halfDepth: 0.02 }).hw).toBe(FURNITURE_CONTACT.minHalf);
  });

  it("is negative inside, matches the unsigned distance along the flat sides", () => {
    expect(signedDistanceToFurniture(0, 0, bench)).toBeCloseTo(-(0.25 - FURNITURE_CONTACT.inset), 6);
    expect(signedDistanceToFurniture(0, 0.75, bench)).toBeCloseTo(distanceToFurnitureFootprint(0, 0.75, bench) + FURNITURE_CONTACT.inset, 6);
  });

  it("rounds the corners of a box footprint (no sharp rectangle)", () => {
    const { hw, hd } = contactFootprint(bench);
    // At the bounding corner of the inset rectangle the rounded SDF is clearly outside.
    expect(signedDistanceToFurniture(hw, hd, bench)).toBeGreaterThan(0.02);
  });

  it("gives round pieces a disc: equal distance in every direction", () => {
    const vase: PlacedFurnitureInput = { x: 1, z: 1, rotationY: 0.3, halfWidth: 0.2, halfDepth: 0.2, round: true };
    const r = 0.2 - FURNITURE_CONTACT.inset;
    for (let a = 0; a < Math.PI * 2; a += 0.4) {
      expect(signedDistanceToFurniture(1 + Math.cos(a) * 0.5, 1 + Math.sin(a) * 0.5, vase)).toBeCloseTo(0.5 - r, 6);
    }
  });

  it("has a dark narrow core and a wide faint pool", () => {
    const under = furnitureContact(-0.2);
    const edge = furnitureContact(0);
    const near = furnitureContact(0.1);
    const far = furnitureContact(0.3);
    expect(under).toBeLessThan(0.4);
    expect(under).toBeGreaterThan(0.25); // not a black hole
    expect(edge).toBeLessThan(near);
    expect(near - edge).toBeGreaterThan(0.2); // the core drops off sharply within ~10 cm
    expect(far - near).toBeLessThan(near - edge); // then the soft pool fades slowly
    expect(far).toBeLessThan(1);
    expect(furnitureContact(FURNITURE_CONTACT.soft.outer)).toBe(1);
    let prev = 0;
    for (let d = -0.25; d <= 0.6; d += 0.01) {
      const v = furnitureContact(d);
      expect(v).toBeGreaterThanOrEqual(prev - 1e-12);
      prev = v;
    }
  });

  it("darkens only part of the ceiling-fixture light", () => {
    expect(FURNITURE_CONTACT.ceilingLightShare).toBeGreaterThan(0);
    expect(FURNITURE_CONTACT.ceilingLightShare).toBeLessThan(1);
  });

  it("stays smooth across overlapping pieces (union = nearest)", () => {
    const a = { ...bench, x: -0.5 };
    const b = { ...bench, x: 0.5 };
    const layout = buildRoomLayout([10, 8], 3.5);
    const f = buildRoomAoField(layout.room, layout.walls, [a, b]);
    expect(decodeFurnitureDistance(sample(f, 0.05, 0.05, 1))).toBeLessThan(-0.15);
  });
});

describe("round furniture detection + shader wiring", () => {
  it("recognises round bases by name, leaves benches and plinths boxy", () => {
    for (const n of ["Seramik Vazo", "Saksı Bitkisi", "Round side table", "Yuvarlak Kaide", "Amphora"]) {
      expect(isRoundFurnitureName(n)).toBe(true);
    }
    for (const n of ["Antique canape", "Kaide", "Bank", "Sandalye", "Return desk"]) {
      expect(isRoundFurnitureName(n)).toBe(false);
    }
  });

  it("applies the contact shadow to the floor's AO and its ceiling-fixture light", () => {
    const m = new THREE.MeshStandardMaterial();
    const field = buildRoomAoField(buildRoomLayout([4, 4], 3).room, []);
    applyRoomAo(m, "floor", createRoomAoUniforms(field, 3, 0.5));
    const shader = {
      uniforms: {} as Record<string, { value: unknown }>,
      vertexShader: THREE.ShaderLib.physical.vertexShader,
      fragmentShader: THREE.ShaderLib.physical.fragmentShader,
    };
    m.onBeforeCompile(shader as never, null as never);
    expect(shader.fragmentShader).toContain("ao.r * roomFurnitureContact(ao.g)");
    expect(shader.fragmentShader).toContain("* (roomCeilingLightOcclusion())");
  });
});
