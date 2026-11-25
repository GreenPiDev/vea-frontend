// Balconies — pure geometry, no rendering (Balconies.tsx draws them, outdoorLight.ts lights them).
//
// A balcony is a window opening of style "balcony" (windowOpenings.ts): a floor-level door cut through a
// perimeter wall, plus a platform outside it (ResolvedBalcony). Unlike a window, the door is walkable:
//
// - the wall's *collider* is cut at the door (solidWallBoxes), so the visitor walks out — the rendered wall
//   pieces already come from splitWallsAroundOpenings like any window;
// - the door's leaves stand open into the room (windowGeometry.ts) and are colliders (doorLeafColliders);
// - the platform gets a glass balustrade on its three free sides (glassBalustrade.ts), and it is a collider
//   too, so nobody walks off the edge;
// - click-to-go treats the railing like a wall for "which floor can I see" (clickNavigationGeometry.ts's
//   wallBoxes), so the ground in the panorama beyond it is never a destination.
//
// The platform floor sits at y = 0, level with the room floor, from the wall's centre line (under the door
// reveal) out to its edge. The facade — the wall's outer face, which nobody saw before a balcony existed — is
// a separate outdoor-lit skin a little proud of the wall (FACADE_OFFSET), holed around every opening on it.

import * as THREE from "three";
import type { ColliderBox, WallSegment } from "./galleryLayout";
import { splitWallAroundOpenings, type WindowOpening } from "./windowOpenings";
import { balconyDoorLeafRects, windowMatrix } from "./windowGeometry";

/** Railing height above the platform (building codes ask ≥ 1.0–1.1 m). */
export const RAILING_HEIGHT = 1.05;
/** Railing centre line, in from the platform's edge — keeps the posts' 12 cm base plates on the slab. */
export const RAILING_INSET = 0.08;
/** Collider thickness of a railing run. */
export const RAILING_COLLIDER = 0.08;
/** Slab thickness under the platform. */
export const BALCONY_SLAB = 0.18;
/** Facade skin in front of the wall's outer face — clears the skirting board (1.5 cm proud) on that face. */
export const FACADE_OFFSET = 0.02;

/** Axis-aligned rectangle on the floor plane. */
export interface FloorRect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** A railing run: a straight line on the floor plane at the platform's edge. */
export interface RailingRun {
  from: [number, number];
  to: [number, number];
}

/** A wall's outer face with a balcony on it, for the facade skin and its sun shadow on the platform. */
export interface Facade {
  wallId: string;
  axis: "x" | "z";
  /** Outward unit normal on the floor plane (x, z). */
  normal: [number, number];
  /** Position of the skin plane along the normal's axis. */
  plane: number;
  /** Extent along the wall's axis. */
  start: number;
  end: number;
  height: number;
}

export interface BalconyGeometry {
  opening: WindowOpening;
  /** Walkable top of the platform, from the wall's outer face to its edge. */
  floor: FloorRect;
  /** Slab footprint: also covers the outer half of the wall under the door, from the wall's centre line. */
  slab: FloorRect;
  railings: RailingRun[];
}

const isBalcony = (o: WindowOpening): o is WindowOpening & { balcony: NonNullable<WindowOpening["balcony"]> } => !!o.balcony;

function rect(axis: "x" | "z", a0: number, a1: number, n0: number, n1: number): FloorRect {
  const [lo, hi] = n0 < n1 ? [n0, n1] : [n1, n0];
  return axis === "x" ? { minX: a0, maxX: a1, minZ: lo, maxZ: hi } : { minX: lo, maxX: hi, minZ: a0, maxZ: a1 };
}

/** Point on the floor plane from (along the wall, across it). */
function pt(axis: "x" | "z", along: number, across: number): [number, number] {
  return axis === "x" ? [along, across] : [across, along];
}

/** Platform, slab and railing runs of every balcony among `openings`. */
export function balconyGeometries(openings: WindowOpening[] | undefined): BalconyGeometry[] {
  return (openings ?? []).filter(isBalcony).map((o) => {
    const b = o.balcony;
    const out = o.axis === "x" ? -o.inward[1] : -o.inward[0];
    const centre = o.axis === "x" ? o.center[2] : o.center[0];
    const face = centre + (out * o.depth) / 2;
    const edge = face + out * b.depth;
    const a0 = b.along - b.width / 2;
    const a1 = b.along + b.width / 2;
    const rail = edge - out * RAILING_INSET;
    const r0 = a0 + RAILING_INSET;
    const r1 = a1 - RAILING_INSET;
    return {
      opening: o,
      floor: rect(o.axis, a0, a1, face, edge),
      slab: rect(o.axis, a0, a1, centre, edge),
      railings: [
        { from: pt(o.axis, r0, face), to: pt(o.axis, r0, rail) },
        { from: pt(o.axis, r0, rail), to: pt(o.axis, r1, rail) },
        { from: pt(o.axis, r1, rail), to: pt(o.axis, r1, face) },
      ],
    };
  });
}

/** Colliders along every railing run. */
export function railingColliders(balconies: BalconyGeometry[]): ColliderBox[] {
  const h = RAILING_COLLIDER / 2;
  return balconies.flatMap((b) =>
    b.railings.map(({ from, to }) => ({
      minX: Math.min(from[0], to[0]) - h,
      maxX: Math.max(from[0], to[0]) + h,
      minZ: Math.min(from[1], to[1]) - h,
      maxZ: Math.max(from[1], to[1]) + h,
    }))
  );
}

/**
 * The open leaves of every balcony door (windowGeometry.ts's French door stands open 90° into the room) as
 * colliders — nobody walks through a door leaf. The doorway between them stays walkable.
 */
export function doorLeafColliders(openings: WindowOpening[] | undefined): ColliderBox[] {
  const v = new THREE.Vector3();
  return (openings ?? []).filter(isBalcony).flatMap((o) => {
    const m = windowMatrix(o);
    return balconyDoorLeafRects(o.width, o.height).map((r) => {
      const xs: number[] = [];
      const zs: number[] = [];
      for (const [x, z] of [
        [r.x0, r.z0],
        [r.x1, r.z1],
      ]) {
        v.set(x, 0, z).applyMatrix4(m);
        xs.push(v.x);
        zs.push(v.z);
      }
      return { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) };
    });
  });
}

function box(w: WallSegment): ColliderBox {
  return {
    minX: w.position[0] - w.size[0] / 2,
    maxX: w.position[0] + w.size[0] / 2,
    minZ: w.position[2] - w.size[2] / 2,
    maxZ: w.position[2] + w.size[2] / 2,
  };
}

/**
 * The walls as collision boxes, cut open at every balcony door (windows stay solid — nobody walks out of a
 * window). Same boxes as before for a room without balconies.
 */
export function solidWallBoxes(walls: WallSegment[], openings: WindowOpening[] | undefined): ColliderBox[] {
  const doors = (openings ?? []).filter(isBalcony);
  if (!doors.length) return walls.map(box);
  return walls.flatMap((w) => {
    const mine = doors.filter((d) => d.wallId === w.id);
    if (!mine.length) return [box(w)];
    // A floor-to-head door leaves the piers either side plus a lintel; only the floor-standing piers block.
    return splitWallAroundOpenings(w, mine)
      .filter((p) => p.position[1] - p.size[1] / 2 < 0.01)
      .map(box);
  });
}

/** Every wall with a balcony on it, as an outdoor facade (one per wall, however many balconies it has). */
export function balconyFacades(walls: WallSegment[], openings: WindowOpening[] | undefined): Facade[] {
  const facades: Facade[] = [];
  for (const o of (openings ?? []).filter(isBalcony)) {
    if (facades.some((f) => f.wallId === o.wallId)) continue;
    const wall = walls.find((w) => w.id === o.wallId);
    if (!wall) continue;
    const i = o.axis === "x" ? 0 : 2;
    const across = o.axis === "x" ? 2 : 0;
    const out = -(o.axis === "x" ? o.inward[1] : o.inward[0]);
    facades.push({
      wallId: wall.id,
      axis: o.axis,
      normal: o.axis === "x" ? [0, out] : [out, 0],
      plane: wall.position[across] + out * (wall.size[across] / 2 + FACADE_OFFSET),
      // Past the wall's ends by half a wall thickness: perimeter walls meet on their centre lines, which leaves
      // an open notch at the building's outer corner.
      start: wall.position[i] - wall.size[i] / 2 - o.depth / 2 - FACADE_OFFSET,
      end: wall.position[i] + wall.size[i] / 2 + o.depth / 2 + FACADE_OFFSET,
      height: wall.position[1] + wall.size[1] / 2,
    });
  }
  return facades;
}

/**
 * Rectangles (along-wall span × height) of a facade's skin, holed around every opening on its wall — windows
 * included, so the room still shows through them from the balcony.
 */
export function facadePanels(facade: Facade, openings: WindowOpening[]): { a0: number; a1: number; y0: number; y1: number }[] {
  const length = facade.end - facade.start;
  const mid = (facade.start + facade.end) / 2;
  const wall: WallSegment =
    facade.axis === "x"
      ? { id: facade.wallId, position: [mid, facade.height / 2, 0], size: [length, facade.height, 0.01] }
      : { id: facade.wallId, position: [0, facade.height / 2, mid], size: [0.01, facade.height, length] };
  const i = facade.axis === "x" ? 0 : 2;
  return splitWallAroundOpenings(wall, openings).map((p) => ({
    a0: p.position[i] - p.size[i] / 2,
    a1: p.position[i] + p.size[i] / 2,
    y0: p.position[1] - p.size[1] / 2,
    y1: p.position[1] + p.size[1] / 2,
  }));
}

/** True when a floor-plane rectangle overlaps any unit cell of a custom footprint (a balcony may not reach into the room). */
export function rectOverlapsCells(r: FloorRect, cells: { x: number; z: number }[]): boolean {
  const eps = 1e-6;
  return cells.some((c) => r.minX < c.x + 1 - eps && r.maxX > c.x + eps && r.minZ < c.z + 1 - eps && r.maxZ > c.z + eps);
}
