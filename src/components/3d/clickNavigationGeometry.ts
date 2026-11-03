// Pure geometry behind the click-to-go navigation mode (ClickNavigation.tsx renders/wires it, Player.tsx
// moves the camera). Kept free of React/R3F so it can be unit-tested like galleryLayout.ts.
//
// Everything works on the floor plane (x/z): walls are full height, so "can the visitor see this floor
// point" and "can they walk there in a straight line" both reduce to 2D segment-vs-box tests.

import type { Artwork as ArtworkData } from "./artworks";
import { EYE_HEIGHT, PLAYER_RADIUS, type ColliderBox, type RoomLayout } from "./galleryLayout";

export interface FloorPoint {
  x: number;
  z: number;
}

/** Where to stand to look at a painting, and which way to face. */
export interface ArtworkViewpoint extends FloorPoint {
  artworkId: string;
  /** Floor marker centre — right at the foot of the painting, not at the standing spot (which is metres back). */
  marker: FloorPoint;
  /** Camera yaw (0 = facing -Z), same convention as RoomLayout.playerStartYaw. */
  yaw: number;
  /** Camera pitch (positive = looking up). */
  pitch: number;
}

/**
 * Shared, mutable "go here / look there" request between the input side (ClickNavigation.tsx) and the
 * mover (Player.tsx). A plain object read every frame — no React state, no re-renders while walking.
 */
export interface NavigationRequest {
  target: FloorPoint | null;
  look: { yaw: number; pitch: number } | null;
}

export function createNavigationRequest(): NavigationRequest {
  return { target: null, look: null };
}

/** Painting → visitor distance range (m). The upper bound stays inside ArtworkIconProjector's 3.5 m icon radius. */
const VIEW_DISTANCE_MIN = 1.2;
const VIEW_DISTANCE_MAX = 3.2;
/** Painting → floor marker centre (m): the marker sits at the foot of the work, clear of the wall. */
export const MARKER_DISTANCE = 0.6;
export const PITCH_LIMIT = Math.PI / 2 - 0.05;

export function collides(x: number, z: number, colliders: ColliderBox[], radius = PLAYER_RADIUS): boolean {
  for (const box of colliders) {
    if (x + radius > box.minX && x - radius < box.maxX && z + radius > box.minZ && z - radius < box.maxZ) {
      return true;
    }
  }
  return false;
}

/** The layout's walls as boxes — RoomLayout.colliders also holds furniture, which is low enough to see over. */
export function wallBoxes(layout: Pick<RoomLayout, "walls">): ColliderBox[] {
  return layout.walls.map((w) => ({
    minX: w.position[0] - w.size[0] / 2,
    maxX: w.position[0] + w.size[0] / 2,
    minZ: w.position[2] - w.size[2] / 2,
    maxZ: w.position[2] + w.size[2] / 2,
  }));
}

/** Parameter t ∈ [0, 1] where segment a→b first enters `box` (slab method), or null if it never does. */
export function segmentEntryT(a: FloorPoint, b: FloorPoint, box: ColliderBox): number | null {
  let tMin = 0;
  let tMax = 1;
  const axes: [number, number, number, number][] = [
    [a.x, b.x - a.x, box.minX, box.maxX],
    [a.z, b.z - a.z, box.minZ, box.maxZ],
  ];
  for (const [origin, delta, lo, hi] of axes) {
    if (Math.abs(delta) < 1e-9) {
      if (origin < lo || origin > hi) return null;
      continue;
    }
    let t1 = (lo - origin) / delta;
    let t2 = (hi - origin) / delta;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return null;
  }
  return tMin;
}

/** True if nothing in `boxes` stands between a and b. */
export function hasLineOfSight(a: FloorPoint, b: FloorPoint, boxes: ColliderBox[]): boolean {
  return boxes.every((box) => segmentEntryT(a, b, box) === null);
}

/** Floor point (y = 0) a view ray points at, or null if it points at or above the horizon. */
export function floorPointFromRay(
  origin: { x: number; y: number; z: number },
  dir: { x: number; y: number; z: number }
): FloorPoint | null {
  if (dir.y >= -1e-3) return null;
  const t = -origin.y / dir.y;
  return { x: origin.x + dir.x * t, z: origin.z + dir.z * t };
}

function inside(p: FloorPoint, box: ColliderBox): boolean {
  return p.x > box.minX && p.x < box.maxX && p.z > box.minZ && p.z < box.maxZ;
}

/**
 * The floor point the visitor would walk to for this view ray — or null when the ray isn't actually
 * looking at open floor: above the horizon (a wall or the ceiling), hitting a wall first (walls are full
 * height, so "floor point hidden behind a wall" = "the wall was clicked"), or landing on a piece of
 * furniture's footprint. Clicks on walls/furniture therefore do nothing, and the hover ring hides there.
 */
export function walkableFloorPoint(
  origin: { x: number; y: number; z: number },
  dir: { x: number; y: number; z: number },
  walls: ColliderBox[],
  colliders: ColliderBox[]
): FloorPoint | null {
  const p = floorPointFromRay(origin, dir);
  if (!p) return null;
  if (!hasLineOfSight({ x: origin.x, z: origin.z }, p, walls)) return null;
  if (colliders.some((box) => inside(p, box))) return null;
  return p;
}

/**
 * Standing spot straight in front of a painting: far enough to take the whole work in (scales with its
 * size), pulled closer if that spot would put the visitor inside a wall or a piece of furniture.
 */
export function computeArtworkViewpoint(artwork: ArtworkData, colliders: ColliderBox[]): ArtworkViewpoint {
  const width = artwork.height * artwork.aspect;
  const ideal = Math.min(VIEW_DISTANCE_MAX, Math.max(VIEW_DISTANCE_MIN + 0.4, 0.9 + Math.max(width, artwork.height)));
  // rotationY maps the painting's front (local +Z) to world (sin, 0, cos).
  const nx = Math.sin(artwork.rotationY);
  const nz = Math.cos(artwork.rotationY);
  const [px, py, pz] = artwork.position;

  let distance = ideal;
  for (let d = ideal; d >= VIEW_DISTANCE_MIN - 1e-9; d -= 0.1) {
    distance = d;
    if (!collides(px + nx * d, pz + nz * d, colliders)) break;
  }

  return {
    artworkId: artwork.id,
    marker: { x: px + nx * MARKER_DISTANCE, z: pz + nz * MARKER_DISTANCE },
    x: px + nx * distance,
    z: pz + nz * distance,
    // Facing the painting = looking along -normal; camera forward at yaw ψ is (-sin ψ, -cos ψ).
    yaw: artwork.rotationY,
    pitch: Math.atan2(py - EYE_HEIGHT, distance),
  };
}

/** Painting whose floor marker the floor point lands on (nearest marker wins), or null. Markers hidden behind a wall don't count. */
export function pickViewpoint(
  eye: FloorPoint,
  floorPoint: FloorPoint,
  viewpoints: ArtworkViewpoint[],
  radius: number,
  walls: ColliderBox[]
): ArtworkViewpoint | null {
  let best: ArtworkViewpoint | null = null;
  let bestDistSq = radius * radius;
  for (const vp of viewpoints) {
    const distSq = (vp.marker.x - floorPoint.x) ** 2 + (vp.marker.z - floorPoint.z) ** 2;
    if (distSq > bestDistSq) continue;
    if (!hasLineOfSight(eye, vp.marker, walls)) continue;
    best = vp;
    bestDistSq = distSq;
  }
  return best;
}

/** Shortest signed angle from a to b, in (-π, π]. */
export function angleDelta(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d <= -Math.PI) d += Math.PI * 2;
  return d;
}

export interface StepResult {
  x: number;
  z: number;
  arrived: boolean;
  /** No progress possible (furniture/wall in the way) — the caller should give up on this target. */
  blocked: boolean;
}

/** One frame of walking toward `target`, sliding along obstacles axis by axis (same scheme as WASD movement). */
export function stepToward(from: FloorPoint, target: FloorPoint, maxStep: number, colliders: ColliderBox[]): StepResult {
  const dx = target.x - from.x;
  const dz = target.z - from.z;
  const dist = Math.hypot(dx, dz);
  if (dist <= Math.max(maxStep, 1e-3)) {
    if (!collides(target.x, target.z, colliders)) return { x: target.x, z: target.z, arrived: true, blocked: false };
  }
  const step = Math.min(maxStep, dist);
  const sx = (dx / dist) * step;
  const sz = (dz / dist) * step;
  let x = from.x;
  let z = from.z;
  if (!collides(x + sx, z, colliders)) x += sx;
  if (!collides(x, z + sz, colliders)) z += sz;
  const moved = Math.hypot(x - from.x, z - from.z);
  return { x, z, arrived: false, blocked: moved < step * 0.2 };
}

// --- Drag-to-look inertia ------------------------------------------------------------------------------
// Letting go mid-swipe keeps the view turning in that direction and eases it to a stop, like a phone's
// scroll fling — without it the view stops dead the instant the finger lifts.

export interface LookSample {
  /** Event timestamp (ms). */
  t: number;
  yaw: number;
  pitch: number;
}

/** Only the last stretch of the drag sets the fling speed. */
export const LOOK_SAMPLE_WINDOW_MS = 100;
/** Finger held still this long before lifting → no fling. */
const LOOK_RELEASE_STILL_MS = 60;
/** Fling speed cap (rad/s), so a frantic swipe doesn't spin the room. */
const LOOK_MAX_SPEED = 5;
/** Exponential slow-down rate (1/s): the view coasts about speed / rate radians before stopping. */
export const LOOK_INERTIA_DECAY = 4.5;

/** Angular velocity (rad/s) at release, from recent drag samples (oldest first). */
export function estimateLookVelocity(samples: LookSample[], releaseT: number): { yaw: number; pitch: number } {
  const none = { yaw: 0, pitch: 0 };
  if (samples.length < 2) return none;
  const last = samples[samples.length - 1];
  if (releaseT - last.t > LOOK_RELEASE_STILL_MS) return none;
  const first = samples.find((s) => last.t - s.t <= LOOK_SAMPLE_WINDOW_MS) ?? last;
  const dt = (last.t - first.t) / 1000;
  if (dt < 0.01) return none;
  let yaw = (last.yaw - first.yaw) / dt;
  let pitch = (last.pitch - first.pitch) / dt;
  const speed = Math.hypot(yaw, pitch);
  if (speed > LOOK_MAX_SPEED) {
    yaw *= LOOK_MAX_SPEED / speed;
    pitch *= LOOK_MAX_SPEED / speed;
  }
  return { yaw, pitch };
}

// --- Binocular zoom ------------------------------------------------------------------------------------
// Pinch (touch) / mouse wheel narrows the camera's field of view instead of moving the visitor — a closer
// look at a painting without walking into walls. The zoom persists while walking.

/** Strongest magnification relative to the scene's normal field of view. */
export const MAX_ZOOM = 2.5;

/** FOV (degrees) after magnifying `currentFov` by `scale` (>1 zooms in), clamped to [1×, MAX_ZOOM×] of `baseFov`. */
export function zoomedFov(baseFov: number, currentFov: number, scale: number): number {
  const half = (deg: number) => Math.tan((deg * Math.PI) / 360);
  const baseHalf = half(baseFov);
  const nextHalf = clamp(half(currentFov) / scale, baseHalf / MAX_ZOOM, baseHalf);
  return (Math.atan(nextHalf) * 360) / Math.PI;
}

function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v));
}

// --- Painting picking ----------------------------------------------------------------------------------

/** Ray hit on a painting (frame included): which one, and how far along the ray. */
export interface ArtworkHit {
  artwork: ArtworkData;
  distance: number;
}

/**
 * The painting a view ray points at — the nearest one whose framed rectangle it crosses from the front,
 * with no wall in between. Paintings are flat rectangles on their wall plane, so this is a plane test per
 * painting rather than a scene raycast.
 */
export function pickArtwork(
  origin: { x: number; y: number; z: number },
  dir: { x: number; y: number; z: number },
  artworks: ArtworkData[],
  walls: ColliderBox[],
  frameBorder: number
): ArtworkHit | null {
  let best: ArtworkHit | null = null;
  for (const artwork of artworks) {
    const nx = Math.sin(artwork.rotationY);
    const nz = Math.cos(artwork.rotationY);
    const denom = dir.x * nx + dir.z * nz;
    if (denom >= -1e-6) continue; // looking at it edge-on or from behind
    const [px, py, pz] = artwork.position;
    const t = ((px - origin.x) * nx + (pz - origin.z) * nz) / denom;
    if (t <= 0 || (best && t >= best.distance)) continue;
    const hx = origin.x + dir.x * t;
    const hy = origin.y + dir.y * t;
    const hz = origin.z + dir.z * t;
    // Painting-local right axis = (cos, 0, -sin) — see ArtworkIconProjector.
    const u = (hx - px) * nz - (hz - pz) * nx;
    const border = artwork.frame ? frameBorder : 0;
    const halfW = (artwork.height * artwork.aspect) / 2 + border;
    const halfH = artwork.height / 2 + border;
    if (Math.abs(u) > halfW || Math.abs(hy - py) > halfH) continue;
    // A painting on the far side of a partition: its plane is reachable, the wall comes first.
    const inFront = { x: hx + nx * 0.05, z: hz + nz * 0.05 };
    if (!hasLineOfSight({ x: origin.x, z: origin.z }, inFront, walls)) continue;
    best = { artwork, distance: t };
  }
  return best;
}
