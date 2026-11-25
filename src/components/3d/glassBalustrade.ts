// Glass balustrades — pure geometry, shared by balconies (Balconies.tsx, runs from balcony.ts) and mezzanines
// (MezzanineStructure.tsx: the slab's free edges from mezzanine.ts and the stair's open sides). What makes it
// read as a real one rather than boxes:
//
// - anthracite steel posts (50 mm square, rounded corners) at both ends, on every corner and every ≤ 1.3 m,
//   each on a base plate with four bolt heads;
// - a round Ø48 mm handrail on top of the posts, one continuous tube with exact mitres at the corners; at a
//   wall it ends on a wall flange, at a free end (a stair gap) it's capped just past the end post;
// - 12 mm laminated glass panels between the posts, held by two clamps per side, 10 cm above the floor (on a
//   stair: above the nosing line, so the panels are parallelograms following the pitch); their edges are
//   opaque green-grey (the colour you see looking into glass edge-on), their faces go to the transparent mesh.
//
// Level runs (RailingRun, floor-plane lines) whose ends meet are chained, so corner posts and the handrail
// mitre are shared.

import * as THREE from "three";
import { SweepBuilder, arc, type Profile } from "./profileSweep";
import { RAILING_HEIGHT, type RailingRun } from "./balcony";

export const POST_SIZE = 0.05;
export const POST_MAX_SPACING = 1.3;
export const HANDRAIL_RADIUS = 0.024;
export const GLASS_THICKNESS = 0.012;
/** Glass bottom above the floor / nosing line, and its gap to each post face. */
export const GLASS_BOTTOM = 0.1;
export const GLASS_POST_GAP = 0.02;
/** Glass top above the floor / nosing line, under the handrail. */
export const GLASS_TOP = RAILING_HEIGHT - 2 * HANDRAIL_RADIUS - 0.06;
/** The post next to a wall stands this far off its surface. */
const WALL_POST_OFFSET = 0.07;
export const BASE_PLATE = 0.12;
/** Smaller plates on stair treads, so they stay on the tread inside the stair's side line. */
const STAIR_BASE_PLATE = 0.085;
const BASE_PLATE_T = 0.01;
const FLANGE_RADIUS = 0.04;
const FLANGE_T = 0.008;
const CLAMP = { along: 0.045, height: 0.05, across: 0.032 };

/**
 * Linear RGB share of light one glass face takes away (each panel has two faces): 12 mm laminated glass is
 * noticeably greener than a window pane.
 */
export const RAILING_GLASS_ABSORPTION: [number, number, number] = [0.09, 0.05, 0.08];

/** Powder-coated anthracite steel, glass edge, stainless clamps — vertex colours on one material. */
export const RAILING_COLORS = {
  steel: new THREE.Color("#2f3134"),
  glassEdge: new THREE.Color("#5b7a6f"),
  clamp: new THREE.Color("#8d9094"),
};

export interface BalustradeGeometry {
  /** Posts, plates, handrail, flanges, clamps and glass edges (vertex-coloured, indexed). */
  solid: THREE.BufferGeometry;
  /** Glass faces, both sides of every panel (non-indexed). */
  glass: THREE.BufferGeometry;
}

export interface LevelBalustradeOptions {
  /** Height of the floor the posts stand on. */
  baseY?: number;
  /** Gap from a chain's end to the wall surface it meets, or null for a free end (e.g. at a stair). Default: a wall right at the end. */
  wallGapAt?: (p: P2) => number | null;
}

type P2 = [number, number];
const near = (a: P2, b: P2) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-6;
const dist = (a: P2, b: P2) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const lerp2 = (a: P2, b: P2, t: number): P2 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

/** Chains runs whose ends meet (in any direction) into polylines of floor-plane points. */
export function chainRuns(runs: RailingRun[]): P2[][] {
  const chains: P2[][] = runs.map((r) => [r.from, r.to]);
  for (let merged = true; merged; ) {
    merged = false;
    search: for (let i = 0; i < chains.length; i++) {
      for (let j = 0; j < chains.length; j++) {
        if (i === j) continue;
        const [a, b] = [chains[i], chains[j]];
        let joined: P2[] | null = null;
        if (near(a[a.length - 1], b[0])) joined = [...a, ...b.slice(1)];
        else if (near(a[a.length - 1], b[b.length - 1])) joined = [...a, ...[...b].reverse().slice(1)];
        if (!joined) continue;
        chains[i] = joined;
        chains.splice(j, 1);
        merged = true;
        break search;
      }
    }
  }
  return chains;
}

/**
 * Post positions along one chain, per segment (both ends included, corners shared by neighbouring segments):
 * at a wall end the post stands `gap + WALL_POST_OFFSET` in from the end, at a free end (gap null) its base
 * plate is flush with the end (nothing hangs over a stair opening); evenly spaced in between so no gap exceeds POST_MAX_SPACING.
 */
export function postsPerSegment(chain: P2[], startGap: number | null = 0, endGap: number | null = 0): P2[][] {
  const pts = chain.map((p) => [...p] as P2);
  const pull = (i: number, toward: number, gap: number | null) => {
    const len = dist(pts[i], pts[toward]);
    const want = gap === null ? BASE_PLATE / 2 : gap + WALL_POST_OFFSET;
    pts[i] = lerp2(pts[i], pts[toward], Math.min(want, len / 2) / len);
  };
  pull(0, 1, startGap);
  pull(pts.length - 1, pts.length - 2, endGap);
  const segments: P2[][] = [];
  for (let k = 0; k < pts.length - 1; k++) {
    const n = Math.max(1, Math.ceil(dist(pts[k], pts[k + 1]) / POST_MAX_SPACING - 1e-9));
    const seg: P2[] = [];
    for (let i = 0; i <= n; i++) seg.push(lerp2(pts[k], pts[k + 1], i / n));
    segments.push(seg);
  }
  return segments;
}

/** Glass panels of one segment: [from, to] centre-line points between consecutive posts. */
export function glassPanels(posts: P2[]): [P2, P2][] {
  const panels: [P2, P2][] = [];
  const inset = POST_SIZE / 2 + GLASS_POST_GAP;
  for (let i = 0; i < posts.length - 1; i++) {
    const [a, b] = [posts[i], posts[i + 1]];
    const len = dist(a, b);
    if (len <= 2 * inset + 0.05) continue;
    panels.push([lerp2(a, b, inset / len), lerp2(a, b, 1 - inset / len)]);
  }
  return panels;
}

/** 50 mm square post section with 5 mm radius corners, centred on (cx, cz) in the floor plane (a = x, z = z). */
function postProfile(cx: number, cz: number): Profile {
  const r = 0.005;
  const c = POST_SIZE / 2 - r;
  const out: Profile = [];
  for (const [sx, sz, a0] of [
    [1, 1, 0],
    [-1, 1, Math.PI / 2],
    [-1, -1, Math.PI],
    [1, -1, (3 * Math.PI) / 2],
  ]) {
    const [ox, oz] = [cx + sx * c, cz + sz * c];
    out.push([ox + r * Math.cos(a0), oz + r * Math.sin(a0)], ...arc(ox, oz, r, a0, a0 + Math.PI / 2, 3));
  }
  return out;
}

const HANDRAIL: Profile = arc(0, 0, HANDRAIL_RADIUS, 0, Math.PI * 2, 16);

/** A box (width along `dir`, height, depth across) centred at (x, y, z), turned to face along `dir`. */
function orientedBox(along: number, height: number, across: number, x: number, y: number, z: number, dir: P2): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(along, height, across);
  g.rotateY(-Math.atan2(dir[1], dir[0]));
  g.translate(x, y, z);
  return g;
}

/** Flat-shaded triangles, wound so their front faces point along their normals. */
class FlatMesh {
  positions: number[] = [];
  normals: number[] = [];

  quad(p: THREE.Vector3[], n: THREE.Vector3) {
    const front = new THREE.Vector3().subVectors(p[1], p[0]).cross(new THREE.Vector3().subVectors(p[2], p[0])).dot(n) > 0;
    const order = front ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2];
    for (const k of order) {
      this.positions.push(p[k].x, p[k].y, p[k].z);
      this.normals.push(n.x, n.y, n.z);
    }
  }

  toGeometry(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.positions, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(this.normals, 3));
    return g;
  }
}

/** Builds every balustrade of a room into one solid + one glass geometry. */
export class BalustradeBuilder {
  private solid = new SweepBuilder();
  private glass = new FlatMesh();

  private post(x: number, z: number, y0: number, y1: number, plate: number) {
    const { steel, clamp } = RAILING_COLORS;
    this.solid.sweepBar("y", 0, y0 + BASE_PLATE_T, y1, postProfile(x, z), steel, true);
    const g = new THREE.BoxGeometry(plate, BASE_PLATE_T, plate);
    g.translate(x, y0 + BASE_PLATE_T / 2, z);
    this.solid.addGeometry(g, steel);
    g.dispose();
    const o = plate / 2 - 0.018;
    for (const [sx, sz] of [
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ]) {
      const bolt = new THREE.CylinderGeometry(0.009, 0.009, 0.006, 6);
      bolt.translate(x + sx * o, y0 + BASE_PLATE_T + 0.003, z + sz * o);
      this.solid.addGeometry(bolt, clamp);
      bolt.dispose();
    }
  }

  /** A panel from a to b whose bottom edge runs from height ya to yb, GLASS_TOP − GLASS_BOTTOM tall, plus its clamps. */
  private panel(a: P2, b: P2, ya: number, yb: number) {
    const h = GLASS_TOP - GLASS_BOTTOM;
    const u = new THREE.Vector3(b[0] - a[0], 0, b[1] - a[1]).normalize();
    const across = new THREE.Vector3(-u.z, 0, u.x);
    const half = across.clone().multiplyScalar(GLASS_THICKNESS / 2);
    const A0 = new THREE.Vector3(a[0], ya, a[1]);
    const B0 = new THREE.Vector3(b[0], yb, b[1]);
    const B1 = B0.clone().setY(yb + h);
    const A1 = A0.clone().setY(ya + h);
    const side = (corners: THREE.Vector3[], s: number) => corners.map((c) => c.clone().addScaledVector(half, s));
    for (const s of [1, -1]) this.glass.quad(side([A0, B0, B1, A1], s), across.clone().multiplyScalar(s));

    // Edges: bottom/top follow the slope (normal ⟂ to it in the panel's plane), the ends are vertical.
    const edges = new FlatMesh();
    const slope = new THREE.Vector3().subVectors(B0, A0).normalize();
    const down = new THREE.Vector3().crossVectors(slope, across).normalize();
    if (down.y > 0) down.negate();
    const strip = (p: THREE.Vector3, q: THREE.Vector3, n: THREE.Vector3) =>
      edges.quad([p.clone().add(half), q.clone().add(half), q.clone().sub(half), p.clone().sub(half)], n);
    strip(A0, B0, down);
    strip(A1, B1, down.clone().negate());
    strip(A0, A1, u.clone().negate());
    strip(B0, B1, u);
    const eg = edges.toGeometry();
    this.solid.addGeometry(eg, RAILING_COLORS.glassEdge);
    eg.dispose();

    // Two clamps at each end, from the post face across the gap onto the glass edge.
    const dir: P2 = [u.x, u.z];
    const off = -GLASS_POST_GAP + CLAMP.along / 2;
    for (const [end, y, sign] of [
      [a, ya, 1],
      [b, yb, -1],
    ] as const) {
      for (const k of [0.15, 0.85]) {
        const c = orientedBox(CLAMP.along, CLAMP.height, CLAMP.across, end[0] + u.x * sign * off, y + k * h, end[1] + u.z * sign * off, dir);
        this.solid.addGeometry(c, RAILING_COLORS.clamp);
        c.dispose();
      }
    }
  }

  /** Level balustrades along floor-plane runs (a balcony's edge, a mezzanine's free slab edges). */
  addLevel(runs: RailingRun[], { baseY = 0, wallGapAt = () => 0 }: LevelBalustradeOptions = {}) {
    const railY = baseY + RAILING_HEIGHT - HANDRAIL_RADIUS;
    for (const chain of chainRuns(runs)) {
      const gaps = [wallGapAt(chain[0]), wallGapAt(chain[chain.length - 1])];
      const segments = postsPerSegment(chain, gaps[0], gaps[1]);
      const posts: P2[] = [];
      for (const seg of segments) for (const p of seg) if (!posts.some((q) => near(p, q))) posts.push(p);
      for (const [x, z] of posts) this.post(x, z, baseY, railY, BASE_PLATE);

      // Handrail: one tube along the chain; at a wall it stops on a flange, at a free end it's capped over the post.
      const rail = chain.map(([x, z]) => new THREE.Vector3(x, railY, z));
      for (const [i, toward, gap] of [
        [0, 1, gaps[0]],
        [rail.length - 1, rail.length - 2, gaps[1]],
      ] as const) {
        const d = rail[toward].clone().sub(rail[i]).normalize();
        if (gap === null) {
          // Capped just past the end post.
          rail[i].addScaledVector(d, BASE_PLATE / 2 - POST_SIZE / 2 - 0.01);
          continue;
        }
        rail[i].addScaledVector(d, gap + FLANGE_T);
        const flange = new THREE.CylinderGeometry(FLANGE_RADIUS, FLANGE_RADIUS, FLANGE_T, 20);
        flange.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d));
        const c = rail[i].clone().addScaledVector(d, -FLANGE_T / 2);
        flange.translate(c.x, c.y, c.z);
        this.solid.addGeometry(flange, RAILING_COLORS.steel);
        flange.dispose();
      }
      this.solid.sweepPolyline(
        rail.map((v) => [v.x, v.y, v.z]),
        HANDRAIL,
        RAILING_COLORS.steel,
        true
      );

      for (const seg of segments) for (const [a, b] of glassPanels(seg)) this.panel(a, b, baseY + GLASS_BOTTOM, baseY + GLASS_BOTTOM);
    }
  }

  /**
   * A stair's balustrade along one open side, from the foot (t = 0) to the head (t = 1): `from`/`to` = the side
   * line on the floor plane, `nosingAt(t)` = the nosing line's height, `treadY(i)` = tread i's top. Posts stand
   * on the treads; handrail and glass follow the pitch at the same heights above the nosing line as on a level
   * floor.
   */
  addStair(from: P2, to: P2, treads: number, nosingAt: (t: number) => number, treadY: (i: number) => number) {
    const len = dist(from, to);
    const pad = (POST_SIZE / 2 + 0.03) / len;
    const n = Math.max(1, Math.ceil(((1 - 2 * pad) * len) / POST_MAX_SPACING - 1e-9));
    const ts = Array.from({ length: n + 1 }, (_, k) => pad + ((1 - 2 * pad) * k) / n);
    const railAt = (t: number) => {
      const [x, z] = lerp2(from, to, t);
      return new THREE.Vector3(x, nosingAt(t) + RAILING_HEIGHT - HANDRAIL_RADIUS, z);
    };
    for (const t of ts) {
      const [x, z] = lerp2(from, to, t);
      const tread = Math.min(Math.floor(t * treads), treads - 1);
      this.post(x, z, treadY(tread), railAt(t).y, STAIR_BASE_PLATE);
    }
    // Handrail: past the end posts by a radius, capped.
    const r = HANDRAIL_RADIUS / len;
    const [a, b] = [railAt(ts[0] - r), railAt(ts[ts.length - 1] + r)];
    this.solid.sweepSegment([a.x, a.y, a.z], [b.x, b.y, b.z], HANDRAIL, RAILING_COLORS.steel, true);
    const inset = (POST_SIZE / 2 + GLASS_POST_GAP) / len;
    for (let k = 0; k < ts.length - 1; k++) {
      const [t0, t1] = [ts[k] + inset, ts[k + 1] - inset];
      if (t1 - t0 < 0.05 / len) continue;
      this.panel(lerp2(from, to, t0), lerp2(from, to, t1), nosingAt(t0) + GLASS_BOTTOM, nosingAt(t1) + GLASS_BOTTOM);
    }
  }

  get empty() {
    return this.solid.empty;
  }

  build(): BalustradeGeometry | null {
    if (this.solid.empty) return null;
    const glass = this.glass.toGeometry();
    glass.computeBoundingSphere();
    return { solid: this.solid.toGeometry(), glass };
  }
}

/** Level balustrades along `runs`, as one solid + one glass geometry (null when there are none). */
export function balustradeGeometry(runs: RailingRun[], options?: LevelBalustradeOptions): BalustradeGeometry | null {
  if (!runs.length) return null;
  const b = new BalustradeBuilder();
  b.addLevel(runs, options);
  return b.build();
}
