import { describe, expect, it } from 'vitest';
import {
  buildRoomLayout,
  EYE_HEIGHT,
  WALL_THICKNESS,
  placeArtworksAlongWall,
  minCeilingFor,
  MIN_CEILING_MARGIN,
  type WallRunGeometry,
} from './galleryLayout';

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

describe('placeArtworksAlongWall', () => {
  const northWall: WallRunGeometry = { orientation: 'horizontal', start: -5, end: 5, fixed: -4, outward: -1 };
  const eastWall: WallRunGeometry = { orientation: 'vertical', start: -4, end: 4, fixed: 5, outward: 1 };

  it('returns nothing for an empty wall', () => {
    expect(placeArtworksAlongWall(northWall, 4, [])).toEqual([]);
  });

  it('centers a single artwork on the whole run (matches the original one-artwork-per-wall behavior)', () => {
    const [placement] = placeArtworksAlongWall(northWall, 4, [{ aspect: 1.5, height: 1.6 }]);

    expect(placement.position[0]).toBeCloseTo(0); // (start+end)/2
    expect(placement.rotationY).toBe(0); // outward -1 -> faces +Z into the room
    expect(placement.height).toBeCloseTo(1.6);
  });

  it('splits a wall into N equal slots and centers each artwork in its own slot', () => {
    const placements = placeArtworksAlongWall(northWall, 4, [
      { aspect: 1, height: 1 },
      { aspect: 1, height: 1 },
    ]);

    expect(placements).toHaveLength(2);
    expect(placements[0].position[0]).toBeCloseTo(-2.5); // center of [-5,0]
    expect(placements[1].position[0]).toBeCloseTo(2.5); // center of [0,5]
  });

  it('shrinks a too-wide artwork to fit its slot while preserving aspect ratio', () => {
    // A very wide (low-height, wide-aspect) painting on a short 2m run must shrink.
    const shortWall: WallRunGeometry = { orientation: 'horizontal', start: -1, end: 1, fixed: -4, outward: -1 };
    const [placement] = placeArtworksAlongWall(shortWall, 4, [{ aspect: 3, height: 3 }]);

    const fittedWidth = placement.height * 3;
    // maxWidth = runLength(2) - 2*WALL_CLEARANCE - 0.4, always < runLength
    expect(fittedWidth).toBeLessThan(2);
    expect(placement.height).toBeLessThan(3);
  });

  it('clamps height to the ceiling margin on a low wall', () => {
    const [placement] = placeArtworksAlongWall(northWall, 2, [{ aspect: 1, height: 5 }]);

    expect(placement.height).toBeCloseTo(2 - MIN_CEILING_MARGIN);
  });

  it('uses a curator-set heightYOverride instead of the FLOOR_CLEARANCE formula', () => {
    const [placement] = placeArtworksAlongWall(northWall, 4, [{ aspect: 1, height: 0.6, heightYOverride: 2.0 }]);

    expect(placement.position[1]).toBeCloseTo(2.0);
  });

  it('clamps an out-of-range heightYOverride to the ceiling margin', () => {
    const [placement] = placeArtworksAlongWall(northWall, 3, [{ aspect: 1, height: 1, heightYOverride: 100 }]);

    // wallHeight(3) - height/2(0.5) - CEILING_HEADROOM(0.73)
    expect(placement.position[1]).toBeCloseTo(3 - 0.5 - 0.73);
  });

  it('clamps an out-of-range heightYOverride to never go below the artwork half-height', () => {
    const [placement] = placeArtworksAlongWall(northWall, 4, [{ aspect: 1, height: 1, heightYOverride: -5 }]);

    expect(placement.position[1]).toBeCloseTo(0.5);
  });

  it('orients vertical (east/west) walls to face into the room', () => {
    const [placement] = placeArtworksAlongWall(eastWall, 4, [{ aspect: 1, height: 1 }]);

    expect(placement.position[2]).toBeCloseTo(0); // (start+end)/2
    expect(placement.rotationY).toBeCloseTo(-Math.PI / 2); // outward +1 -> faces -X into the room
  });

  it('minCeilingFor matches MIN_CEILING_MARGIN', () => {
    expect(minCeilingFor(1.8)).toBeCloseTo(1.8 + MIN_CEILING_MARGIN);
  });
});
