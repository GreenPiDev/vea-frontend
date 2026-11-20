// Walking on more than one level (a mezzanine, mezzanine.ts): which collider set applies where, the floor
// height under the visitor, crossing the stair, and routes from one level to the other. Pure 2D-plus-height
// math, unit-tested (levels.test.ts) like clickNavigationGeometry.ts / routePlanner.ts.
//
// The level isn't stored anywhere: it's derived from the camera every frame (levelAt) — on the stair from
// how far up it the visitor is, elsewhere from the eye height. So a teleport (ArtworkGoTo) only has to put
// the camera at the right height, and a room without a mezzanine is a single level whose colliders are
// exactly RoomLayout.colliders, as before.

import { EYE_HEIGHT, type ColliderBox, type RoomLayout } from "./galleryLayout";
import type { Artwork } from "./artworks";
import {
  clearNavigation,
  collides,
  wallBoxes,
  type ArtworkViewpoint,
  type FloorPoint,
  type NavigationRequest,
  type StepResult,
} from "./clickNavigationGeometry";
import { planRoute, routeLength, routeSpeed, type PlannedRoute } from "./routePlanner";
import { blockedBefore, mezzanineBlockers, type Level, type SolidBox, type Stair } from "./mezzanine";

/** Everything walking needs to know about a room's levels, built once per layout (levelNav). */
export interface LevelNav {
  levels: Level[];
  stair: Stair | null;
  /** View-ray blockers (the slab). */
  blockers: SolidBox[];
  /** Slab footprint, for "is this point on the mezzanine". */
  slab: { minX: number; maxX: number; minZ: number; maxZ: number } | null;
}

export function levelNav(layout: Pick<RoomLayout, "colliders" | "walls" | "windows" | "levels" | "mezzanine">): LevelNav {
  if (layout.levels && layout.mezzanine) {
    return { levels: layout.levels, stair: layout.mezzanine.stair, blockers: mezzanineBlockers(layout.mezzanine), slab: layout.mezzanine.rect };
  }
  return { levels: [{ y: 0, colliders: layout.colliders, walls: wallBoxes(layout) }], stair: null, blockers: [], slab: null };
}

/** A position on a level. */
export interface LevelPoint extends FloorPoint {
  level: number;
}

/** 0 at the stair's foot … 1 at its arrival edge, or null when (x, z) isn't on the stair. */
export function stairT(s: Stair | null, x: number, z: number): number | null {
  if (!s) return null;
  const r = s.rect;
  if (x <= r.minX || x >= r.maxX || z <= r.minZ || z >= r.maxZ) return null;
  const along = s.axis === "z" ? z : x;
  return Math.min(1, Math.max(0, ((along - s.bottom) * s.dir) / s.run));
}

/** Floor height under (x, z) on `level` — ramping up the stair. */
export function floorYAt(nav: LevelNav, x: number, z: number, level: number): number {
  const t = stairT(nav.stair, x, z);
  if (t !== null && nav.stair) return t * nav.stair.rise;
  return nav.levels[level]?.y ?? 0;
}

/** The level of a visitor whose camera is at (x, eyeY, z): by the stair position on the stair, else by height. */
export function levelAt(nav: LevelNav, x: number, z: number, eyeY: number): number {
  const t = stairT(nav.stair, x, z);
  if (t !== null) return t >= 0.5 ? 1 : 0;
  const feet = eyeY - EYE_HEIGHT;
  let best = 0;
  for (let i = 1; i < nav.levels.length; i++) {
    if (Math.abs(nav.levels[i].y - feet) < Math.abs(nav.levels[best].y - feet)) best = i;
  }
  return best;
}

/** The collider set that applies to a visitor at (x, z) on `level` (on the stair: the half they're on). */
export function collidersAt(nav: LevelNav, x: number, z: number, level: number, ghost = false): ColliderBox[] {
  const t = stairT(nav.stair, x, z);
  const l = nav.levels[t !== null ? (t >= 0.5 ? 1 : 0) : level] ?? nav.levels[0];
  return ghost ? l.walls : l.colliders;
}

function levelAfter(nav: LevelNav, x: number, z: number, level: number): number {
  const t = stairT(nav.stair, x, z);
  return t === null ? level : t >= 0.5 ? 1 : 0;
}

export interface LevelMove extends LevelPoint {
  /** Floor height under the new position. */
  floorY: number;
}

/**
 * One movement step (dx, dz), axis by axis so the visitor slides along walls (same scheme as before levels
 * existed). `ghost`: only walls block (a routed walk passing through furniture).
 */
export function moveOnLevels(nav: LevelNav, from: LevelPoint, dx: number, dz: number, ghost = false): LevelMove {
  let { x, z, level } = from;
  if (dx !== 0 && !collides(x + dx, z, collidersAt(nav, x + dx, z, level, ghost))) {
    x += dx;
    level = levelAfter(nav, x, z, level);
  }
  if (dz !== 0 && !collides(x, z + dz, collidersAt(nav, x, z + dz, level, ghost))) {
    z += dz;
    level = levelAfter(nav, x, z, level);
  }
  return { x, z, level, floorY: floorYAt(nav, x, z, level) };
}

/** True when the visitor's circle at (x, z) on `level` overlaps something. */
export function collidesOnLevel(nav: LevelNav, x: number, z: number, level: number): boolean {
  return collides(x, z, collidersAt(nav, x, z, level));
}

/** One frame of walking toward `target` across levels (the levels-aware stepToward). */
export function stepTowardOnLevels(
  nav: LevelNav,
  from: LevelPoint,
  target: FloorPoint,
  maxStep: number,
  ghost = false
): StepResult & LevelMove {
  const dx = target.x - from.x;
  const dz = target.z - from.z;
  const dist = Math.hypot(dx, dz);
  const step = Math.min(maxStep, dist);
  const move = dist < 1e-9 ? { ...from, floorY: floorYAt(nav, from.x, from.z, from.level) } : moveOnLevels(nav, from, (dx / dist) * step, (dz / dist) * step, ghost);
  const moved = Math.hypot(move.x - from.x, move.z - from.z);
  const arrived = Math.hypot(target.x - move.x, target.z - move.z) < 1e-3;
  return { ...move, arrived, blocked: !arrived && moved < step * 0.2 };
}

// --- Artworks on levels -------------------------------------------------------------------------------

/** Level an artwork is seen from: the one its `floorY` belongs to (0 when unset). */
export function artworkLevel(nav: LevelNav, artwork: Pick<Artwork, "floorY">): number {
  const y = artwork.floorY ?? 0;
  let best = 0;
  for (let i = 1; i < nav.levels.length; i++) if (Math.abs(nav.levels[i].y - y) < Math.abs(nav.levels[best].y - y)) best = i;
  return best;
}

// --- Routes across levels -----------------------------------------------------------------------------

/** Off the stair at its foot / its arrival, and just onto it at either end. */
function stairPoints(s: Stair) {
  const mid = (s.across[0] + s.across[1]) / 2;
  const at = (along: number): FloorPoint => (s.axis === "z" ? { x: mid, z: along } : { x: along, z: mid });
  return {
    footOut: at(s.bottom - s.dir * 0.6),
    footIn: at(s.bottom + s.dir * 0.2),
    headIn: at(s.topAt - s.dir * 0.2),
    headOut: at(s.topAt + s.dir * 0.7),
  };
}

/**
 * Route between two level points: planRoute on the level when both are on it; otherwise to the stair's end
 * on this level, straight along the stair, and on from its other end.
 */
export function planLevelRoute(nav: LevelNav, from: LevelPoint, to: LevelPoint): PlannedRoute {
  const on = (l: number) => nav.levels[l] ?? nav.levels[0];
  if (from.level === to.level || !nav.stair) {
    const l = on(from.level);
    return planRoute(from, to, l.colliders, l.walls);
  }
  const p = stairPoints(nav.stair);
  const up = to.level > from.level;
  const [nearOut, nearIn, farIn, farOut] = up ? [p.footOut, p.footIn, p.headIn, p.headOut] : [p.headOut, p.headIn, p.footIn, p.footOut];
  const first = planRoute(from, nearOut, on(from.level).colliders, on(from.level).walls);
  const last = planRoute(farOut, to, on(to.level).colliders, on(to.level).walls);
  return { points: [...first.points, nearIn, farIn, farOut, ...last.points], passThrough: first.passThrough || last.passThrough };
}

/**
 * Walk to a level point along a planned route (routePlanner.startRouteWalk generalised to levels). `look`:
 * the view to turn to on arrival (a painting), or null to keep facing the way of travel.
 */
export function startLevelRouteWalk(
  nav: NavigationRequest,
  levels: LevelNav,
  from: LevelPoint,
  to: LevelPoint,
  look: { yaw: number; pitch: number } | null
): PlannedRoute {
  const route = planLevelRoute(levels, from, to);
  clearNavigation(nav);
  nav.target = { x: to.x, z: to.z };
  nav.waypoints = route.points.slice(0, -1);
  nav.mustArrive = true;
  nav.speed = routeSpeed(routeLength(from, route));
  if (nav.waypoints.length === 0) nav.look = look;
  else {
    nav.arrivalLook = look;
    nav.faceHeading = true;
  }
  return route;
}

/** Route walk to a painting's viewpoint (its level from the viewpoint). */
export function startViewpointWalk(nav: NavigationRequest, levels: LevelNav, from: LevelPoint, vp: ArtworkViewpoint): PlannedRoute {
  return startLevelRouteWalk(nav, levels, from, { x: vp.x, z: vp.z, level: vp.level ?? 0 }, { yaw: vp.yaw, pitch: vp.pitch });
}

// --- Clicking the floor -------------------------------------------------------------------------------

function inside(p: FloorPoint, box: ColliderBox): boolean {
  return p.x > box.minX && p.x < box.maxX && p.z > box.minZ && p.z < box.maxZ;
}

/**
 * The floor point (and its level) a view ray would walk to: the nearest level plane it reaches — the slab
 * only inside its footprint — that no blocker (the slab's edge/underside) hides, no wall stands in front of,
 * and no collider covers (furniture, railings, the stair). Null otherwise: clicks there do nothing.
 */
export function walkableLevelPoint(
  nav: LevelNav,
  origin: { x: number; y: number; z: number },
  dir: { x: number; y: number; z: number },
  walls: ColliderBox[]
): LevelPoint | null {
  if (dir.y >= -1e-3) return null;
  const hits: { t: number; level: number; p: FloorPoint }[] = [];
  nav.levels.forEach((l, level) => {
    if (origin.y <= l.y) return;
    const t = (l.y - origin.y) / dir.y;
    const p = { x: origin.x + dir.x * t, z: origin.z + dir.z * t };
    if (level > 0 && nav.slab && !inside(p, nav.slab)) return;
    hits.push({ t, level, p });
  });
  hits.sort((a, b) => a.t - b.t);
  const hit = hits[0];
  if (!hit) return null;
  if (blockedBefore(origin, dir, hit.t, nav.blockers)) return null;
  if (!hasWallLineOfSight({ x: origin.x, z: origin.z }, hit.p, walls)) return null;
  if (nav.stair && stairT(nav.stair, hit.p.x, hit.p.z) !== null) return null;
  if (nav.levels[hit.level].colliders.some((box) => inside(hit.p, box))) return null;
  return { ...hit.p, level: hit.level };
}

function hasWallLineOfSight(a: FloorPoint, b: FloorPoint, walls: ColliderBox[]): boolean {
  for (const box of walls) {
    let t0 = 0;
    let t1 = 1;
    let miss = false;
    for (const [o, d, lo, hi] of [
      [a.x, b.x - a.x, box.minX, box.maxX],
      [a.z, b.z - a.z, box.minZ, box.maxZ],
    ] as const) {
      if (Math.abs(d) < 1e-9) {
        if (o < lo || o > hi) miss = true;
        continue;
      }
      const u = (lo - o) / d;
      const v = (hi - o) / d;
      t0 = Math.max(t0, Math.min(u, v));
      t1 = Math.min(t1, Math.max(u, v));
    }
    if (!miss && t0 <= t1) return false;
  }
  return true;
}

/**
 * Painting whose floor marker a view ray points at (nearest to the ray's floor hit on the marker's own
 * level), not hidden behind a wall or the slab.
 */
export function pickMarker(
  nav: LevelNav,
  origin: { x: number; y: number; z: number },
  dir: { x: number; y: number; z: number },
  viewpoints: ArtworkViewpoint[],
  radius: number,
  walls: ColliderBox[]
): ArtworkViewpoint | null {
  if (dir.y >= -1e-3) return null;
  let best: ArtworkViewpoint | null = null;
  let bestDistSq = radius * radius;
  for (const vp of viewpoints) {
    const y = vp.floorY ?? 0;
    if (origin.y <= y) continue;
    const t = (y - origin.y) / dir.y;
    const px = origin.x + dir.x * t;
    const pz = origin.z + dir.z * t;
    const distSq = (vp.marker.x - px) ** 2 + (vp.marker.z - pz) ** 2;
    if (distSq > bestDistSq) continue;
    if (!hasWallLineOfSight({ x: origin.x, z: origin.z }, vp.marker, walls)) continue;
    if (blockedBefore(origin, dir, t, nav.blockers)) continue;
    best = vp;
    bestDistSq = distSq;
  }
  return best;
}
