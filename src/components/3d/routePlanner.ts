// Route planning for "take me to this painting" walks (the floor markers): find a
// path that goes *around* furniture and partitions instead of the straight-line walk sliding to a stop
// against the first bench. Pure 2D floor-plane math, no React/three — unit-tested like
// clickNavigationGeometry.ts.
//
// Approach: an occupancy grid over the room (cell blocked when the visitor's collision circle, plus a
// small margin, would touch a collider), 8-way A* on it, then string-pulling (keep only the corners the
// visitor can't cut straight past). Built per request, not per frame: a 16 × 11 m room is ~4 400 cells,
// a 40 × 40 m hall ~40 000 — a few ms once per click, nothing while walking.
//
// When no detour exists (a painting fenced in by furniture), it plans against the walls alone and the
// walk passes *through* the furniture in the way (Player.tsx's ghost step, which still collides with
// walls); if even the walls leave no route, it heads straight and stops at the wall.

import { PLAYER_RADIUS, type ColliderBox } from "./galleryLayout";
import {
  clearNavigation,
  collides,
  segmentEntryT,
  type ArtworkViewpoint,
  type FloorPoint,
  type NavigationRequest,
} from "./clickNavigationGeometry";

/** Grid resolution (m). Fine enough for door gaps and the space between benches. */
export const ROUTE_CELL = 0.2;
/** Extra clearance (m) on top of the collision radius, so planned corners never graze an obstacle. */
const ROUTE_MARGIN = 0.05;
/** Hard cap on grid size — a pathological layout falls back to the straight walk instead of stalling a frame. */
const MAX_CELLS = 250_000;

export interface PlannedRoute {
  /** Points to walk through in order; the last one is the destination itself. */
  points: FloorPoint[];
  /**
   * The route crosses furniture (no detour exists) or goes straight because nothing was found — the
   * walker should pass through whatever blocks it rather than give up.
   */
  passThrough: boolean;
}

function inflate(boxes: ColliderBox[], r: number): ColliderBox[] {
  return boxes.map((b) => ({ minX: b.minX - r, maxX: b.maxX + r, minZ: b.minZ - r, maxZ: b.maxZ + r }));
}

/** True when the visitor's circle can move straight from a to b without touching any box (boxes pre-inflated by the radius). */
function clearSegment(a: FloorPoint, b: FloorPoint, inflated: ColliderBox[]): boolean {
  for (const box of inflated) if (segmentEntryT(a, b, box) !== null) return false;
  return true;
}

function pathLength(from: FloorPoint, points: FloorPoint[]): number {
  let len = 0;
  let prev = from;
  for (const p of points) {
    len += Math.hypot(p.x - prev.x, p.z - prev.z);
    prev = p;
  }
  return len;
}

export function routeLength(from: FloorPoint, route: PlannedRoute): number {
  return pathLength(from, route.points);
}

interface Grid {
  minX: number;
  minZ: number;
  cols: number;
  rows: number;
  blocked: Uint8Array;
}

function buildGrid(boxes: ColliderBox[], from: FloorPoint, to: FloorPoint): Grid | null {
  let minX = Math.min(from.x, to.x);
  let maxX = Math.max(from.x, to.x);
  let minZ = Math.min(from.z, to.z);
  let maxZ = Math.max(from.z, to.z);
  for (const b of boxes) {
    minX = Math.min(minX, b.minX);
    maxX = Math.max(maxX, b.maxX);
    minZ = Math.min(minZ, b.minZ);
    maxZ = Math.max(maxZ, b.maxZ);
  }
  minX -= ROUTE_CELL;
  minZ -= ROUTE_CELL;
  const cols = Math.ceil((maxX + ROUTE_CELL - minX) / ROUTE_CELL);
  const rows = Math.ceil((maxZ + ROUTE_CELL - minZ) / ROUTE_CELL);
  if (cols * rows > MAX_CELLS) return null;
  const blocked = new Uint8Array(cols * rows);
  const radius = PLAYER_RADIUS + ROUTE_MARGIN;
  // Rasterise each box's inflated footprint instead of testing every cell against every box.
  for (const b of boxes) {
    const c0 = Math.max(0, Math.floor((b.minX - radius - minX) / ROUTE_CELL));
    const c1 = Math.min(cols - 1, Math.ceil((b.maxX + radius - minX) / ROUTE_CELL));
    const r0 = Math.max(0, Math.floor((b.minZ - radius - minZ) / ROUTE_CELL));
    const r1 = Math.min(rows - 1, Math.ceil((b.maxZ + radius - minZ) / ROUTE_CELL));
    for (let r = r0; r <= r1; r++) {
      const z = minZ + (r + 0.5) * ROUTE_CELL;
      for (let c = c0; c <= c1; c++) {
        const x = minX + (c + 0.5) * ROUTE_CELL;
        if (x + radius > b.minX && x - radius < b.maxX && z + radius > b.minZ && z - radius < b.maxZ) {
          blocked[r * cols + c] = 1;
        }
      }
    }
  }
  return { minX, minZ, cols, rows, blocked };
}

function cellOf(g: Grid, p: FloorPoint): number {
  const c = Math.min(g.cols - 1, Math.max(0, Math.floor((p.x - g.minX) / ROUTE_CELL)));
  const r = Math.min(g.rows - 1, Math.max(0, Math.floor((p.z - g.minZ) / ROUTE_CELL)));
  return r * g.cols + c;
}

function cellCenter(g: Grid, i: number): FloorPoint {
  return { x: g.minX + ((i % g.cols) + 0.5) * ROUTE_CELL, z: g.minZ + (Math.floor(i / g.cols) + 0.5) * ROUTE_CELL };
}

/** Nearest free cell to `start` (ring by ring), or -1 if none within `maxRing` cells. */
function nearestFree(g: Grid, start: number, maxRing = 15): number {
  if (!g.blocked[start]) return start;
  const sc = start % g.cols;
  const sr = Math.floor(start / g.cols);
  for (let ring = 1; ring <= maxRing; ring++) {
    let best = -1;
    let bestD = Infinity;
    for (let dr = -ring; dr <= ring; dr++) {
      for (let dc = -ring; dc <= ring; dc++) {
        if (Math.max(Math.abs(dr), Math.abs(dc)) !== ring) continue;
        const r = sr + dr;
        const c = sc + dc;
        if (r < 0 || c < 0 || r >= g.rows || c >= g.cols) continue;
        const i = r * g.cols + c;
        const d = dr * dr + dc * dc;
        if (!g.blocked[i] && d < bestD) {
          best = i;
          bestD = d;
        }
      }
    }
    if (best >= 0) return best;
  }
  return -1;
}

/** Minimal binary min-heap of cell indices keyed by an external f-score array. */
class Heap {
  private items: number[] = [];
  private readonly f: Float64Array;
  constructor(f: Float64Array) {
    this.f = f;
  }
  get size() {
    return this.items.length;
  }
  push(i: number) {
    const a = this.items;
    a.push(i);
    let k = a.length - 1;
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (this.f[a[p]] <= this.f[a[k]]) break;
      [a[p], a[k]] = [a[k], a[p]];
      k = p;
    }
  }
  pop(): number {
    const a = this.items;
    const top = a[0];
    const last = a.pop()!;
    if (a.length > 0) {
      a[0] = last;
      let k = 0;
      for (;;) {
        const l = 2 * k + 1;
        const r = l + 1;
        let m = k;
        if (l < a.length && this.f[a[l]] < this.f[a[m]]) m = l;
        if (r < a.length && this.f[a[r]] < this.f[a[m]]) m = r;
        if (m === k) break;
        [a[m], a[k]] = [a[k], a[m]];
        k = m;
      }
    }
    return top;
  }
}

const SQRT2 = Math.SQRT2;
const NEIGHBOURS: [number, number, number][] = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, SQRT2],
  [1, -1, SQRT2],
  [-1, 1, SQRT2],
  [-1, -1, SQRT2],
];

/** 8-way A* (no corner cutting) from cell a to cell b; the cell sequence including both ends, or null. */
function aStar(g: Grid, a: number, b: number): number[] | null {
  const n = g.cols * g.rows;
  const gScore = new Float64Array(n).fill(Infinity);
  const fScore = new Float64Array(n).fill(Infinity);
  const came = new Int32Array(n).fill(-1);
  const closed = new Uint8Array(n);
  const bc = b % g.cols;
  const br = Math.floor(b / g.cols);
  const h = (i: number) => {
    const dx = Math.abs((i % g.cols) - bc);
    const dz = Math.abs(Math.floor(i / g.cols) - br);
    return Math.max(dx, dz) + (SQRT2 - 1) * Math.min(dx, dz); // octile
  };
  const open = new Heap(fScore);
  gScore[a] = 0;
  fScore[a] = h(a);
  open.push(a);
  while (open.size > 0) {
    const cur = open.pop();
    if (cur === b) {
      const out = [cur];
      let k = cur;
      while (came[k] >= 0) {
        k = came[k];
        out.push(k);
      }
      return out.reverse();
    }
    if (closed[cur]) continue;
    closed[cur] = 1;
    const cc = cur % g.cols;
    const cr = Math.floor(cur / g.cols);
    for (const [dc, dr, cost] of NEIGHBOURS) {
      const c = cc + dc;
      const r = cr + dr;
      if (c < 0 || r < 0 || c >= g.cols || r >= g.rows) continue;
      const i = r * g.cols + c;
      if (g.blocked[i] || closed[i]) continue;
      // Diagonal only when both orthogonal neighbours are free — no squeezing past a corner.
      if (dc !== 0 && dr !== 0 && (g.blocked[cr * g.cols + c] || g.blocked[r * g.cols + cc])) continue;
      const tentative = gScore[cur] + cost;
      if (tentative < gScore[i]) {
        gScore[i] = tentative;
        fScore[i] = tentative + h(i);
        came[i] = cur;
        open.push(i);
      }
    }
  }
  return null;
}

/** Grid path a → b (snapped to free cells), string-pulled into the corners that matter. Null when unreachable. */
function gridRoute(boxes: ColliderBox[], from: FloorPoint, to: FloorPoint): FloorPoint[] | null {
  const g = buildGrid(boxes, from, to);
  if (!g) return null;
  const start = nearestFree(g, cellOf(g, from));
  const goal = nearestFree(g, cellOf(g, to));
  if (start < 0 || goal < 0) return null;
  const cells = aStar(g, start, goal);
  if (!cells) return null;

  // Raw route: start → cell centres → destination. The first/last cell centres are dropped when the
  // exact endpoints already sit in them, so the walk doesn't zig to a cell centre and back.
  const raw: FloorPoint[] = cells.map((i) => cellCenter(g, i));
  raw.push(to);

  const inflated = inflate(boxes, PLAYER_RADIUS);
  const out: FloorPoint[] = [];
  let anchor = from;
  let i = 0;
  while (i < raw.length) {
    // Farthest point still reachable in a straight line from the anchor; at least the next one.
    let next = i;
    for (let j = raw.length - 1; j > i; j--) {
      if (clearSegment(anchor, raw[j], inflated)) {
        next = j;
        break;
      }
    }
    out.push(raw[next]);
    anchor = raw[next];
    i = next + 1;
  }
  return out;
}

/**
 * Route from `from` to `to`, going around `colliders` (walls + furniture). Falls back to a walls-only
 * route that passes through furniture, then to a straight line — so a destination is always returned.
 */
export function planRoute(from: FloorPoint, to: FloorPoint, colliders: ColliderBox[], walls: ColliderBox[]): PlannedRoute {
  const inflated = inflate(colliders, PLAYER_RADIUS);
  const startFree = !collides(from.x, from.z, colliders);
  if (startFree && clearSegment(from, to, inflated)) return { points: [to], passThrough: false };

  const around = gridRoute(colliders, from, to);
  if (around) return { points: around, passThrough: !startFree };

  const throughFurniture = gridRoute(walls, from, to);
  if (throughFurniture) return { points: throughFurniture, passThrough: true };

  return { points: [to], passThrough: true };
}

/**
 * Floor-marker walks are a quick glide, not a stroll (user request, 2026-11-20): about this long however
 * far the painting is (pace = length / duration), clamped. WASD / free-floor walks keep the 2 m/s pace.
 */
const ROUTE_TARGET_DURATION = 1.2;
export const ROUTE_MIN_SPEED = 4.0;
export const ROUTE_MAX_SPEED = 9.0;

/** Pace (m/s) for a routed walk of this length: quick on short hops, quicker across a hall. */
export function routeSpeed(length: number): number {
  return Math.min(ROUTE_MAX_SPEED, Math.max(ROUTE_MIN_SPEED, length / ROUTE_TARGET_DURATION));
}

/**
 * Send the visitor to a painting's viewing spot along a planned route. The view follows the walking
 * direction around corners and turns to the painting on the final leg (straight away if there's no corner).
 */
export function startRouteWalk(
  nav: NavigationRequest,
  from: FloorPoint,
  viewpoint: ArtworkViewpoint,
  colliders: ColliderBox[],
  walls: ColliderBox[]
): PlannedRoute {
  const target = { x: viewpoint.x, z: viewpoint.z };
  const route = planRoute(from, target, colliders, walls);
  const look = { yaw: viewpoint.yaw, pitch: viewpoint.pitch };
  clearNavigation(nav);
  nav.target = target;
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
