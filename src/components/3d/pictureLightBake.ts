// Picture-light wall wash, baked once per room (2026-11-25) — so every lamp is always on at no per-frame cost.
//
// The lamps don't move, so the light they throw on the walls doesn't either. PictureLightBaker.tsx renders it
// into one atlas with the very same GLSL the live term used (pictureLight.ts PICTURE_LIGHT_FUNCTIONS), and the
// walls read it back (roomAoMaterial.ts, ROOM_PICTURE_LIGHT). Each texel stores the light *before* the surface
// cosine, plus the direction to the lamp: rgb = I·(lamp − p), a = I (I = intensity per unit lamp power). Both
// are linear, so overlapping lamps simply add and bilinear filtering gives the intensity-weighted direction;
// the wall then runs three's own BRDF (RE_Direct) with that light — its normal map and specular respond
// exactly like they did to the old spotLights. Storing the offset to the lamp instead of the lamp's position
// keeps HalfFloat precision (offsets are ≤ a few metres).
//
// Atlas: only what some lamp reaches. For every rendered wall piece face whose front side sees a lamp, the
// part of the face inside that lamp's influence box (pictureLightInfluence) — unioned over lamps — becomes one
// rect. Everything else on the walls maps to a single reserved black texel. Walls look rects up through two
// vertex attributes: `pictureLightUv` (linear over the face, may run outside the rect) and
// `pictureLightUvClamp` (the rect incl. its gutter) — outside the rect the light is exactly zero, and so is
// the gutter there.

import * as THREE from "three";
import type { WallSegment } from "./galleryLayout";
import { isTouchPrimaryDevice } from "../../lib/navigationMode";
import { DAYLIGHT_GUTTER, FACE_NORMALS, MAX_ATLAS_SIZE, faceAxes, packRects, type AtlasRect } from "./daylightBake";
import { pictureLightInfluence, type PictureLightPlacement } from "./pictureLight";

/** Texel size on the walls. The wash is smooth (0.3 m soft edges), so this is far coarser than the daylight bake. */
export const PICTURE_LIGHT_TEXEL = isTouchPrimaryDevice() ? 0.05 : 0.025;

export interface PictureLightRect extends AtlasRect {
  /** Index into the wall list the atlas was built from, and which box face (three's BoxGeometry order). */
  piece: number;
  face: number;
  /** The face fraction this rect covers along the face's u/v axes: u0, v0, u1, v1 (0..1). */
  span: [number, number, number, number];
  /** Indices of the lamps reaching it. */
  lights: number[];
}

export interface PictureLightAtlas {
  width: number;
  height: number;
  rects: PictureLightRect[];
  /** The reserved black texel every unlit face maps to (pixel position). */
  dark: { x: number; y: number };
}

const EPS = 1e-4;

interface FaceHit {
  piece: number;
  face: number;
  origin: THREE.Vector3;
  uAxis: THREE.Vector3;
  vAxis: THREE.Vector3;
  normal: THREE.Vector3;
  span: [number, number, number, number];
  lights: number[];
}

/** Every wall face (with the part of it) some lamp reaches. */
function litFaces(walls: WallSegment[], lights: PictureLightPlacement[]): FaceHit[] {
  const influences = lights.map(pictureLightInfluence);
  const hits: FaceHit[] = [];
  walls.forEach((wall, piece) => {
    const half = wall.size.map((s) => s / 2);
    for (let face = 0; face < 6; face++) {
      const k = Math.floor(face / 2);
      const sign = face % 2 === 0 ? 1 : -1;
      const [ua, va] = faceAxes(face);
      const plane = wall.position[k] + sign * half[k];
      const box = new THREE.Box3(
        new THREE.Vector3(...wall.position).sub(new THREE.Vector3(...half)),
        new THREE.Vector3(...wall.position).add(new THREE.Vector3(...half))
      );
      box.min.setComponent(k, plane - EPS);
      box.max.setComponent(k, plane + EPS);
      const lo = [box.min.getComponent(ua), box.min.getComponent(va)];
      const size = [wall.size[ua], wall.size[va]];
      let span: [number, number, number, number] | null = null;
      const reaching: number[] = [];
      for (let i = 0; i < lights.length; i++) {
        // The lamp must be in front of the face (behind it, N·L < 0 everywhere).
        if (sign * (lights[i].position.getComponent(k) - plane) <= 0) continue;
        const hit = box.clone().intersect(influences[i]);
        if (hit.isEmpty()) continue;
        const u0 = (hit.min.getComponent(ua) - lo[0]) / size[0];
        const u1 = (hit.max.getComponent(ua) - lo[0]) / size[0];
        const v0 = (hit.min.getComponent(va) - lo[1]) / size[1];
        const v1 = (hit.max.getComponent(va) - lo[1]) / size[1];
        span = span
          ? [Math.min(span[0], u0), Math.min(span[1], v0), Math.max(span[2], u1), Math.max(span[3], v1)]
          : [u0, v0, u1, v1];
        reaching.push(i);
      }
      if (!span) continue;
      const s: [number, number, number, number] = span;
      const clamped: [number, number, number, number] = [
        THREE.MathUtils.clamp(s[0], 0, 1),
        THREE.MathUtils.clamp(s[1], 0, 1),
        THREE.MathUtils.clamp(s[2], 0, 1),
        THREE.MathUtils.clamp(s[3], 0, 1),
      ];
      // Never a zero-width span (it divides the face fraction in addPictureLightUv).
      if (clamped[2] - clamped[0] < 1e-6) clamped[2] = Math.min(clamped[0] + 1e-3, 1);
      if (clamped[3] - clamped[1] < 1e-6) clamped[3] = Math.min(clamped[1] + 1e-3, 1);
      const origin = new THREE.Vector3(...wall.position);
      origin.setComponent(k, plane);
      origin.setComponent(ua, wall.position[ua] - half[ua]);
      origin.setComponent(va, wall.position[va] - half[va]);
      hits.push({
        piece,
        face,
        origin,
        uAxis: new THREE.Vector3().setComponent(ua, wall.size[ua]),
        vAxis: new THREE.Vector3().setComponent(va, wall.size[va]),
        normal: new THREE.Vector3(...FACE_NORMALS[face]),
        span: clamped,
        lights: reaching,
      });
    }
  });
  return hits;
}

/**
 * Lays out the picture-light atlas for a room. `walls` must be the pieces actually rendered. Null when no lamp
 * reaches any wall (a room without paintings) — the walls then compile no picture-light code at all.
 */
export function buildPictureLightAtlas(
  walls: WallSegment[],
  lights: PictureLightPlacement[],
  maxSize = MAX_ATLAS_SIZE
): PictureLightAtlas | null {
  const hits = litFaces(walls, lights);
  if (!hits.length) return null;
  let texel = PICTURE_LIGHT_TEXEL;
  for (;;) {
    const sizes = hits.map((h) => ({
      w: Math.max(1, Math.ceil(((h.span[2] - h.span[0]) * h.uAxis.length()) / texel)),
      h: Math.max(1, Math.ceil(((h.span[3] - h.span[1]) * h.vAxis.length()) / texel)),
    }));
    // The black texel goes last (index = hits.length).
    const packed = packRects([...sizes, { w: 1, h: 1 }], maxSize);
    if (packed) {
      const rects = hits.map((h, i): PictureLightRect => {
        const [u0, v0, u1, v1] = h.span;
        return {
          ...packed.at[i],
          w: sizes[i].w,
          h: sizes[i].h,
          origin: h.origin.clone().addScaledVector(h.uAxis, u0).addScaledVector(h.vAxis, v0),
          uAxis: h.uAxis.clone().multiplyScalar(u1 - u0),
          vAxis: h.vAxis.clone().multiplyScalar(v1 - v0),
          normal: h.normal,
          piece: h.piece,
          face: h.face,
          span: h.span,
          lights: h.lights,
        };
      });
      return { width: packed.width, height: packed.height, rects, dark: packed.at[hits.length] };
    }
    texel *= 1.25;
  }
}

/**
 * Adds `pictureLightUv` + `pictureLightUvClamp` to a wall piece's box geometry (local coordinates, centred on
 * the piece). Faces without a rect point both at the black texel.
 */
export function addPictureLightUv(
  geometry: THREE.BufferGeometry,
  atlas: PictureLightAtlas,
  piece: number,
  size: [number, number, number]
): void {
  const pos = geometry.attributes.position;
  const nrm = geometry.attributes.normal;
  const uv = new Float32Array(pos.count * 2);
  const clamp = new Float32Array(pos.count * 4);
  const W = atlas.width;
  const H = atlas.height;
  const g = DAYLIGHT_GUTTER;
  const byFace = new Map(atlas.rects.filter((r) => r.piece === piece).map((r) => [r.face, r]));
  const darkU = (atlas.dark.x + 0.5) / W;
  const darkV = (atlas.dark.y + 0.5) / H;
  for (let i = 0; i < pos.count; i++) {
    const n = [nrm.getX(i), nrm.getY(i), nrm.getZ(i)];
    const k = n.reduce((best, _, j) => (Math.abs(n[j]) > Math.abs(n[best]) ? j : best), 0);
    const face = k * 2 + (n[k] > 0 ? 0 : 1);
    const r = byFace.get(face);
    if (!r) {
      uv.set([darkU, darkV], i * 2);
      clamp.set([darkU, darkV, darkU, darkV], i * 4);
      continue;
    }
    const [ua, va] = faceAxes(face);
    const p = [pos.getX(i), pos.getY(i), pos.getZ(i)];
    const fu = (p[ua] / size[ua] + 0.5 - r.span[0]) / (r.span[2] - r.span[0]);
    const fv = (p[va] / size[va] + 0.5 - r.span[1]) / (r.span[3] - r.span[1]);
    uv.set([(r.x + fu * r.w) / W, (r.y + fv * r.h) / H], i * 2);
    clamp.set([(r.x - g + 0.5) / W, (r.y - g + 0.5) / H, (r.x + r.w + g - 0.5) / W, (r.y + r.h + g - 0.5) / H], i * 4);
  }
  geometry.setAttribute("pictureLightUv", new THREE.BufferAttribute(uv, 2));
  geometry.setAttribute("pictureLightUvClamp", new THREE.BufferAttribute(clamp, 4));
}

/** World point a texel centre of `rect` stands for (texel coordinates relative to the rect's inner corner). */
export function rectTexelWorld(rect: AtlasRect, tx: number, ty: number): THREE.Vector3 {
  return rect.origin.clone().addScaledVector(rect.uAxis, tx / rect.w).addScaledVector(rect.vAxis, ty / rect.h);
}

/** Up to this many lamps are evaluated live on a painting / label (its own + a neighbour whose wash reaches it). */
export const MAX_OBJECT_PICTURE_LIGHTS = 2;

/**
 * The lamps whose light can reach `box` (world): those whose influence box intersects it, `own` first, then
 * nearest first, at most MAX_OBJECT_PICTURE_LIGHTS.
 */
export function lampsReaching(box: THREE.Box3, lights: PictureLightPlacement[], own = -1): number[] {
  const centre = box.getCenter(new THREE.Vector3());
  return lights
    .map((light, i) => ({ i, hit: pictureLightInfluence(light).intersectsBox(box), d: light.position.distanceTo(centre) }))
    .filter((c) => c.hit)
    .sort((a, b) => (a.i === own ? -1 : b.i === own ? 1 : a.d - b.d))
    .slice(0, MAX_OBJECT_PICTURE_LIGHTS)
    .map((c) => c.i);
}

/** World AABB of a box given in a painting's local frame (origin `position`, turned by `rotationY`). */
export function localBoxToWorld(
  position: [number, number, number],
  rotationY: number,
  min: [number, number, number],
  max: [number, number, number]
): THREE.Box3 {
  const m = new THREE.Matrix4().makeRotationY(rotationY).setPosition(...position);
  return new THREE.Box3(new THREE.Vector3(...min), new THREE.Vector3(...max)).applyMatrix4(m);
}
