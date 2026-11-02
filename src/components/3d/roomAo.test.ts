import { describe, expect, it } from "vitest";
import {
  DEFAULT_AO_FIELD_OPTIONS,
  buildRoomAoField,
  distanceToFurnitureFootprint,
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

  it("keeps furniture occlusion in its own channel", () => {
    const bench: PlacedFurnitureInput = { x: 0, z: 0, rotationY: 0, halfWidth: 0.8, halfDepth: 0.25 };
    const f = buildRoomAoField(layout.room, layout.walls, [bench]);
    // Under the bench: furniture channel at full strength, wall channel untouched.
    expect(sample(f, 0.05, 0.05, 1)).toBeCloseTo(1 - DEFAULT_AO_FIELD_OPTIONS.furniture.strength, 2);
    expect(sample(f, 0.05, 0.05, 0)).toBe(1);
    // Beyond the furniture radius it's unoccluded again.
    expect(sample(f, 0.05, 0.85, 1)).toBe(1);
  });
});
