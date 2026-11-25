// Skirting boards (re-added at the user's request on 2026-11-20, after the Adım 13 showcase room).
//
// The 2026-11-03 version was removed: a dark (#3a3733), glossy rounded box wrapped around each wall. It read
// as a black strip stuck on the wall, lit by nothing in particular, because it had none of the room's
// lighting patches. This version differs on purpose:
// - Painted in the wall's own colour, slightly darker, satin finish: a gallery skirting, not trim that
//   draws the eye.
// - A real profile: a 10 cm board standing 1.5 cm proud of the wall, with a 45° chamfer on its top edge.
//   The chamfer faces up toward the ceiling fixtures, so it catches a thin highlight line, as a real moulding
//   does.
// - Goes through the same room-AO patch as the walls (corner/floor AO, ceiling-fixture light, macro
//   variation), so it is lit exactly like the wall it sits on.
//
// Geometry: one prism per wall around the wall's footprint, inflated by the protrusion. Walls are
// axis-aligned boxes, so inside corners mitre automatically (the two chamfer planes meet on the diagonal),
// and both faces of free-standing partitions get a board. Overlapping caps at corners are coplanar with
// identical world-space shading, so they can't flicker. Everything is merged into one BufferGeometry: one
// draw call for the whole room.
//
// A wall cut around windows (windowOpenings.ts's splitWallAroundOpenings: piers + the piece under each sill)
// is first joined back into one run per stretch of floor (mergeFloorRuns) — one prism per piece made the
// neighbouring boards overlap by 2 × protrusion at every joint (coplanar faces + end caps ending exactly on
// the next board's face), which flickered while walking (2026-11-25). Floor-level openings (balcony doors)
// still break the run.

import * as THREE from "three";
import type { WallSegment } from "./galleryLayout";

/** Board height (m). Modern gallery skirtings are 8–12 cm. */
export const BASEBOARD_HEIGHT = 0.1;
/** How far the board stands proud of the wall face (m). */
export const BASEBOARD_PROTRUSION = 0.015;
/** 45° chamfer on the top front edge (m). */
export const BASEBOARD_CHAMFER = 0.006;
/**
 * Pixel footprint (world m per pixel, on the surface) over which the board's up-facing faces (chamfer + top)
 * fade to the front face's shading (2026-11-25). Those faces catch about twice the front's ceiling light, so
 * they read as a bright line ~1.5 cm wide; a few metres away it is thinner than a pixel and crawled/flickered
 * while walking (shading aliasing — SMAA can't fix it). Fading the normal toward the front once the line
 * covers less than ~4 → 1.5 pixels is the geometric version of a texture mip: crisp up close, stable far off.
 */
export const BASEBOARD_FADE_START = BASEBOARD_PROTRUSION / 4;
export const BASEBOARD_FADE_END = BASEBOARD_PROTRUSION / 1.5;
/** Board colour = wall colour × this (satin paint a shade darker than the wall). */
export const BASEBOARD_SHADE = 0.86;
export const BASEBOARD_ROUGHNESS = 0.5;

/** Walls whose bottom isn't on the floor (e.g. a door header) get no board. */
function standsOnFloor(wall: WallSegment): boolean {
  return wall.position[1] - wall.size[1] / 2 < 0.01;
}

/** Joint tolerance (m) between two pieces of the same cut wall. */
const RUN_JOIN_EPS = 1e-4;

/**
 * Floor-standing walls with collinear, touching pieces (same axis line and thickness) joined into one
 * segment each. Only the footprint matters for the board, so the joined segment's height is irrelevant
 * (kept from the first piece); walls that don't reach the floor are dropped.
 */
export function mergeFloorRuns(walls: WallSegment[]): WallSegment[] {
  const groups = new Map<string, { axis: "x" | "z"; a0: number; a1: number; wall: WallSegment }[]>();
  for (const wall of walls) {
    if (!standsOnFloor(wall)) continue;
    const axis = wall.size[0] >= wall.size[2] ? "x" : "z";
    const across = axis === "x" ? wall.position[2] : wall.position[0];
    const thickness = axis === "x" ? wall.size[2] : wall.size[0];
    const centre = axis === "x" ? wall.position[0] : wall.position[2];
    const half = (axis === "x" ? wall.size[0] : wall.size[2]) / 2;
    const key = `${axis}|${across.toFixed(4)}|${thickness.toFixed(4)}`;
    const list = groups.get(key) ?? [];
    list.push({ axis, a0: centre - half, a1: centre + half, wall });
    groups.set(key, list);
  }
  const out: WallSegment[] = [];
  for (const list of groups.values()) {
    list.sort((p, q) => p.a0 - q.a0);
    let cur = { ...list[0] };
    const flush = () => {
      const { axis, a0, a1, wall } = cur;
      const c = (a0 + a1) / 2;
      out.push({
        id: wall.id,
        position: axis === "x" ? [c, wall.position[1], wall.position[2]] : [wall.position[0], wall.position[1], c],
        size: axis === "x" ? [a1 - a0, wall.size[1], wall.size[2]] : [wall.size[0], wall.size[1], a1 - a0],
      });
    };
    for (const next of list.slice(1)) {
      if (next.a0 <= cur.a1 + RUN_JOIN_EPS) cur.a1 = Math.max(cur.a1, next.a1);
      else {
        flush();
        cur = { ...next };
      }
    }
    flush();
  }
  return out;
}

/** Rectangle corners (counter-clockwise seen from above: −x−z, +x−z, +x+z, −x+z) inflated by `grow`. */
function ring(wall: WallSegment, grow: number, y: number): THREE.Vector3[] {
  const [cx, , cz] = wall.position;
  const hx = wall.size[0] / 2 + grow;
  const hz = wall.size[2] / 2 + grow;
  return [
    new THREE.Vector3(cx - hx, y, cz - hz),
    new THREE.Vector3(cx + hx, y, cz - hz),
    new THREE.Vector3(cx + hx, y, cz + hz),
    new THREE.Vector3(cx - hx, y, cz + hz),
  ];
}

/**
 * Merged, flat-shaded skirting geometry for every floor-standing wall. Non-indexed: position, normal and
 * `baseboardOutward` (the horizontal outward normal of the side each face belongs to — what the up-facing
 * faces fade to at a distance, see BASEBOARD_FADE_START).
 */
export function buildBaseboardGeometry(walls: WallSegment[]): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const outwards: number[] = [];
  const outward = new THREE.Vector3();
  const e1 = new THREE.Vector3();
  const e2 = new THREE.Vector3();
  const n = new THREE.Vector3();

  const tri = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) => {
    n.crossVectors(e1.subVectors(b, a), e2.subVectors(c, a)).normalize();
    for (const v of [a, b, c]) {
      positions.push(v.x, v.y, v.z);
      normals.push(n.x, n.y, n.z);
      outwards.push(outward.x, outward.y, outward.z);
    }
  };
  // Quad a-b-c-d, counter-clockwise seen from the outside.
  const quad = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3) => {
    tri(a, b, c);
    tri(a, c, d);
  };

  const t = BASEBOARD_PROTRUSION;
  const c = BASEBOARD_CHAMFER;
  const h = BASEBOARD_HEIGHT;
  for (const wall of mergeFloorRuns(walls)) {
    const bottom = ring(wall, t, 0);
    const shoulder = ring(wall, t, h - c);
    const top = ring(wall, t - c, h);
    // The wall's own footprint at board height: the top cap only needs the strip outside it.
    const inner = ring(wall, 0, h);
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      // Side i runs bottom[i] → bottom[j]; its outward normal is that edge turned −90° about +Y.
      outward.set(bottom[j].z - bottom[i].z, 0, bottom[i].x - bottom[j].x).normalize();
      // Corners run counter-clockwise from above, so (i → j) going up faces outward with this winding.
      quad(bottom[j], bottom[i], shoulder[i], shoulder[j]);
      quad(shoulder[j], shoulder[i], top[i], top[j]);
      // Top cap strip of this side, between the chamfer and the wall face (corners mitre on the diagonal).
      quad(top[j], top[i], inner[i], inner[j]);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("baseboardOutward", new THREE.Float32BufferAttribute(outwards, 3));
  geometry.computeBoundingSphere();
  return geometry;
}

/** Board colour for a wall colour (a satin shade darker). */
export function baseboardColor(wallColor: string): THREE.Color {
  return new THREE.Color(wallColor).multiplyScalar(BASEBOARD_SHADE);
}
