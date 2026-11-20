import { describe, expect, it } from "vitest";
import { CONCEPT_EXHIBITIONS } from "./conceptRooms";
import { EYE_HEIGHT, buildRoomLayout } from "./galleryLayout";
import { computeArtworkViewpoint, collides, pickArtwork, wallBoxes } from "./clickNavigationGeometry";
import { ceilingIrradiance, ceilingLightsForLayout, fixturePower } from "./ceilingLight";
import { CEILING_LIGHT_FLOOR_IRRADIANCE } from "./sceneLighting";
import {
  SLAB_THICKNESS,
  STAIR_GOING,
  rayBoxEntry,
  slabVisibility,
  subtractRects,
  underSlabShade,
  UNDER_SLAB_SHADE,
  type MezzanineSpec,
} from "./mezzanine";
import {
  artworkLevel,
  collidesOnLevel,
  floorYAt,
  levelAt,
  levelNav,
  moveOnLevels,
  pickMarker,
  planLevelRoute,
  stairT,
  stepTowardOnLevels,
  walkableLevelPoint,
  type LevelNav,
  type LevelPoint,
} from "./levels";
import type { FloorPoint } from "./clickNavigationGeometry";

const ex = CONCEPT_EXHIBITIONS.find((e) => e.id === "vitrin-11")!;
const layout = ex.customLayout!;
const m = layout.mezzanine!;
const nav = levelNav(layout);

/** Walks a route the way Player.tsx does (routed: falls back to the walls-only ghost step). */
function follow(n: LevelNav, from: LevelPoint, points: FloorPoint[], step = 0.05): LevelPoint & { floorY: number; arrived: boolean } {
  let at = { ...from, floorY: floorYAt(n, from.x, from.z, from.level) };
  for (const p of points) {
    for (let i = 0; i < 4000; i++) {
      let s = stepTowardOnLevels(n, at, p, step);
      if (s.blocked) s = stepTowardOnLevels(n, at, p, step, true);
      at = s;
      if (s.arrived) break;
      if (s.blocked) return { ...at, arrived: false };
    }
  }
  const last = points[points.length - 1];
  return { ...at, arrived: Math.hypot(at.x - last.x, at.z - last.z) < 1e-3 };
}

describe("mezzanine geometry (vitrin-11)", () => {
  it("rests on the three walls it touches: railing, edge face and columns only along the free south edge", () => {
    expect(m.top).toBe(3.8);
    expect(m.underside).toBeCloseTo(3.8 - SLAB_THICKNESS, 10);
    // One railing run, from the west wall to the stair's landing (gap where the stair arrives).
    expect(m.railings).toHaveLength(1);
    const [r] = m.railings;
    expect(Math.min(r.from[0], r.to[0])).toBeCloseTo(-8.85, 6);
    expect(Math.max(r.from[0], r.to[0])).toBeCloseTo(7.45, 6);
    expect(r.from[1]).toBeLessThan(-1.85);
    expect(m.edgeFaces).toHaveLength(1);
    expect(m.edgeFaces[0].id).toContain(":");
    // Columns: ≤ 4.5 m spans along the free edge, all under the slab.
    expect(m.columns.length).toBe(3);
    for (const [x, z] of m.columns) {
      expect(z).toBeGreaterThan(m.rect.minZ);
      expect(z).toBeLessThan(m.rect.maxZ);
      expect(x).toBeLessThan(7.45);
    }
  });

  it("builds a straight stair with comfortable steps, walled on the east side and open (railed) on the west", () => {
    const s = m.stair;
    expect(s.rise / s.risers).toBeGreaterThan(0.16);
    expect(s.rise / s.risers).toBeLessThan(0.19);
    expect(s.run).toBeCloseTo((s.risers - 1) * STAIR_GOING, 10);
    expect(s.bottom).toBeCloseTo(-1.85 + s.run, 10);
    expect(s.sides.find((x) => x.at === 7.45)!.open).toBe(true);
    expect(s.sides.find((x) => x.at === 8.85)!.open).toBe(false);
    // The foot leaves room to step on before the south wall.
    expect(s.bottom + 0.6 + 0.4).toBeLessThan(5.85);
  });

  it("subtracts rectangles into disjoint pieces covering exactly the rest", () => {
    const outer = { minX: 0, maxX: 10, minZ: 0, maxZ: 10 };
    const pieces = subtractRects(outer, [
      { minX: 0, maxX: 10, minZ: 0, maxZ: 4 },
      { minX: 8, maxX: 9, minZ: 4, maxZ: 7 },
    ]);
    const area = pieces.reduce((a, p) => a + (p.maxX - p.minX) * (p.maxZ - p.minZ), 0);
    expect(area).toBeCloseTo(100 - 40 - 3, 10);
  });

  it("is absent from rooms without one (single level, unchanged colliders)", () => {
    const plain = buildRoomLayout([10, 8], 4);
    expect(plain.mezzanine).toBeUndefined();
    const n = levelNav(plain);
    expect(n.levels).toHaveLength(1);
    expect(n.levels[0].colliders).toBe(plain.colliders);
    expect(n.stair).toBeNull();
  });
});

describe("walking on two levels", () => {
  const foot: LevelPoint = { x: 8.15, z: 4.4, level: 0 };

  it("climbs the stair from its foot onto the slab and back down", () => {
    let at = { ...foot, floorY: 0 };
    let maxY = 0;
    for (let i = 0; i < 400 && at.z > -3; i++) {
      at = moveOnLevels(nav, at, 0, -0.05);
      maxY = Math.max(maxY, at.floorY);
    }
    expect(at.z).toBeLessThanOrEqual(-3);
    expect(at.level).toBe(1);
    expect(at.floorY).toBe(3.8);
    expect(maxY).toBe(3.8);
    // Mid-stair the floor is halfway up.
    const mid = (m.stair.bottom + m.stair.topAt) / 2;
    expect(floorYAt(nav, 8.15, mid, 0)).toBeCloseTo(1.9, 6);
    for (let i = 0; i < 400 && at.z < 4.4; i++) at = moveOnLevels(nav, at, 0, 0.05);
    expect(at.z).toBeCloseTo(4.4, 6);
    expect(at.level).toBe(0);
    expect(at.floorY).toBe(0);
  });

  it("never enters the stair from its open side, nor from under the slab", () => {
    let at = { x: 6.5, z: 1, level: 0, floorY: 0 };
    for (let i = 0; i < 100; i++) at = moveOnLevels(nav, at, 0.05, 0);
    expect(at.x).toBeLessThan(7.45);
    expect(stairT(nav.stair, at.x, at.z)).toBeNull();
    // Under the slab, walking south into the stair's arrival end.
    at = { x: 8.15, z: -4, level: 0, floorY: 0 };
    for (let i = 0; i < 100; i++) at = moveOnLevels(nav, at, 0, 0.05);
    expect(at.z).toBeLessThan(-1.85);
    expect(at.floorY).toBe(0);
  });

  it("can't walk off the slab", () => {
    for (const [dx, dz] of [
      [0, 0.05],
      [0.05, 0],
      [-0.05, 0],
      [0, -0.05],
    ]) {
      let at = { x: 0, z: -3.5, level: 1, floorY: 3.8 };
      for (let i = 0; i < 400; i++) at = moveOnLevels(nav, at, dx, dz);
      expect(at.level).toBe(1);
      expect(at.floorY).toBe(3.8);
      expect(at.z).toBeLessThan(-1.85);
      expect(at.z).toBeGreaterThan(-5.85);
    }
  });

  it("walks freely under the slab on the room floor (only the columns block)", () => {
    expect(collidesOnLevel(nav, 0, -4, 0)).toBe(false);
    const [cx, cz] = m.columns[0];
    expect(collidesOnLevel(nav, cx, cz, 0)).toBe(true);
    // Just behind it, one level up, is open slab.
    expect(collidesOnLevel(nav, cx, cz - 2.4, 1)).toBe(false);
  });

  it("derives the level from where the camera is", () => {
    expect(levelAt(nav, 0, -4, EYE_HEIGHT)).toBe(0);
    expect(levelAt(nav, 0, -4, 3.8 + EYE_HEIGHT)).toBe(1);
    expect(levelAt(nav, 8.15, m.stair.bottom - 0.1, 0)).toBe(0);
    expect(levelAt(nav, 8.15, m.stair.topAt + 0.3, 0)).toBe(1);
  });

  it("routes from the hall up the stair to a spot on the slab, and back down", () => {
    const from: LevelPoint = { x: 0, z: 4, level: 0 };
    const to: LevelPoint = { x: -4, z: -4, level: 1 };
    const up = planLevelRoute(nav, from, to);
    const end = follow(nav, from, up.points);
    expect(end.arrived).toBe(true);
    expect(end.level).toBe(1);
    expect(end.floorY).toBe(3.8);
    const down = planLevelRoute(nav, to, from);
    const back = follow(nav, to, down.points);
    expect(back.arrived).toBe(true);
    expect(back.level).toBe(0);
  });

  it("reaches every work's viewing spot from the entrance, on the work's own level", () => {
    const start: LevelPoint = { x: layout.playerStart[0], z: layout.playerStart[2], level: 0 };
    for (const a of ex.artworks!) {
      const level = artworkLevel(nav, a);
      expect(level, a.id).toBe(a.floorY ? 1 : 0);
      const vp = computeArtworkViewpoint(a, nav.levels[level].colliders, undefined, level, nav.levels[level].y);
      expect(collidesOnLevel(nav, vp.x, vp.z, level), a.id).toBe(false);
      const end = follow(nav, start, planLevelRoute(nav, start, { x: vp.x, z: vp.z, level }).points);
      expect(end.arrived, a.id).toBe(true);
      expect(end.level, a.id).toBe(level);
      // Looking at the work from that level's eye height.
      expect(Math.abs(vp.pitch), a.id).toBeLessThan(0.5);
    }
  });
});

describe("clicking across levels", () => {
  const walls = wallBoxes(layout);
  const look = (from: [number, number, number], at: [number, number, number]) => {
    const d = [at[0] - from[0], at[1] - from[1], at[2] - from[2]];
    const l = Math.hypot(...d);
    return [{ x: from[0], y: from[1], z: from[2] }, { x: d[0] / l, y: d[1] / l, z: d[2] / l }] as const;
  };

  it("finds the floor on either level, the slab only where it is, and nothing through the slab", () => {
    // From the hall at the floor.
    expect(walkableLevelPoint(nav, ...look([0, EYE_HEIGHT, 4], [0, 0, 1]), walls)).toMatchObject({ level: 0 });
    // From the hall at the floor under the slab (the ray stays below it).
    expect(walkableLevelPoint(nav, ...look([0, EYE_HEIGHT, 0], [0, 0, -4]), walls)).toMatchObject({ level: 0 });
    // From the slab at the slab.
    expect(walkableLevelPoint(nav, ...look([0, 3.8 + EYE_HEIGHT, -3], [-3, 3.8, -4]), walls)).toMatchObject({ level: 1 });
    // From the slab over the railing down into the hall.
    expect(walkableLevelPoint(nav, ...look([0, 3.8 + EYE_HEIGHT, -2.5], [3, 0, 3]), walls)).toMatchObject({ level: 0 });
    // From the slab at the floor under it: the slab is in the way — and its own top is where the ray lands.
    const p = walkableLevelPoint(nav, ...look([0, 3.8 + EYE_HEIGHT, -2.5], [0, 0, -5]), walls);
    expect(p?.level).toBe(1);
    // Looking up from below at the slab: nothing.
    expect(walkableLevelPoint(nav, ...look([0, EYE_HEIGHT, -4], [0, 3.5, -4.5]), walls)).toBeNull();
    // On the stair: nothing (no clicking onto steps).
    expect(walkableLevelPoint(nav, ...look([5, EYE_HEIGHT, 1], [8.15, 0, 1]), walls)).toBeNull();
  });

  it("hides works and markers behind the slab", () => {
    const venus = ex.artworks!.find((a) => a.id.endsWith("birth-of-venus"))!;
    const [vx, vy, vz] = venus.position;
    // From under the slab, looking up at it through the slab: hidden.
    const below = look([vx, EYE_HEIGHT, -3], [vx, vy, vz]);
    expect(pickArtwork(...below, [venus], walls, 0.04, nav.blockers)).toBeNull();
    // From the slab: picked.
    const above = look([vx, 3.8 + EYE_HEIGHT, -3], [vx, vy, vz]);
    expect(pickArtwork(...above, [venus], walls, 0.04, nav.blockers)?.artwork).toBe(venus);
    // Its floor marker sits on the slab: visible from the slab, not through the slab from below.
    const vp = computeArtworkViewpoint(venus, nav.levels[1].colliders, undefined, 1, 3.8);
    const onSlab = look([vx, 3.8 + EYE_HEIGHT, -2.6], [vp.marker.x, 3.8, vp.marker.z]);
    expect(pickMarker(nav, ...onSlab, [vp], 0.3, walls)).toBe(vp);
  });

  it("enters a box at the right ray parameter", () => {
    const box = { minX: -1, maxX: 1, minY: 0, maxY: 1, minZ: -1, maxZ: 1 };
    expect(rayBoxEntry({ x: -3, y: 0.5, z: 0 }, { x: 1, y: 0, z: 0 }, box)).toBeCloseTo(2, 10);
    expect(rayBoxEntry({ x: -3, y: 2, z: 0 }, { x: 1, y: 0, z: 0 }, box)).toBeNull();
  });
});

describe("mezzanine lighting", () => {
  const spec: MezzanineSpec = {
    rect: { minX: -5, maxX: 5, minZ: -5, maxZ: 0 },
    top: 4,
    stair: { axis: "x", dir: 1, across: [1, 2], topAt: -5 },
  };
  const slab = { rect: spec.rect, top: 4, underside: 4 - SLAB_THICKNESS };

  it("shadows a fixture on the other side of the slab, softly at its edge", () => {
    const high = { x: 0, y: 8, z: -2.5 };
    expect(slabVisibility({ x: 0, y: 0, z: -2.5 }, high, slab)).toBe(0);
    expect(slabVisibility({ x: 0, y: 4, z: -2.5 }, high, slab)).toBe(1);
    // Under the slab, a fixture hung from its underside reaches the floor.
    expect(slabVisibility({ x: 0, y: 0, z: -2.5 }, { x: 0, y: 3.6, z: -2.5 }, slab)).toBe(1);
    // … but not the slab's top.
    expect(slabVisibility({ x: 0, y: 4, z: -2.5 }, { x: 0, y: 3.6, z: -2.5 }, slab)).toBe(0);
    // Out in the hall the slab doesn't matter; right at its edge the shadow is half.
    expect(slabVisibility({ x: 0, y: 0, z: 3 }, { x: 0, y: 8, z: 3 }, slab)).toBe(1);
    expect(slabVisibility({ x: 0, y: 0, z: 0 }, { x: 0, y: 8, z: 0 }, slab)).toBeCloseTo(0.5, 6);
    expect(slabVisibility({ x: 0, y: 0, z: -2.5 }, high, null)).toBe(1);
  });

  it("feeds the visibility into the irradiance (the CPU mirror of the shader)", () => {
    const lights = [{ x: 0, y: 8, z: -2.5, power: 10 }];
    const up = { x: 0, y: 1, z: 0 };
    expect(ceilingIrradiance({ x: 0, y: 0, z: -2.5 }, up, lights)).toBeGreaterThan(0);
    expect(ceilingIrradiance({ x: 0, y: 0, z: -2.5 }, up, lights, slab)).toBe(0);
  });

  it("sizes a fixture above the slab for the slab, not the room floor", () => {
    const [over, hall] = ceilingLightsForLayout(
      [
        [0, 8, -2.5],
        [0, 8, 3],
      ],
      0.4,
      slab
    );
    expect(over.power).toBeCloseTo(fixturePower(4, CEILING_LIGHT_FLOOR_IRRADIANCE), 6);
    expect(hall.power).toBeCloseTo(fixturePower(8, CEILING_LIGHT_FLOOR_IRRADIANCE), 6);
  });

  it("dims the fill deep under the slab, not out in the hall nor on the slab", () => {
    expect(underSlabShade({ x: 0, y: 0, z: -3 }, slab)).toBeCloseTo(1 - UNDER_SLAB_SHADE, 6);
    expect(underSlabShade({ x: 0, y: 0, z: 2 }, slab)).toBe(1);
    expect(underSlabShade({ x: 0, y: 4, z: -3 }, slab)).toBe(1);
    const edge = underSlabShade({ x: 0, y: 0, z: -0.2 }, slab);
    expect(edge).toBeGreaterThan(1 - UNDER_SLAB_SHADE);
    expect(edge).toBeLessThan(1);
  });

  it("places the room's under-slab fixtures beneath the slab and the others on the ceiling", () => {
    const under = layout.ceilingSpots.filter(([, y]) => y < m.underside);
    expect(under).toHaveLength(4);
    for (const [, y] of layout.ceilingSpots) if (y >= m.underside) expect(y).toBeCloseTo(layout.wallHeight - 0.1, 6);
  });
});

describe("collides helper sanity", () => {
  it("keeps the visitor's start clear on the room floor", () => {
    expect(collides(layout.playerStart[0], layout.playerStart[2], nav.levels[0].colliders)).toBe(false);
  });
});
