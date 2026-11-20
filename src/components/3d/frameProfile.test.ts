import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { FRAME_BORDER, FRAME_DEPTH } from "./artworkShadow";
import {
  CANVAS_RECESS,
  FRAME_PROFILES,
  SIGHT_OVERLAP,
  buildFrameGeometry,
  canvasZ,
  closedProfile,
  getFrameGeometry,
} from "./frameProfile";
import type { FrameStyle } from "./artworks";

const STYLES = Object.keys(FRAME_PROFILES) as FrameStyle[];
const W = 1.2;
const H = 0.9;

function geometry(style: FrameStyle) {
  return buildFrameGeometry(W, H, FRAME_PROFILES[style], 0.6);
}

describe("frame width", () => {
  it("is slim and the same on every painting size and style (user request, 2026-11-20)", () => {
    expect(FRAME_BORDER).toBeLessThanOrEqual(0.045);
    for (const style of STYLES)
      for (const [w, h] of [[0.3, 0.4], [1.2, 0.9], [2.5, 1.8]]) {
        const box = buildFrameGeometry(w, h, FRAME_PROFILES[style], 0.6).boundingBox!;
        expect(box.max.x - w / 2).toBeCloseTo(FRAME_BORDER, 5);
        expect(box.max.y - h / 2).toBeCloseTo(FRAME_BORDER, 5);
      }
  });
});

describe.each(STYLES)("%s frame", (style) => {
  const geo = geometry(style);
  const pos = geo.attributes.position;
  const nrm = geo.attributes.normal;

  it("fills exactly the old frame volume (wall shadow, picking and outline still line up)", () => {
    const box = geo.boundingBox!;
    expect(box.max.x).toBeCloseTo(W / 2 + FRAME_BORDER, 5);
    expect(box.min.y).toBeCloseTo(-H / 2 - FRAME_BORDER, 5);
    expect(box.max.z).toBeCloseTo(0, 3); // arcs are sampled: crown within 1 mm of the face plane
    expect(box.min.z).toBeCloseTo(-FRAME_DEPTH, 5);
  });

  it("covers the canvas edge — no gap between canvas and sight edge", () => {
    // Vertices sit on the mitre diagonals, so the opening is where |x| − W/2 is smallest.
    let inner = Infinity;
    for (let i = 0; i < pos.count; i++) inner = Math.min(inner, Math.abs(pos.getX(i)) - W / 2);
    expect(inner).toBeCloseTo(-SIGHT_OVERLAP, 5);
  });

  it("has unit normals and front faces wound to agree with them", () => {
    const idx = geo.index!;
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const c = new THREE.Vector3();
    for (let i = 0; i < nrm.count; i++) {
      expect(Math.hypot(nrm.getX(i), nrm.getY(i), nrm.getZ(i))).toBeCloseTo(1, 5);
    }
    for (let i = 0; i < idx.count; i += 3) {
      a.fromBufferAttribute(pos, idx.getX(i));
      b.fromBufferAttribute(pos, idx.getX(i + 1));
      c.fromBufferAttribute(pos, idx.getX(i + 2));
      const face = b.clone().sub(a).cross(c.clone().sub(a));
      if (face.lengthSq() < 1e-14) continue;
      const n = new THREE.Vector3().fromBufferAttribute(nrm, idx.getX(i));
      expect(face.dot(n)).toBeGreaterThan(0);
    }
  });

  it("has a moulded face — normals that tilt, not just a flat front", () => {
    let tilted = 0;
    for (let i = 0; i < nrm.count; i++) {
      const z = nrm.getZ(i);
      if (z > 0.2 && z < 0.97) tilted++;
    }
    expect(tilted).toBeGreaterThan(8);
  });

  it("mitres the corners at 45°", () => {
    // Every vertex at a corner of its side lies on a diagonal |x| − W/2 = |y| − H/2.
    let onDiagonal = 0;
    for (let i = 0; i < pos.count; i++) {
      const dx = Math.abs(pos.getX(i)) - W / 2;
      const dy = Math.abs(pos.getY(i)) - H / 2;
      if (Math.abs(dx - dy) < 1e-6) onDiagonal++;
    }
    expect(onDiagonal).toBe(pos.count);
  });

  it("sits the canvas in a rebate behind the sight edge and the face", () => {
    const front = FRAME_PROFILES[style];
    expect(canvasZ(style)).toBe(-CANVAS_RECESS);
    expect(front[0][1]).toBeGreaterThan(canvasZ(style)); // sight edge in front of the canvas
    expect(Math.max(...front.map(([, z]) => z))).toBeCloseTo(0, 3); // face reaches z = 0
    expect(CANVAS_RECESS).toBeGreaterThanOrEqual(0.01);
    expect(CANVAS_RECESS).toBeLessThanOrEqual(0.015);
  });

  it("stays cheap: a few hundred triangles at most", () => {
    expect(geo.index!.count / 3).toBeLessThan(300);
  });
});

describe("frame profiles", () => {
  it("closes each profile into a loop round the back", () => {
    for (const style of STYLES) {
      const loop = closedProfile(FRAME_PROFILES[style]);
      expect(loop).toContainEqual([FRAME_BORDER, -FRAME_DEPTH]);
      expect(loop).toContainEqual([0, -FRAME_DEPTH]);
      for (const [r, z] of loop) {
        expect(r).toBeGreaterThanOrEqual(-1e-9);
        expect(r).toBeLessThanOrEqual(FRAME_BORDER + 1e-9);
        expect(z).toBeLessThanOrEqual(1e-9);
        expect(z).toBeGreaterThanOrEqual(-FRAME_DEPTH - 1e-9);
      }
    }
  });

  it("gives gold a richer moulding than the slim modern frame", () => {
    expect(FRAME_PROFILES.gold.length).toBeGreaterThan(FRAME_PROFILES.modernBlack.length);
  });

  it("unframed works keep their canvas just in front of the hang plane", () => {
    expect(canvasZ(null)).toBeGreaterThan(0);
  });

  it("caches geometry per style and size", () => {
    expect(getFrameGeometry("gold", 1, 1, 0.6)).toBe(getFrameGeometry("gold", 1, 1, 0.6));
    expect(getFrameGeometry("gold", 1, 1, 0.6)).not.toBe(getFrameGeometry("walnut", 1, 1, 0.6));
  });
});
