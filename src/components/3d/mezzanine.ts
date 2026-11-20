// Mezzanine (asma kat) — pure geometry, no rendering (GalleryRoom draws the slab, MezzanineStructure.tsx the
// stair, railings and columns; levels.ts walks on it). Not "Mezzanine.tsx": macOS would clash it with this file.
//
// A mezzanine is a slab inside a double-height room: a rectangle at `top` m (its walk surface), resting on
// the walls it touches and on slim columns along its free edges, with a railing along every free edge and
// one straight stair rising from the room floor to one of those edges. Everything here is room-local
// world metres, same space as RoomLayout.walls.
//
// Walking is split into two levels (levels.ts): the room floor (y = 0) and the slab (y = top). Each level
// has its own collider set:
//   - floor: the walls, the stair's sides, a box across the stair's top end (nobody walks under the slab and
//     into the stair from above), the columns, and the ground furniture;
//   - slab: the uncut walls, the railings, the stair's sides, "void" boxes over every part of the room that
//     isn't slab or stair (so the slab level can't be left except down the stair), and the slab furniture.
// Inside the stair's rectangle the floor height ramps from 0 to `top`; the level flips halfway up.

import type { ColliderBox, PlacedFurnitureInput, WallSegment } from "./galleryLayout";
import { RAILING_COLLIDER, RAILING_INSET, type FloorRect, type RailingRun } from "./balcony";

/** Slab thickness (m): its underside sits this far below `top`. */
export const SLAB_THICKNESS = 0.3;
/** Tread depth (m) and the target riser height the step count is chosen from. */
export const STAIR_GOING = 0.28;
export const STAIR_TARGET_RISER = 0.18;
/** Thickness of a stair side (stringer) collider. */
export const STAIR_SIDE = 0.06;
/** Square steel column section (m) and the widest free span between supports along an edge. */
export const COLUMN_SIZE = 0.16;
export const COLUMN_MAX_SPAN = 4.5;
/** Columns stand this far in from the slab edge. */
export const COLUMN_INSET = 0.25;
/** Thin box across the stair's top end on the room-floor level (blocks walking in from under the slab). */
const STAIR_END_BLOCK = 0.1;
/** Tolerance for "this edge lies on a wall face". */
const ON_WALL_EPS = 0.05;

export interface StairSpec {
  /** World axis the stair climbs along. */
  axis: "x" | "z";
  /** Climbing toward +axis (1) or −axis (−1). */
  dir: 1 | -1;
  /** Extent across the climbing axis (the stair's width), [min, max]. */
  across: [number, number];
  /** Coordinate along `axis` where the stair arrives: the slab edge it lands on. */
  topAt: number;
}

export interface MezzanineSpec {
  /** Slab footprint. Edges lying on a wall's inner face rest on it; the others get a railing (and columns). */
  rect: FloorRect;
  /** Walk surface height (m). */
  top: number;
  stair: StairSpec;
}

export interface Stair {
  axis: "x" | "z";
  dir: 1 | -1;
  across: [number, number];
  /** Along-axis coordinate of the first riser (room floor) and of the arrival edge (slab). */
  bottom: number;
  topAt: number;
  rise: number;
  risers: number;
  /** Tread depth (m). */
  going: number;
  /** Horizontal length bottom → topAt. */
  run: number;
  /** Footprint (stair rectangle). */
  rect: FloorRect;
  /** The two sides, by across coordinate: `open` ones get a railing; the others run along a wall. */
  sides: { at: number; open: boolean }[];
}

export interface Mezzanine {
  rect: FloorRect;
  top: number;
  underside: number;
  stair: Stair;
  /** Railing runs along the slab's free edges (gap where the stair arrives). */
  railings: RailingRun[];
  /** Column centres (x, z) under the free edges. */
  columns: [number, number][];
  /**
   * The slab's exposed edge faces as thin wall pieces (ids "mezz:n" — the ":" gives them world-anchored UVs),
   * rendered and daylight-baked with the walls (GalleryRoom).
   */
  edgeFaces: WallSegment[];
}

/** Depth of an edge-face strip (m), inside the slab's footprint. */
const EDGE_FACE_DEPTH = 0.02;

/** A collider set for one walkable level (levels.ts). */
export interface Level {
  /** Floor height of the level (m). */
  y: number;
  /** Everything the visitor can't walk through on this level. */
  colliders: ColliderBox[];
  /** The same minus furniture — what a routed walk may never pass through (Player's ghost step). */
  walls: ColliderBox[];
}

/** A 3D axis-aligned box: view rays and light rays stop at it (the slab, the stair's bulk). */
export interface SolidBox {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}

type Interval = [number, number];

function wallBox(w: WallSegment): ColliderBox {
  return {
    minX: w.position[0] - w.size[0] / 2,
    maxX: w.position[0] + w.size[0] / 2,
    minZ: w.position[2] - w.size[2] / 2,
    maxZ: w.position[2] + w.size[2] / 2,
  };
}

/** [a, b] minus every interval in `cuts`, in order (pieces shorter than 1 cm dropped). */
export function subtractIntervals([a, b]: Interval, cuts: Interval[]): Interval[] {
  let pieces: Interval[] = [[a, b]];
  for (const [c0, c1] of cuts) {
    pieces = pieces.flatMap(([p0, p1]): Interval[] => {
      if (c1 <= p0 || c0 >= p1) return [[p0, p1]];
      const out: Interval[] = [];
      if (c0 > p0) out.push([p0, c0]);
      if (c1 < p1) out.push([c1, p1]);
      return out;
    });
  }
  return pieces.filter(([p0, p1]) => p1 - p0 > 0.01);
}

/**
 * The stretches of a straight edge that rest on a wall: the edge lies on line `{lineAxis} = line` (e.g. a
 * slab edge at z = −2 has lineAxis "z") and spans [from, to] along the other axis.
 */
function onWallIntervals(walls: WallSegment[], lineAxis: "x" | "z", line: number, [from, to]: Interval): Interval[] {
  const out: Interval[] = [];
  for (const w of walls) {
    const b = wallBox(w);
    const [lo, hi] = lineAxis === "z" ? [b.minZ, b.maxZ] : [b.minX, b.maxX];
    if (line < lo - ON_WALL_EPS || line > hi + ON_WALL_EPS) continue;
    const [s0, s1] = lineAxis === "z" ? [b.minX, b.maxX] : [b.minZ, b.maxZ];
    const a = Math.max(from, s0);
    const c = Math.min(to, s1);
    if (c > a) out.push([a, c]);
  }
  return out;
}

/** Resolves the stair: step count from the rise, its run back from the arrival edge, its footprint. */
export function resolveStair(spec: StairSpec, rise: number, walls: WallSegment[]): Stair {
  const risers = Math.max(2, Math.round(rise / STAIR_TARGET_RISER));
  const run = (risers - 1) * STAIR_GOING;
  const bottom = spec.topAt - spec.dir * run;
  const [a0, a1] = [Math.min(bottom, spec.topAt), Math.max(bottom, spec.topAt)];
  const rect: FloorRect =
    spec.axis === "z"
      ? { minX: spec.across[0], maxX: spec.across[1], minZ: a0, maxZ: a1 }
      : { minX: a0, maxX: a1, minZ: spec.across[0], maxZ: spec.across[1] };
  // A side counts as walled when a wall face covers most of its length.
  const lineAxis = spec.axis === "z" ? "x" : "z";
  const sides = spec.across.map((at) => {
    const covered = onWallIntervals(walls, lineAxis, at, [a0, a1]).reduce((s, [p, q]) => s + (q - p), 0);
    return { at, open: covered < run * 0.5 };
  });
  return { axis: spec.axis, dir: spec.dir, across: spec.across, bottom, topAt: spec.topAt, rise, risers, going: STAIR_GOING, run, rect, sides };
}

/** The slab's edges: line axis/coordinate, span along it, and the inward direction (sign along the line axis). */
function slabEdges(r: FloorRect): { lineAxis: "x" | "z"; line: number; span: Interval; inward: 1 | -1 }[] {
  return [
    { lineAxis: "z", line: r.minZ, span: [r.minX, r.maxX], inward: 1 },
    { lineAxis: "z", line: r.maxZ, span: [r.minX, r.maxX], inward: -1 },
    { lineAxis: "x", line: r.minX, span: [r.minZ, r.maxZ], inward: 1 },
    { lineAxis: "x", line: r.maxX, span: [r.minZ, r.maxZ], inward: -1 },
  ];
}

/** Point on the floor plane from (line axis, line, coordinate along the edge). */
function edgePoint(lineAxis: "x" | "z", line: number, along: number): [number, number] {
  return lineAxis === "z" ? [along, line] : [line, along];
}

export function resolveMezzanine(spec: MezzanineSpec, walls: WallSegment[]): Mezzanine {
  const { rect, top } = spec;
  const stair = resolveStair(spec.stair, top, walls);
  const stairLineAxis = spec.stair.axis; // the arrival edge lies on line {axis} = topAt
  const railings: RailingRun[] = [];
  const columns: [number, number][] = [];
  const edgeFaces: WallSegment[] = [];
  const thickness = SLAB_THICKNESS - 0.004; // a hair inside the top/underside planes (no z-fighting on the strip's top)
  for (const e of slabEdges(rect)) {
    const free = subtractIntervals(e.span, onWallIntervals(walls, e.lineAxis, e.line, e.span));
    if (!free.length) continue;
    for (const [a, b] of free) {
      const across = e.line + (e.inward * EDGE_FACE_DEPTH) / 2;
      const y = top - SLAB_THICKNESS / 2;
      edgeFaces.push(
        e.lineAxis === "z"
          ? { id: `mezz:${edgeFaces.length}`, position: [(a + b) / 2, y, across], size: [b - a, thickness, EDGE_FACE_DEPTH] }
          : { id: `mezz:${edgeFaces.length}`, position: [across, y, (a + b) / 2], size: [EDGE_FACE_DEPTH, thickness, b - a] }
      );
    }
    const arrival = e.lineAxis === stairLineAxis && Math.abs(e.line - stair.topAt) < 1e-6;
    const railed = arrival ? free.flatMap((iv) => subtractIntervals(iv, [stair.across])) : free;
    const railLine = e.line + e.inward * RAILING_INSET;
    for (const [a, b] of railed) railings.push({ from: edgePoint(e.lineAxis, railLine, a), to: edgePoint(e.lineAxis, railLine, b) });
    // Columns: evenly along every free stretch (the stair carries its own landing), never inside the stair.
    const colLine = e.line + e.inward * COLUMN_INSET;
    for (const [a, b] of railed) {
      const n = Math.ceil((b - a) / COLUMN_MAX_SPAN);
      for (let k = 1; k < n; k++) columns.push(edgePoint(e.lineAxis, colLine, a + ((b - a) * k) / n));
      // A free end (not against a wall or the stair) needs its own support.
      for (const end of [a, b]) {
        const walled = onWallIntervals(walls, e.lineAxis, e.line, [end - 0.02, end + 0.02]).length > 0;
        const atStair = arrival && end > stair.across[0] - 0.02 && end < stair.across[1] + 0.02;
        if (!walled && !atStair) {
          const inset = end === a ? COLUMN_INSET : -COLUMN_INSET;
          columns.push(edgePoint(e.lineAxis, colLine, end + inset));
        }
      }
    }
  }
  return { rect, top, underside: top - SLAB_THICKNESS, stair, railings, columns, edgeFaces };
}

/** Under-slab fixtures: one row along the slab, ≤ 4 m apart, 10 cm under its underside. */
export function underSlabFixtures(spec: MezzanineSpec): { x: number; y: number; z: number }[] {
  const r = spec.rect;
  const alongX = spec.stair.axis === "z"; // the slab runs along x when the stair climbs along z
  const [a0, a1] = alongX ? [r.minX, r.maxX] : [r.minZ, r.maxZ];
  const mid = alongX ? (r.minZ + r.maxZ) / 2 : (r.minX + r.maxX) / 2;
  const n = Math.max(1, Math.ceil((a1 - a0) / 4));
  const y = spec.top - SLAB_THICKNESS - 0.1;
  return Array.from({ length: n }, (_, i) => {
    const a = a0 + ((a1 - a0) * (i + 0.5)) / n;
    return alongX ? { x: a, y, z: mid } : { x: mid, y, z: a };
  });
}

// --- Colliders -----------------------------------------------------------------------------------------

/** The stair's two sides as thin boxes along its length. */
export function stairSideBoxes(s: Stair): ColliderBox[] {
  const h = STAIR_SIDE / 2;
  return s.sides.map(({ at }) =>
    s.axis === "z"
      ? { minX: at - h, maxX: at + h, minZ: s.rect.minZ, maxZ: s.rect.maxZ }
      : { minX: s.rect.minX, maxX: s.rect.maxX, minZ: at - h, maxZ: at + h }
  );
}

/** Thin box across the stair's arrival end — on the room floor, the stair can only be entered at its foot. */
export function stairTopEndBox(s: Stair): ColliderBox {
  const h = STAIR_END_BLOCK / 2;
  return s.axis === "z"
    ? { minX: s.across[0], maxX: s.across[1], minZ: s.topAt - h, maxZ: s.topAt + h }
    : { minX: s.topAt - h, maxX: s.topAt + h, minZ: s.across[0], maxZ: s.across[1] };
}

export function columnBoxes(m: Mezzanine): ColliderBox[] {
  const h = COLUMN_SIZE / 2;
  return m.columns.map(([x, z]) => ({ minX: x - h, maxX: x + h, minZ: z - h, maxZ: z + h }));
}

export function mezzanineRailingBoxes(m: Mezzanine): ColliderBox[] {
  const h = RAILING_COLLIDER / 2;
  return m.railings.map(({ from, to }) => ({
    minX: Math.min(from[0], to[0]) - h,
    maxX: Math.max(from[0], to[0]) + h,
    minZ: Math.min(from[1], to[1]) - h,
    maxZ: Math.max(from[1], to[1]) + h,
  }));
}

/** `outer` minus the union of `holes`, as disjoint boxes (grid of every cut coordinate, rows merged). */
export function subtractRects(outer: ColliderBox, holes: ColliderBox[]): ColliderBox[] {
  const clip = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  const xs = [...new Set([outer.minX, outer.maxX, ...holes.flatMap((h) => [clip(h.minX, outer.minX, outer.maxX), clip(h.maxX, outer.minX, outer.maxX)])])].sort((a, b) => a - b);
  const zs = [...new Set([outer.minZ, outer.maxZ, ...holes.flatMap((h) => [clip(h.minZ, outer.minZ, outer.maxZ), clip(h.maxZ, outer.minZ, outer.maxZ)])])].sort((a, b) => a - b);
  const out: ColliderBox[] = [];
  for (let j = 0; j + 1 < zs.length; j++) {
    let run: ColliderBox | null = null;
    for (let i = 0; i + 1 < xs.length; i++) {
      const cx = (xs[i] + xs[i + 1]) / 2;
      const cz = (zs[j] + zs[j + 1]) / 2;
      const covered = holes.some((h) => cx > h.minX && cx < h.maxX && cz > h.minZ && cz < h.maxZ);
      if (covered || xs[i + 1] - xs[i] < 1e-6 || zs[j + 1] - zs[j] < 1e-6) {
        if (run) out.push(run);
        run = null;
      } else if (run) run.maxX = xs[i + 1];
      else run = { minX: xs[i], maxX: xs[i + 1], minZ: zs[j], maxZ: zs[j + 1] };
    }
    if (run) out.push(run);
  }
  return out;
}

function boundsOf(boxes: ColliderBox[]): ColliderBox {
  return {
    minX: Math.min(...boxes.map((b) => b.minX)),
    maxX: Math.max(...boxes.map((b) => b.maxX)),
    minZ: Math.min(...boxes.map((b) => b.minZ)),
    maxZ: Math.max(...boxes.map((b) => b.maxZ)),
  };
}

/** Furniture on the slab (level 1) vs on the room floor. */
export const onSlab = (f: PlacedFurnitureInput) => (f.level ?? 0) === 1;

/**
 * Both walking levels of a room with a mezzanine. `groundColliders`/`groundWalls` are the room's usual
 * sets (walls cut at balcony doors + balcony railings, ± ground furniture); `furnitureBox` turns a slab
 * piece into its collider (galleryLayout's conservative AABB).
 */
export function mezzanineLevels(
  m: Mezzanine,
  walls: WallSegment[],
  groundColliders: ColliderBox[],
  groundWalls: ColliderBox[],
  slabFurniture: ColliderBox[]
): Level[] {
  const sides = stairSideBoxes(m.stair);
  const structure = [...sides, stairTopEndBox(m.stair), ...columnBoxes(m)];
  const solidWalls = walls.map(wallBox);
  const voids = subtractRects(boundsOf(solidWalls), [m.rect, m.stair.rect]);
  const slabWalls = [...solidWalls, ...mezzanineRailingBoxes(m), ...sides, ...voids];
  return [
    { y: 0, colliders: [...groundColliders, ...structure], walls: [...groundWalls, ...structure] },
    { y: m.top, colliders: [...slabWalls, ...slabFurniture], walls: slabWalls },
  ];
}

/** What blocks a view ray: the slab (and nothing else — the stair is open, railings are see-through). */
export function mezzanineBlockers(m: Mezzanine): SolidBox[] {
  return [{ minX: m.rect.minX, maxX: m.rect.maxX, minY: m.underside, maxY: m.top, minZ: m.rect.minZ, maxZ: m.rect.maxZ }];
}

/** Ray parameter where a ray enters `box` (0 if it starts inside), or null when it misses. */
export function rayBoxEntry(
  origin: { x: number; y: number; z: number },
  dir: { x: number; y: number; z: number },
  box: SolidBox
): number | null {
  let t0 = 0;
  let t1 = Infinity;
  for (const [o, d, lo, hi] of [
    [origin.x, dir.x, box.minX, box.maxX],
    [origin.y, dir.y, box.minY, box.maxY],
    [origin.z, dir.z, box.minZ, box.maxZ],
  ] as const) {
    if (Math.abs(d) < 1e-12) {
      if (o < lo || o > hi) return null;
      continue;
    }
    const a = (lo - o) / d;
    const b = (hi - o) / d;
    t0 = Math.max(t0, Math.min(a, b));
    t1 = Math.min(t1, Math.max(a, b));
    if (t0 > t1) return null;
  }
  return t0;
}

/** True when a ray hits any blocker before parameter `t` (with a small tolerance for points on a blocker's face). */
export function blockedBefore(
  origin: { x: number; y: number; z: number },
  dir: { x: number; y: number; z: number },
  t: number,
  blockers: SolidBox[]
): boolean {
  for (const b of blockers) {
    const e = rayBoxEntry(origin, dir, b);
    if (e !== null && e < t - 1e-3) return true;
  }
  return false;
}

// --- Under the slab --------------------------------------------------------------------------------------

/** Share of the room's fill light lost deep under the slab (a low, covered space is darker). */
export const UNDER_SLAB_SHADE = 0.35;
/** How far in from the slab's edge (m) that darkening reaches its full strength. */
export const UNDER_SLAB_REACH = 1;

/** CPU mirror of roomAoMaterial.ts's roomSlabOcclusion() below the slab: indirect-light factor at `p`. */
export function underSlabShade(p: { x: number; y: number; z: number }, m: Pick<Mezzanine, "rect" | "underside"> | null): number {
  if (!m || p.y >= m.underside - 0.01) return 1;
  const r = m.rect;
  const outside = Math.max(r.minX - p.x, p.x - r.maxX, r.minZ - p.z, p.z - r.maxZ);
  const s = Math.min(1, Math.max(0, (outside + UNDER_SLAB_REACH) / (0.3 + UNDER_SLAB_REACH)));
  return 1 - UNDER_SLAB_SHADE * (1 - s * s * (3 - 2 * s));
}

// --- Light visibility (CPU mirror of the shader test in ceilingLight.ts) -------------------------------

/** Soft edge of the slab's shadow (m). */
export const SLAB_SHADOW_SOFTNESS = 0.25;

/**
 * How much of a ceiling fixture's light reaches `p` past the slab: the segment p → light crosses the slab's
 * mid-plane inside its rectangle → 0, with a soft band at the edge. 1 when it doesn't cross the slab.
 */
export function slabVisibility(
  p: { x: number; y: number; z: number },
  light: { x: number; y: number; z: number },
  m: Pick<Mezzanine, "rect" | "top" | "underside"> | null
): number {
  if (!m) return 1;
  const mid = (m.top + m.underside) / 2;
  const a = p.y - mid;
  const b = light.y - mid;
  if (a * b >= 0) return 1;
  const t = a / (a - b);
  const x = p.x + (light.x - p.x) * t;
  const z = p.z + (light.z - p.z) * t;
  // Signed distance outside the rectangle (negative inside).
  const dx = Math.max(m.rect.minX - x, x - m.rect.maxX);
  const dz = Math.max(m.rect.minZ - z, z - m.rect.maxZ);
  const outside = Math.max(dx, dz);
  const s = Math.min(1, Math.max(0, (outside + SLAB_SHADOW_SOFTNESS / 2) / SLAB_SHADOW_SOFTNESS));
  return s * s * (3 - 2 * s);
}
