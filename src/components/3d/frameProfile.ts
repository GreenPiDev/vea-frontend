// Picture frames swept from a 2D moulding profile (sergi-gercekcilestirme.md Adım 8).
//
// A sharp-edged flat box with the canvas flush on its face is the detail that most gives a close-up view
// away. Real frames have a moulded profile (rounded crown, cove, bead) whose edges catch the picture lamp,
// and the canvas sits in a rebate ~1–1.5 cm behind the frame's face, with the inner lip throwing a thin
// shadow line along the top edge (here simply the downward-facing inner wall, which the lamp above can't
// reach — no extra AO needed).
//
// Geometry: profile point k = (r, z), r measured outward from the sight edge, z toward the room. Point k
// traces a rectangle with half-size (innerHalfW + r, innerHalfH + r) at depth z; joining consecutive
// rectangles' corners gives the four sides with exact 45° mitres for free. Each side gets its own vertices
// (its own normals); profile creases get split normals, smooth parts averaged ones. UVs run along the side
// (u) and along the profile's arc length (v), in metres / tileSize, so the gold/walnut scans follow the
// moulding at real-world scale on every frame size and the material stays shared (frameMaterialCache).
//
// Outer size and depth are unchanged (FRAME_BORDER × FRAME_DEPTH, back face at −FRAME_DEPTH), so the wall
// shadow (artworkShadow.ts), click picking and the outline still line up. Pure; tested in frameProfile.test.ts.

import * as THREE from "three";
import type { FrameStyle } from "./artworks";
import { FRAME_BORDER, FRAME_DEPTH } from "./artworkShadow";

/** Canvas plane, relative to the frame's front (z = 0): sits in the rebate behind the sight edge. */
export const CANVAS_RECESS = 0.014;
/** Unframed works keep their canvas just in front of the hang plane, as before. */
const UNFRAMED_CANVAS_Z = 0.004;
/** The sight edge overlaps the canvas by this much, so no gap shows around it. */
export const SIGHT_OVERLAP = 0.004;

/** Canvas plane's z relative to the painting's position (the frame's front face is at 0). */
export function canvasZ(frame: FrameStyle | null | undefined): number {
  return frame ? -CANVAS_RECESS : UNFRAMED_CANVAS_Z;
}

/** Profile points (r, z), from the sight edge across the face to the outer edge (front part only). */
export type ProfilePoints = [number, number][];

/** The moulding profiles below are drawn at this face width; `scaleProfile` fits them to FRAME_BORDER, so
 * the frame width can be changed in one place (artworkShadow.ts) without redrawing every profile. */
const PROFILE_DESIGN_BORDER = 0.07;
const B = PROFILE_DESIGN_BORDER;
const D = FRAME_DEPTH;

/** Scales a profile's across-the-face coordinate (r) from the design width to FRAME_BORDER; depth (z) is kept. */
function scaleProfile(points: ProfilePoints): ProfilePoints {
  const k = FRAME_BORDER / PROFILE_DESIGN_BORDER;
  return points.map(([r, z]) => [r * k, z]);
}

/** Samples a circular arc (centre cr,cz, radius rad) from angle a0 to a1, `n` segments, excluding the start. */
function arc(cr: number, cz: number, rad: number, a0: number, a1: number, n: number): ProfilePoints {
  const out: ProfilePoints = [];
  for (let i = 1; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    out.push([cr + rad * Math.cos(a), cz + rad * Math.sin(a)]);
  }
  return out;
}

/** Ornate gilded moulding: sight bead, cove, rounded crown, rolled outer edge. */
const GOLD_PROFILE: ProfilePoints = [
  [0, -0.009],
  // bead at the sight edge
  ...arc(0.0045, -0.009, 0.0045, Math.PI, 0, 5),
  // cove (concave) down and out
  ...arc(0.016, -0.004, 0.0068, Math.PI * 1.05, Math.PI * 1.75, 4),
  // rising to the crown
  [0.032, -0.006],
  ...arc(0.047, -0.011, 0.011, Math.PI * 0.8, Math.PI * 0.1, 6),
  // rolled outer edge falling to the side
  ...arc(B - 0.012, -0.018, 0.012, Math.PI * 0.35, 0, 4),
];

/** Plain walnut: chamfered sight edge, gently convex face, rounded outer edge. */
const WALNUT_PROFILE: ProfilePoints = [
  [0, -0.01],
  [0.008, -0.004],
  ...arc(0.036, -0.03, 0.03, Math.PI * 0.62, Math.PI * 0.38, 5),
  ...arc(B - 0.008, -0.008, 0.008, Math.PI * 0.45, 0, 4),
];

/** Slim modern profile: small sight chamfer, flat face, softly rounded outer edge. */
const MODERN_PROFILE: ProfilePoints = [
  [0, -0.008],
  [0.006, -0.002],
  [0.006, 0],
  [B - 0.004, 0],
  ...arc(B - 0.004, -0.004, 0.004, Math.PI / 2, 0, 3),
];

export const FRAME_PROFILES: Record<FrameStyle, ProfilePoints> = {
  gold: scaleProfile(GOLD_PROFILE),
  walnut: scaleProfile(WALNUT_PROFILE),
  modernBlack: scaleProfile(MODERN_PROFILE),
};

/** Full closed loop: front profile, outer side down to the back, back across, inner rebate wall up. */
export function closedProfile(front: ProfilePoints): ProfilePoints {
  const last = front[front.length - 1];
  const first = front[0];
  const loop: ProfilePoints = front.map(([r, z]) => [r, z]);
  if (last[0] !== FRAME_BORDER || last[1] !== -D) loop.push([FRAME_BORDER, -D]);
  loop.push([0, -D]);
  if (first[1] !== -D) loop.push([0, first[1]]); // closes back onto the first point
  return loop;
}

/** Normals sharper than this between two profile segments are split (crease); gentler ones are smoothed. */
const CREASE_COS = Math.cos(THREE.MathUtils.degToRad(35));

// Sides: outward direction in the frame plane, and the tangent along which the side runs.
const SIDES = [
  { o: [1, 0], t: [0, 1] }, // right
  { o: [0, 1], t: [-1, 0] }, // top
  { o: [-1, 0], t: [0, -1] }, // left
  { o: [0, -1], t: [1, 0] }, // bottom
] as const;

/**
 * Frame geometry for a canvas of `canvasW` × `canvasH`: the sight opening is the canvas minus
 * SIGHT_OVERLAP on each side, and the outer edge is canvas + FRAME_BORDER (as the wall shadow assumes).
 */
export function buildFrameGeometry(
  canvasW: number,
  canvasH: number,
  front: ProfilePoints,
  tileSize: number
): THREE.BufferGeometry {
  // Profile r is measured from the outer edge inward-shifted so the outer edge lands at canvas + FRAME_BORDER.
  const hw = canvasW / 2 - SIGHT_OVERLAP;
  const hh = canvasH / 2 - SIGHT_OVERLAP;
  const rScale = (FRAME_BORDER + SIGHT_OVERLAP) / FRAME_BORDER; // stretch the profile over the slightly wider band
  const loop = closedProfile(front).map(([r, z]) => [r * rScale, z] as [number, number]);
  const n = loop.length;

  // Segment normals in (r, z). The loop runs front-outward, back, inward, up: outward normal = (dz, -dr)
  // rotated so the front face points +z.
  const segN: [number, number][] = [];
  const segLen: number[] = [];
  for (let i = 0; i < n; i++) {
    const [r0, z0] = loop[i];
    const [r1, z1] = loop[(i + 1) % n];
    const dr = r1 - r0;
    const dz = z1 - z0;
    const len = Math.hypot(dr, dz);
    segLen.push(len);
    segN.push(len > 0 ? [-dz / len, dr / len] : [0, 1]);
  }
  // Orientation check: the crown segment must face +z; flip all if the loop came out clockwise.
  let area = 0;
  for (let i = 0; i < n; i++) {
    const [r0, z0] = loop[i];
    const [r1, z1] = loop[(i + 1) % n];
    area += r0 * z1 - r1 * z0;
  }
  if (area > 0) for (const s of segN) { s[0] = -s[0]; s[1] = -s[1]; }

  // Normal at each end of each segment: averaged with the neighbour unless the joint is a crease.
  const endNormal = (seg: number, end: 0 | 1): [number, number] => {
    const other = end === 0 ? (seg - 1 + n) % n : (seg + 1) % n;
    const a = segN[seg];
    const b = segN[other];
    if (a[0] * b[0] + a[1] * b[1] < CREASE_COS) return a;
    const x = a[0] + b[0];
    const y = a[1] + b[1];
    const l = Math.hypot(x, y) || 1;
    return [x / l, y / l];
  };

  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  let arcV = 0;
  const arcAt: number[] = [];
  for (let i = 0; i < n; i++) { arcAt.push(arcV); arcV += segLen[i]; }

  for (const side of SIDES) {
    const [ox, oy] = side.o;
    const [tx, ty] = side.t;
    const halfAcross = ox !== 0 ? hw : hh; // distance from centre to this side's sight edge
    const halfAlong = ox !== 0 ? hh : hw;
    for (let s = 0; s < n; s++) {
      if (segLen[s] === 0) continue;
      const base = positions.length / 3;
      for (const end of [0, 1] as const) {
        const [r, z] = loop[(s + end) % n];
        const [nr, nz] = endNormal(s, end);
        const across = halfAcross + r;
        const along = halfAlong + r; // mitre: the corner moves out with r on both axes
        for (const sign of [-1, 1]) {
          positions.push(ox * across + tx * along * sign, oy * across + ty * along * sign, z);
          normals.push(ox * nr, oy * nr, nz);
          uvs.push((along * sign) / tileSize, (arcAt[s] + (end ? segLen[s] : 0)) / tileSize);
        }
      }
      // base+0: start/-, base+1: start/+, base+2: end/-, base+3: end/+
      indices.push(base, base + 1, base + 3, base, base + 3, base + 2);
    }
  }

  // Fix winding per triangle so front faces agree with the normals (robust to profile direction).
  for (let i = 0; i < indices.length; i += 3) {
    const [a, b, c] = [indices[i], indices[i + 1], indices[i + 2]];
    const p = (k: number) => new THREE.Vector3(positions[k * 3], positions[k * 3 + 1], positions[k * 3 + 2]);
    const face = new THREE.Vector3().crossVectors(p(b).sub(p(a)), p(c).sub(p(a)));
    const nrm = new THREE.Vector3(normals[a * 3], normals[a * 3 + 1], normals[a * 3 + 2]);
    if (face.dot(nrm) < 0) { indices[i + 1] = c; indices[i + 2] = b; }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  return geo;
}

// Frames of the same style and size share one geometry (a template room often repeats sizes). Kept for the
// session — a few KB each.
const frameGeometryCache = new Map<string, THREE.BufferGeometry>();

export function getFrameGeometry(style: FrameStyle, canvasW: number, canvasH: number, tileSize: number) {
  const key = `${style}:${canvasW.toFixed(3)}:${canvasH.toFixed(3)}:${tileSize}`;
  let geo = frameGeometryCache.get(key);
  if (!geo) {
    geo = buildFrameGeometry(canvasW, canvasH, FRAME_PROFILES[style], tileSize);
    frameGeometryCache.set(key, geo);
  }
  return geo;
}
