// Steel railings as merged box geometry — shared by balconies (Balconies.tsx) and mezzanines (MezzanineStructure.tsx):
// posts at the ends and every ≤ 1.5 m, a flat handrail, a bottom rail and square balusters. A level run
// stands on a floor at `baseY`; a stair's run follows its pitch (sloped handrail, balusters off each tread).

import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { RAILING_HEIGHT, type RailingRun } from "./balcony";

const POST = 0.045;
const POST_SPACING = 1.5;
const HANDRAIL_W = 0.06;
const HANDRAIL_H = 0.04;
const BOTTOM_RAIL = 0.03;
const BOTTOM_RAIL_Y = 0.08;
const BALUSTER = 0.016;
const BALUSTER_SPACING = 0.12;

/** A box from two floor-plane points (a straight member), `w` thick across, spanning y0..y1. */
function member(from: [number, number], to: [number, number], w: number, y0: number, y1: number): THREE.BufferGeometry {
  const dx = to[0] - from[0];
  const dz = to[1] - from[1];
  const len = Math.hypot(dx, dz);
  const g = new THREE.BoxGeometry(len + w, y1 - y0, w);
  g.rotateY(-Math.atan2(dz, dx));
  g.translate((from[0] + to[0]) / 2, (y0 + y1) / 2, (from[1] + to[1]) / 2);
  return g;
}

/** A box along an arbitrary 3D segment, `w` wide and `h` tall in its cross-section. */
function member3(a: THREE.Vector3, b: THREE.Vector3, w: number, h: number): THREE.BufferGeometry {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const g = new THREE.BoxGeometry(len, h, w);
  // Box length runs along local x: turn x onto the segment, keeping the cross-section upright.
  const yaw = Math.atan2(-dir.z, dir.x);
  const pitch = Math.atan2(dir.y, Math.hypot(dir.x, dir.z));
  g.rotateZ(pitch);
  g.rotateY(yaw);
  g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return g;
}

function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry | null {
  if (!parts.length) return null;
  const merged = mergeGeometries(parts.map((p) => p.toNonIndexed()));
  for (const p of parts) p.dispose();
  merged?.deleteAttribute("uv");
  return merged;
}

function levelRunParts(runs: RailingRun[], baseY: number): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  for (const { from, to } of runs) {
    const len = Math.hypot(to[0] - from[0], to[1] - from[1]);
    const at = (t: number): [number, number] => [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t];
    parts.push(member(from, to, HANDRAIL_W, baseY + RAILING_HEIGHT - HANDRAIL_H, baseY + RAILING_HEIGHT));
    parts.push(member(from, to, BOTTOM_RAIL, baseY + BOTTOM_RAIL_Y, baseY + BOTTOM_RAIL_Y + BOTTOM_RAIL));
    const posts = Math.max(1, Math.ceil(len / POST_SPACING));
    for (let i = 0; i <= posts; i++) {
      const p = at(i / posts);
      parts.push(member(p, p, POST, baseY, baseY + RAILING_HEIGHT - HANDRAIL_H));
    }
    const n = Math.floor(len / BALUSTER_SPACING);
    for (let i = 1; i < n; i++) {
      const p = at(i / n);
      parts.push(member(p, p, BALUSTER, baseY + BOTTOM_RAIL_Y + BOTTOM_RAIL, baseY + RAILING_HEIGHT - HANDRAIL_H));
    }
  }
  return parts;
}

/** Level railing runs standing on a floor at `baseY`, merged into one geometry (null when there are none). */
export function railingGeometry(runs: RailingRun[], baseY = 0): THREE.BufferGeometry | null {
  return merge(levelRunParts(runs, baseY));
}

/**
 * A stair's railing along one side: posts at the foot and the head, a handrail following the pitch at
 * RAILING_HEIGHT above the nosings, and balusters standing on every tread. `floorAt(t)` is the nosing line's
 * height at fraction t of the run (0 = foot … 1 = head), `treadY(i)` the top of tread i; `from`/`to` the
 * side line on the floor plane.
 */
export function stairRailingGeometry(
  from: [number, number],
  to: [number, number],
  treads: number,
  floorAt: (t: number) => number,
  treadY: (i: number) => number
): THREE.BufferGeometry | null {
  const parts: THREE.BufferGeometry[] = [];
  const at = (t: number) => new THREE.Vector3(from[0] + (to[0] - from[0]) * t, floorAt(t), from[1] + (to[1] - from[1]) * t);
  const rail = (t: number, y: number) => at(t).add(new THREE.Vector3(0, y, 0));
  parts.push(member3(rail(0, RAILING_HEIGHT - HANDRAIL_H / 2), rail(1, RAILING_HEIGHT - HANDRAIL_H / 2), HANDRAIL_W, HANDRAIL_H));
  for (const t of [0, 1]) {
    const p = at(t);
    parts.push(member([p.x, p.z], [p.x, p.z], POST, p.y, p.y + RAILING_HEIGHT - HANDRAIL_H));
  }
  // Two balusters per tread, standing on the tread and reaching the sloped handrail.
  for (let i = 0; i < treads; i++) {
    for (const k of [0.3, 0.75]) {
      const t = (i + k) / treads;
      const p = at(t);
      const y0 = treadY(i);
      parts.push(member([p.x, p.z], [p.x, p.z], BALUSTER, y0, p.y + RAILING_HEIGHT - HANDRAIL_H));
    }
  }
  return merge(parts);
}
