import { describe, expect, it } from 'vitest';
import { buildRoomLayout, EYE_HEIGHT, WALL_THICKNESS } from './galleryLayout';

describe('buildRoomLayout', () => {
  it('produces a fully enclosed rectangular footprint', () => {
    const layout = buildRoomLayout([10, 8], 4);

    expect(layout.walls).toHaveLength(4);
    expect(layout.room.size).toEqual([10, 8]);
    expect(layout.wallHeight).toBe(4);
  });

  it('centers each wall on the room boundary with correct thickness', () => {
    const [W, D] = [10, 8];
    const layout = buildRoomLayout([W, D], 4);

    const north = layout.walls.find((w) => w.id === 'north')!;
    expect(north.position).toEqual([0, 2, -D / 2]);
    expect(north.size).toEqual([W, 4, WALL_THICKNESS]);

    const east = layout.walls.find((w) => w.id === 'east')!;
    expect(east.position).toEqual([W / 2, 2, 0]);
    expect(east.size).toEqual([WALL_THICKNESS, 4, D]);
  });

  it('derives one axis-aligned collider per wall, matching wall bounds', () => {
    const layout = buildRoomLayout([10, 8], 4);

    expect(layout.colliders).toHaveLength(layout.walls.length);

    layout.walls.forEach((wall, i) => {
      const collider = layout.colliders[i];
      expect(collider.minX).toBeCloseTo(wall.position[0] - wall.size[0] / 2);
      expect(collider.maxX).toBeCloseTo(wall.position[0] + wall.size[0] / 2);
      expect(collider.minZ).toBeCloseTo(wall.position[2] - wall.size[2] / 2);
      expect(collider.maxZ).toBeCloseTo(wall.position[2] + wall.size[2] / 2);
    });
  });

  it('spawns the player inside the room at eye height, clear of the south wall', () => {
    const [W, D] = [10, 8];
    const layout = buildRoomLayout([W, D], 4);

    const [x, y, z] = layout.playerStart;
    expect(x).toBe(0);
    expect(y).toBe(EYE_HEIGHT);
    // Must be strictly inside the south wall's collider, not on top of it.
    expect(z).toBeLessThan(D / 2);
    expect(z).toBeGreaterThan(-D / 2);
  });

  it('keeps the ceiling spot grid small regardless of room size (FPS budget)', () => {
    const small = buildRoomLayout([6, 6], 4);
    const large = buildRoomLayout([40, 40], 4);

    // cols/rows are each clamped to [2, 3], so max 3x3 = 9 spots ever.
    expect(small.ceilingSpots.length).toBeLessThanOrEqual(9);
    expect(large.ceilingSpots.length).toBeLessThanOrEqual(9);
  });
});
