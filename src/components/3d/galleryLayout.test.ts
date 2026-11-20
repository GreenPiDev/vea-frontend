import { describe, expect, it } from 'vitest';
import {
  buildRoomLayout,
  buildCustomRoomLayout,
  EYE_HEIGHT,
  WALL_THICKNESS,
  placeArtworksAlongWall,
  slideRange,
  slideClamp,
  clampAlongCenter,
  freeWallIntervals,
  itemsPerInterval,
  WINDOW_ARTWORK_GAP,
  ALONG_EDGE_MARGIN,
  ALONG_NEIGHBOUR_GAP,
  minCeilingFor,
  MIN_CEILING_MARGIN,
  type WallRunGeometry,
  type PlacedFurnitureInput,
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

  it('uses curator-placed ceiling lights verbatim instead of the auto-grid when provided', () => {
    const layout = buildRoomLayout([10, 8], 4, [{ x: 1.5, z: -2 }, { x: -3, z: 3 }]);

    expect(layout.ceilingSpots).toEqual([
      [1.5, 3.9, -2],
      [-3, 3.9, 3],
    ]);
  });

  it('falls back to the auto-grid when ceilingLights is empty', () => {
    const withEmpty = buildRoomLayout([10, 8], 4, []);
    const withNone = buildRoomLayout([10, 8], 4);

    expect(withEmpty.ceilingSpots).toEqual(withNone.ceilingSpots);
  });
});

describe('buildCustomRoomLayout', () => {
  // A simple 2x2 footprint, occupying cells (0,0)-(1,1).
  const cells = [
    { x: 0, z: 0 },
    { x: 1, z: 0 },
    { x: 0, z: 1 },
    { x: 1, z: 1 },
  ];

  it('uses curator-placed ceiling lights verbatim instead of the auto-grid when provided', () => {
    const { layout } = buildCustomRoomLayout(cells, 4, undefined, [{ x: 0.5, z: 0.5 }]);

    expect(layout.ceilingSpots).toEqual([[0.5, 3.9, 0.5]]);
  });

  it('falls back to the footprint-aware auto-grid when ceilingLights is empty or omitted', () => {
    const withEmpty = buildCustomRoomLayout(cells, 4, undefined, []);
    const withNone = buildCustomRoomLayout(cells, 4);

    expect(withEmpty.layout.ceilingSpots).toEqual(withNone.layout.ceilingSpots);
    expect(withNone.layout.ceilingSpots.length).toBeGreaterThan(0);
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

describe('furniture colliders', () => {
  const piece = (rotationY: number): PlacedFurnitureInput => ({
    x: 0,
    z: 0,
    rotationY,
    halfWidth: 0.9,
    halfDepth: 0.4,
  });

  it('adds an axis-aligned collider matching the footprint at rotationY 0', () => {
    const layout = buildRoomLayout([10, 8], 4, undefined, [piece(0)]);
    const collider = layout.colliders[layout.colliders.length - 1];

    expect(collider.minX).toBeCloseTo(-0.9);
    expect(collider.maxX).toBeCloseTo(0.9);
    expect(collider.minZ).toBeCloseTo(-0.4);
    expect(collider.maxZ).toBeCloseTo(0.4);
  });

  it('swaps width/depth extents when rotated 90 degrees', () => {
    const layout = buildRoomLayout([10, 8], 4, undefined, [piece(Math.PI / 2)]);
    const collider = layout.colliders[layout.colliders.length - 1];

    expect(collider.minX).toBeCloseTo(-0.4);
    expect(collider.maxX).toBeCloseTo(0.4);
    expect(collider.minZ).toBeCloseTo(-0.9);
    expect(collider.maxZ).toBeCloseTo(0.9);
  });

  it('produces a wider conservative AABB at a 45 degree rotation', () => {
    const layout = buildRoomLayout([10, 8], 4, undefined, [piece(Math.PI / 4)]);
    const collider = layout.colliders[layout.colliders.length - 1];
    const half = Math.SQRT1_2 * (0.9 + 0.4);

    expect(collider.maxX).toBeCloseTo(half);
    expect(collider.maxZ).toBeCloseTo(half);
  });

  it('also adds furniture colliders to a custom room layout', () => {
    const { layout } = buildCustomRoomLayout([{ x: 0, z: 0 }], 4, undefined, undefined, [piece(0)]);
    const collider = layout.colliders[layout.colliders.length - 1];

    expect(collider.minX).toBeCloseTo(-0.9);
    expect(collider.maxX).toBeCloseTo(0.9);
  });
});

describe('alongFraction (curator-dragged position)', () => {
  const northWall: WallRunGeometry = { orientation: 'horizontal', start: -5, end: 5, fixed: -4, outward: -1 };
  const eastWall: WallRunGeometry = { orientation: 'vertical', start: -4, end: 4, fixed: 5, outward: 1 };

  it('places the artwork center at the fraction of the run, instead of its even slot', () => {
    const [p] = placeArtworksAlongWall(northWall, 4, [{ aspect: 1, height: 1, alongFraction: 0.25 }]);
    expect(p.position[0]).toBeCloseTo(-2.5);
  });

  it('uses the z axis on a vertical wall', () => {
    const [p] = placeArtworksAlongWall(eastWall, 4, [{ aspect: 1, height: 1, alongFraction: 0.75 }]);
    expect(p.position[2]).toBeCloseTo(2);
  });

  it('keeps unset items on their even slots next to a custom one', () => {
    const [a, b] = placeArtworksAlongWall(northWall, 4, [
      { aspect: 1, height: 1, alongFraction: 0.1 },
      { aspect: 1, height: 1 },
    ]);
    expect(a.position[0]).toBeCloseTo(-4);
    expect(b.position[0]).toBeCloseTo(2.5); // slot 1 of 2, untouched
  });

  it('never lets a wide artwork hang off the wall end', () => {
    const [p] = placeArtworksAlongWall(northWall, 4, [{ aspect: 2, height: 1, alongFraction: 1 }]);
    expect(p.position[0] + 1).toBeLessThanOrEqual(5 - ALONG_EDGE_MARGIN + 1e-9);
  });

  it('clampAlongCenter collapses to the midpoint when the artwork cannot fit', () => {
    expect(clampAlongCenter(northWall, 20, 4)).toBe(0);
  });
});

describe('slideRange', () => {
  const wall: WallRunGeometry = { orientation: 'horizontal', start: 0, end: 10, fixed: 0, outward: -1 };
  const widths = [1, 1, 1];
  const centers = [2, 5, 8];

  it('bounds a middle artwork by both neighbours plus the gap', () => {
    const [lo, hi] = slideRange(wall, centers, widths, 1);
    expect(lo).toBeCloseTo(2 + 0.5 + ALONG_NEIGHBOUR_GAP + 0.5);
    expect(hi).toBeCloseTo(8 - 0.5 - ALONG_NEIGHBOUR_GAP - 0.5);
  });

  it('bounds the first/last artwork by the wall ends', () => {
    expect(slideRange(wall, centers, widths, 0)[0]).toBeCloseTo(ALONG_EDGE_MARGIN + 0.5);
    expect(slideRange(wall, centers, widths, 2)[1]).toBeCloseTo(10 - ALONG_EDGE_MARGIN - 0.5);
  });

  it('pins an already-squeezed artwork in place instead of returning an inverted range', () => {
    expect(slideRange(wall, [2, 2.8, 8], widths, 1)[0]).toBeLessThanOrEqual(slideRange(wall, [2, 2.8, 8], widths, 1)[1]);
  });
});

describe('artworks and windows', () => {
  // 10 m wall along x (start −5 … end 5), room on the +z side.
  const run: WallRunGeometry = { orientation: 'horizontal', start: -5, end: 5, fixed: -4, outward: -1 };
  const windowSpan: [number, number] = [-1, 1]; // a 2 m window in the middle
  const square = (n: number) => Array.from({ length: n }, () => ({ aspect: 1, height: 0.8 }));
  const overlapsWindow = (center: number, width: number) =>
    center + width / 2 > windowSpan[0] - WINDOW_ARTWORK_GAP + 1e-9 && center - width / 2 < windowSpan[1] + WINDOW_ARTWORK_GAP - 1e-9;

  it('leaves the free wall on each side of a window', () => {
    expect(freeWallIntervals(run)).toEqual([[-5, 5]]);
    expect(freeWallIntervals(run, [windowSpan])).toEqual([
      [-5, -1 - WINDOW_ARTWORK_GAP],
      [1 + WINDOW_ARTWORK_GAP, 5],
    ]);
    // A window flush against the end leaves nothing there.
    expect(freeWallIntervals(run, [[4, 5]])).toEqual([[-5, 4 - WINDOW_ARTWORK_GAP]]);
  });

  it('shares items out by free length, in wall order', () => {
    expect(itemsPerInterval([[0, 3], [3, 4]], 4)).toEqual([3, 1]);
    expect(itemsPerInterval([[0, 1], [1, 2]], 3).reduce((s, c) => s + c, 0)).toBe(3);
  });

  it.each([1, 2, 3, 4, 5])('keeps %i evenly placed artworks off the window', (n) => {
    const placed = placeArtworksAlongWall(run, 4, square(n), [windowSpan]);
    expect(placed).toHaveLength(n);
    const xs = placed.map((p) => p.position[0]);
    expect([...xs].sort((a, b) => a - b)).toEqual(xs); // wall order kept
    for (const p of placed) expect(overlapsWindow(p.position[0], p.height)).toBe(false);
  });

  it('nudges a dragged artwork off the window to the nearest free side', () => {
    const [onLeftHalf] = placeArtworksAlongWall(run, 4, [{ aspect: 1, height: 0.8, alongFraction: 0.47 }], [windowSpan]);
    expect(onLeftHalf.position[0]).toBeCloseTo(-1 - WINDOW_ARTWORK_GAP - 0.4);
    expect(clampAlongCenter(run, 0.8, 0.6, [windowSpan])).toBeCloseTo(1 + WINDOW_ARTWORK_GAP + 0.4);
  });

  it('hops a dragged artwork over the window, but never past a neighbour', () => {
    const widths = [0.8, 0.8];
    // Work 0 on the left of the window, work 1 far right: dragging work 0 to x = 2 lands it right of the window.
    expect(slideClamp(run, [-3, 4], widths, 0, 2, [windowSpan])).toBeCloseTo(2);
    // Pointer over the glass: the nearer free edge.
    expect(slideClamp(run, [-3, 4], widths, 0, 0.2, [windowSpan])).toBeCloseTo(1 + WINDOW_ARTWORK_GAP + 0.4);
    // A neighbour right after the window leaves no room there: it stays on the left side.
    expect(slideClamp(run, [-3, 2], widths, 0, 2, [windowSpan])).toBeCloseTo(-1 - WINDOW_ARTWORK_GAP - 0.4);
  });

  it('keeps every artwork when the wall is all glass', () => {
    expect(placeArtworksAlongWall(run, 4, square(2), [[-5, 5]])).toHaveLength(2);
  });
});
