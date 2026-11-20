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

import * as THREE from "three";
import type { WallSegment } from "./galleryLayout";

/** Board height (m). Modern gallery skirtings are 8–12 cm. */
export const BASEBOARD_HEIGHT = 0.1;
/** How far the board stands proud of the wall face (m). */
export const BASEBOARD_PROTRUSION = 0.015;
/** 45° chamfer on the top front edge (m). */
export const BASEBOARD_CHAMFER = 0.006;
/** Board colour = wall colour × this (satin paint a shade darker than the wall). */
export const BASEBOARD_SHADE = 0.86;
export const BASEBOARD_ROUGHNESS = 0.5;

/** Walls whose bottom isn't on the floor (e.g. a door header) get no board. */
function standsOnFloor(wall: WallSegment): boolean {
  return wall.position[1] - wall.size[1] / 2 < 0.01;
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

/** Merged, flat-shaded skirting geometry for every floor-standing wall. Non-indexed, position + normal. */
export function buildBaseboardGeometry(walls: WallSegment[]): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const e1 = new THREE.Vector3();
  const e2 = new THREE.Vector3();
  const n = new THREE.Vector3();

  const tri = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) => {
    n.crossVectors(e1.subVectors(b, a), e2.subVectors(c, a)).normalize();
    for (const v of [a, b, c]) {
      positions.push(v.x, v.y, v.z);
      normals.push(n.x, n.y, n.z);
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
  for (const wall of walls) {
    if (!standsOnFloor(wall)) continue;
    const bottom = ring(wall, t, 0);
    const shoulder = ring(wall, t, h - c);
    const top = ring(wall, t - c, h);
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      // Corners run counter-clockwise from above, so (i → j) going up faces outward with this winding.
      quad(bottom[j], bottom[i], shoulder[i], shoulder[j]);
      quad(shoulder[j], shoulder[i], top[i], top[j]);
    }
    // Top cap; the part over the wall itself is hidden inside the wall.
    quad(top[3], top[2], top[1], top[0]);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.computeBoundingSphere();
  return geometry;
}

/** Board colour for a wall colour (a satin shade darker). */
export function baseboardColor(wallColor: string): THREE.Color {
  return new THREE.Color(wallColor).multiplyScalar(BASEBOARD_SHADE);
}
