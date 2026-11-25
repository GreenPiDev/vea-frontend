// Generic profile sweeps for architectural joinery (window frames, sashes, glazing bars, casings) — the same
// idea as the picture-frame sweep in frameProfile.ts, without its fixed frame size: a closed 2D cross-section
// is swept around a rectangle (exact 45° mitres) or along a straight line (bars, with optional end caps).
//
// A cross-section point is [r, z, shade?]: r across the member (for a rectangle: outward from its inner edge),
// z toward the viewer (the room). `shade` (default 1) darkens the segment that starts at that point — baked
// into vertex colours, used for the 2 mm shadow gaps and the black gaskets, so one material per window style
// covers everything. Creases sharper than 35° get split normals, gentler joints smooth ones.
//
// Geometry comes out as position + normal + color (no uv: these materials have no texture), so every piece
// merges into one BufferGeometry. Pure; tested in windowGeometry.test.ts.

import * as THREE from "three";

export type ProfilePoint = [number, number] | [number, number, number];
export type Profile = ProfilePoint[];

const CREASE_COS = Math.cos(THREE.MathUtils.degToRad(35));

export class SweepBuilder {
  positions: number[] = [];
  normals: number[] = [];
  colors: number[] = [];
  indices: number[] = [];

  private vertex(p: THREE.Vector3Tuple, n: THREE.Vector3Tuple, c: THREE.Color, shade: number) {
    this.positions.push(...p);
    this.normals.push(...n);
    this.colors.push(c.r * shade, c.g * shade, c.b * shade);
    return this.positions.length / 3 - 1;
  }

  /** Adds a quad, wound so its front face agrees with the vertex normals. */
  private quad(a: number, b: number, c: number, d: number) {
    this.tri(a, b, c);
    this.tri(a, c, d);
  }

  private tri(a: number, b: number, c: number) {
    const P = this.positions;
    const ab = [P[b * 3] - P[a * 3], P[b * 3 + 1] - P[a * 3 + 1], P[b * 3 + 2] - P[a * 3 + 2]];
    const ac = [P[c * 3] - P[a * 3], P[c * 3 + 1] - P[a * 3 + 1], P[c * 3 + 2] - P[a * 3 + 2]];
    const fx = ab[1] * ac[2] - ab[2] * ac[1];
    const fy = ab[2] * ac[0] - ab[0] * ac[2];
    const fz = ab[0] * ac[1] - ab[1] * ac[0];
    if (fx * fx + fy * fy + fz * fz < 1e-20) return; // degenerate
    const N = this.normals;
    const dot = fx * N[a * 3] + fy * N[a * 3 + 1] + fz * N[a * 3 + 2];
    if (dot >= 0) this.indices.push(a, b, c);
    else this.indices.push(a, c, b);
  }

  /**
   * Sweeps `profile` around a rectangle centred at (cx, cy) whose inner edge (r = 0) has half-size
   * (hw, hh). Corners mitre automatically: each profile point traces its own rectangle.
   */
  sweepRect(cx: number, cy: number, hw: number, hh: number, profile: Profile, color: THREE.Color) {
    const sec = section(profile);
    const sides = [
      { o: [1, 0], t: [0, 1], across: hw, along: hh },
      { o: [0, 1], t: [-1, 0], across: hh, along: hw },
      { o: [-1, 0], t: [0, -1], across: hw, along: hh },
      { o: [0, -1], t: [1, 0], across: hh, along: hw },
    ] as const;
    for (const side of sides) {
      for (let s = 0; s < sec.n; s++) {
        if (sec.len[s] === 0) continue;
        const ids: number[] = [];
        for (const end of [0, 1] as const) {
          const [r, z] = sec.pts[(s + end) % sec.n];
          const [nr, nz] = sec.endNormal(s, end);
          for (const sign of [-1, 1]) {
            const across = side.across + r;
            const along = (side.along + r) * sign;
            ids.push(
              this.vertex(
                [cx + side.o[0] * across + side.t[0] * along, cy + side.o[1] * across + side.t[1] * along, z],
                [side.o[0] * nr, side.o[1] * nr, nz],
                color,
                sec.shade[s]
              )
            );
          }
        }
        this.quad(ids[0], ids[1], ids[3], ids[2]);
      }
    }
  }

  /**
   * Sweeps a cross-section (a, z) along a straight line in the window plane: `axis` "y" = a vertical bar at
   * x = c from y = from to y = to (a runs along x); "x" = a horizontal bar at y = c (a runs along y).
   */
  sweepBar(axis: "x" | "y", c: number, from: number, to: number, profile: Profile, color: THREE.Color, caps = false) {
    const sec = section(profile);
    const place = (a: number, t: number, z: number): THREE.Vector3Tuple => (axis === "y" ? [c + a, t, z] : [t, c + a, z]);
    const dir = (na: number, nz: number): THREE.Vector3Tuple => (axis === "y" ? [na, 0, nz] : [0, na, nz]);
    for (let s = 0; s < sec.n; s++) {
      if (sec.len[s] === 0) continue;
      const ids: number[] = [];
      for (const end of [0, 1] as const) {
        const [a, z] = sec.pts[(s + end) % sec.n];
        const [na, nz] = sec.endNormal(s, end);
        for (const t of [from, to]) ids.push(this.vertex(place(a, t, z), dir(na, nz), color, sec.shade[s]));
      }
      this.quad(ids[0], ids[1], ids[3], ids[2]);
    }
    if (!caps) return;
    const contour = sec.pts.map(([a, z]) => new THREE.Vector2(a, z));
    const tris = THREE.ShapeUtils.triangulateShape(contour, []);
    for (const [t, sign] of [
      [from, -1],
      [to, 1],
    ] as const) {
      const n: THREE.Vector3Tuple = axis === "y" ? [0, sign, 0] : [sign, 0, 0];
      const ids = sec.pts.map(([a, z]) => this.vertex(place(a, t, z), n, color, 1));
      for (const [i, j, k] of tris) this.tri(ids[i], ids[j], ids[k]);
    }
  }

  /**
   * Sweeps a cross-section along a horizontal polyline in world space (a handrail), with exact mitres at every
   * inner vertex. Profile point [r, z]: r = horizontal offset to the left of the walking direction, z = up.
   * `caps` closes both ends.
   */
  sweepPolyline(points: THREE.Vector3Tuple[], profile: Profile, color: THREE.Color, caps = false) {
    if (points.length < 2) return;
    const sec = section(profile);
    const up = new THREE.Vector3(0, 1, 0);
    const P = points.map((p) => new THREE.Vector3(...p));
    const dirs = P.slice(1).map((p, k) => p.clone().sub(P[k]).setY(0).normalize());
    // Left of the walking direction on the floor plane.
    const sides = dirs.map((d) => new THREE.Vector3(-d.z, 0, d.x));
    // Mitre vector at every vertex: the bisector of the neighbouring sides, stretched to keep the profile's width.
    const mitres = P.map((_, k) => {
      const a = sides[Math.max(k - 1, 0)];
      const b = sides[Math.min(k, sides.length - 1)];
      const m = a.clone().add(b).normalize();
      return m.multiplyScalar(1 / Math.max(m.dot(b), 0.2));
    });
    for (let k = 0; k < dirs.length; k++) {
      const side = sides[k];
      for (let s = 0; s < sec.n; s++) {
        if (sec.len[s] === 0) continue;
        const ids: number[] = [];
        for (const end of [0, 1] as const) {
          const [r, z] = sec.pts[(s + end) % sec.n];
          const [nr, nz] = sec.endNormal(s, end);
          const n: THREE.Vector3Tuple = [side.x * nr, nz, side.z * nr];
          for (const v of [k, k + 1]) {
            const p = P[v].clone().addScaledVector(mitres[v], r).addScaledVector(up, z);
            ids.push(this.vertex([p.x, p.y, p.z], n, color, sec.shade[s]));
          }
        }
        this.quad(ids[0], ids[1], ids[3], ids[2]);
      }
    }
    if (!caps) return;
    const contour = sec.pts.map(([r, z]) => new THREE.Vector2(r, z));
    const tris = THREE.ShapeUtils.triangulateShape(contour, []);
    for (const [v, k, sign] of [
      [0, 0, -1],
      [P.length - 1, dirs.length - 1, 1],
    ] as const) {
      const d = dirs[k];
      const n: THREE.Vector3Tuple = [d.x * sign, 0, d.z * sign];
      const ids = sec.pts.map(([r, z]) => {
        const p = P[v].clone().addScaledVector(sides[k], r).addScaledVector(up, z);
        return this.vertex([p.x, p.y, p.z], n, color, 1);
      });
      for (const [i, j, l] of tris) this.tri(ids[i], ids[j], ids[l]);
    }
  }

  /**
   * Sweeps a cross-section along a straight 3D segment (a sloped stair handrail), cut square at both ends.
   * Profile point [r, z]: r = horizontal offset to the left of the direction, z = perpendicular to the segment
   * in its vertical plane (up-ish).
   */
  sweepSegment(from: THREE.Vector3Tuple, to: THREE.Vector3Tuple, profile: Profile, color: THREE.Color, caps = false) {
    const sec = section(profile);
    const a = new THREE.Vector3(...from);
    const b = new THREE.Vector3(...to);
    const d = b.clone().sub(a).normalize();
    const side = new THREE.Vector3(-d.z, 0, d.x).normalize();
    const up = new THREE.Vector3().crossVectors(side, d).normalize();
    if (up.y < 0) up.negate();
    const at = (p: THREE.Vector3, r: number, z: number) => p.clone().addScaledVector(side, r).addScaledVector(up, z);
    for (let s = 0; s < sec.n; s++) {
      if (sec.len[s] === 0) continue;
      const ids: number[] = [];
      for (const end of [0, 1] as const) {
        const [r, z] = sec.pts[(s + end) % sec.n];
        const [nr, nz] = sec.endNormal(s, end);
        const n = side.clone().multiplyScalar(nr).addScaledVector(up, nz);
        for (const p of [a, b]) {
          const v = at(p, r, z);
          ids.push(this.vertex([v.x, v.y, v.z], [n.x, n.y, n.z], color, sec.shade[s]));
        }
      }
      this.quad(ids[0], ids[1], ids[3], ids[2]);
    }
    if (!caps) return;
    const tris = THREE.ShapeUtils.triangulateShape(
      sec.pts.map(([r, z]) => new THREE.Vector2(r, z)),
      []
    );
    for (const [p, sign] of [
      [a, -1],
      [b, 1],
    ] as const) {
      const ids = sec.pts.map(([r, z]) => {
        const v = at(p, r, z);
        return this.vertex([v.x, v.y, v.z], [d.x * sign, d.y * sign, d.z * sign], color, 1);
      });
      for (const [i, j, k] of tris) this.tri(ids[i], ids[j], ids[k]);
    }
  }

  /** Appends a plain three.js geometry (boxes/cylinders for hardware), dropping its uv, flat colour. */
  addGeometry(geo: THREE.BufferGeometry, color: THREE.Color) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    const pos = g.attributes.position;
    const nrm = g.attributes.normal;
    const base = this.positions.length / 3;
    for (let i = 0; i < pos.count; i++) {
      this.positions.push(pos.getX(i), pos.getY(i), pos.getZ(i));
      this.normals.push(nrm.getX(i), nrm.getY(i), nrm.getZ(i));
      this.colors.push(color.r, color.g, color.b);
      if (i % 3 === 2) this.indices.push(base + i - 2, base + i - 1, base + i);
    }
    if (g !== geo) g.dispose();
  }

  /** Appends another builder's geometry moved by `matrix` (a rigid motion — a mirror would flip the winding). */
  append(other: SweepBuilder, matrix: THREE.Matrix4) {
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(matrix);
    const base = this.positions.length / 3;
    const v = new THREE.Vector3();
    for (let i = 0; i < other.positions.length; i += 3) {
      v.fromArray(other.positions, i).applyMatrix4(matrix);
      this.positions.push(v.x, v.y, v.z);
      v.fromArray(other.normals, i).applyMatrix3(normalMatrix).normalize();
      this.normals.push(v.x, v.y, v.z);
    }
    for (const c of other.colors) this.colors.push(c);
    for (const i of other.indices) this.indices.push(base + i);
  }

  get empty() {
    return this.indices.length === 0;
  }

  toGeometry(matrix?: THREE.Matrix4): THREE.BufferGeometry {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(this.positions, 3));
    geo.setAttribute("normal", new THREE.Float32BufferAttribute(this.normals, 3));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(this.colors, 3));
    geo.setIndex(this.indices);
    if (matrix) geo.applyMatrix4(matrix);
    geo.computeBoundingBox();
    geo.computeBoundingSphere();
    return geo;
  }
}

/** Closed cross-section with per-segment outward normals, lengths and shades. */
function section(profile: Profile) {
  // Drop repeated points (a mirrored section repeats its centre point); the later point's shade wins, since
  // the segment that really starts there is the one after the repeat.
  const pts: [number, number][] = [];
  const shade: number[] = [];
  for (const p of profile) {
    const prev = pts[pts.length - 1];
    if (prev && Math.abs(prev[0] - p[0]) < 1e-9 && Math.abs(prev[1] - p[1]) < 1e-9) {
      shade[shade.length - 1] = p[2] ?? 1;
      continue;
    }
    pts.push([p[0], p[1]]);
    shade.push(p[2] ?? 1);
  }
  if (pts.length > 1 && Math.abs(pts[0][0] - pts[pts.length - 1][0]) < 1e-9 && Math.abs(pts[0][1] - pts[pts.length - 1][1]) < 1e-9) {
    pts.pop();
    shade.pop();
  }
  const n = pts.length;
  let area = 0;
  for (let i = 0; i < n; i++) {
    const [r0, z0] = pts[i];
    const [r1, z1] = pts[(i + 1) % n];
    area += r0 * z1 - r1 * z0;
  }
  // Outward normal of an edge: (dz, -dr) for a counter-clockwise loop, the opposite for a clockwise one.
  const flip = area > 0 ? 1 : -1;
  const segN: [number, number][] = [];
  const len: number[] = [];
  for (let i = 0; i < n; i++) {
    const [r0, z0] = pts[i];
    const [r1, z1] = pts[(i + 1) % n];
    const l = Math.hypot(r1 - r0, z1 - z0);
    len.push(l);
    segN.push(l > 0 ? [(flip * (z1 - z0)) / l, (-flip * (r1 - r0)) / l] : [0, 1]);
  }
  const endNormal = (seg: number, end: 0 | 1): [number, number] => {
    let other = seg;
    // Skip zero-length neighbours.
    for (let k = 0; k < n; k++) {
      other = end === 0 ? (other - 1 + n) % n : (other + 1) % n;
      if (len[other] > 0) break;
    }
    const a = segN[seg];
    const b = segN[other];
    if (a[0] * b[0] + a[1] * b[1] < CREASE_COS) return a;
    const x = a[0] + b[0];
    const y = a[1] + b[1];
    const l = Math.hypot(x, y) || 1;
    return [x / l, y / l];
  };
  return { pts, shade, n, len, endNormal };
}

/** Points of a circular arc (centre cr,cz, radius rad) from angle a0 to a1, `n` segments, start excluded. */
export function arc(cr: number, cz: number, rad: number, a0: number, a1: number, n: number, shade?: number): Profile {
  const out: Profile = [];
  for (let i = 1; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    const p: ProfilePoint = shade === undefined ? [cr + rad * Math.cos(a), cz + rad * Math.sin(a)] : [cr + rad * Math.cos(a), cz + rad * Math.sin(a), shade];
    out.push(p);
  }
  return out;
}

/**
 * Symmetric bar cross-section from a half front profile: `half` runs from one sight edge (r = 0) to the bar's
 * centre line (r = halfWidth); it's mirrored onto the other side and closed along the back at z = zBack.
 */
export function mirroredSection(half: Profile, halfWidth: number, zBack: number): Profile {
  const left: Profile = half.map((p) => [p[0] - halfWidth, p[1], p[2] ?? 1]);
  const right: Profile = [...half]
    .reverse()
    .map((p, i, arr) => [halfWidth - p[0], p[1], (arr[i + 1] ?? p)[2] ?? 1] as ProfilePoint);
  return [...left, ...right, [halfWidth, zBack], [-halfWidth, zBack]];
}
