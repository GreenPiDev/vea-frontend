// Daylight lightmap for the room's own surfaces (floor, ceiling, walls) — baked once per room on the GPU.
//
// The window light (windowLight.ts), the sun patches (sunLight.ts) and the furniture/painting sun shadows
// (sunOccluders.ts) don't move while the visitor walks, yet evaluating them per pixel every frame cost ~20 fps
// in vitrin-8. So the room surfaces read them from a texture instead: when the room (or its sun, windows or
// shadow casters) changes, DaylightBaker.tsx rasterises every surface into one atlas — each texel runs the
// exact same GLSL functions at its world position and normal — and the room-AO patch samples it
// (roomAoMaterial.ts, ROOM_DAYLIGHT = baked). Furniture, paintings, labels, window joinery and baseboards
// cover little of the screen and keep the live evaluation.
//
// Atlas: the floor and the ceiling as one rect each over the room's footprint (looked up from world x/z, no
// UVs needed), plus one rect per visible face of every wall piece (faces outside the footprint skipped) (looked up through a `daylightUv` vertex
// attribute added to the wall geometries). Texel size 2 cm on walls and floor (4 cm on touch devices) (sharp enough for the
// glazing-bar shadows next to a window), coarser on the ceiling (only soft window/bounce light reaches it),
// grown if a huge room wouldn't fit MAX_ATLAS_SIZE². Each rect has a GUTTER of extrapolated texels so
// bilinear filtering never reads a neighbour.
//
// Known difference from the live term: the bake uses the surface's geometric normal, so the floor/wall
// normal maps no longer modulate the daylight (they still shape the ceiling lights, the env reflections and
// the picture lights).

import * as THREE from "three";
import type { WallSegment } from "./galleryLayout";
import { isTouchPrimaryDevice } from "../../lib/navigationMode";

export const DAYLIGHT_TEXEL = isTouchPrimaryDevice() ? 0.04 : 0.02;
export const DAYLIGHT_CEILING_TEXEL = isTouchPrimaryDevice() ? 0.15 : 0.1;
export const MAX_ATLAS_SIZE = 2048;
/** Extrapolated border texels around every rect (bilinear safety). */
export const DAYLIGHT_GUTTER = 2;

export interface AtlasRect {
  /** Pixel position of the rect's inner (un-guttered) area in the atlas. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** World point at the rect's (u = 0, v = 0) corner, and the world vectors spanning u and v (full length). */
  origin: THREE.Vector3;
  uAxis: THREE.Vector3;
  vAxis: THREE.Vector3;
  normal: THREE.Vector3;
}

export interface FaceRect extends AtlasRect {
  /** Index into the wall list the atlas was built from, and which box face (three's BoxGeometry order: ±x, ±y, ±z). */
  piece: number;
  face: number;
}

export interface DaylightAtlas {
  width: number;
  height: number;
  floor: AtlasRect;
  ceiling: AtlasRect;
  faces: FaceRect[];
  /** Floor/ceiling footprint: minX, minZ, sizeX, sizeZ. */
  bounds: [number, number, number, number];
}

interface PendingRect {
  w: number;
  h: number;
  rect: Omit<AtlasRect, "x" | "y" | "w" | "h">;
  piece?: number;
  face?: number;
}

export const FACE_NORMALS: [number, number, number][] = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];

/** For a box face: the local axes its u/v run along (same as buildWorldUvBoxGeometry's projection). */
export function faceAxes(face: number): [number, number] {
  const k = Math.floor(face / 2);
  if (k === 0) return [2, 1]; // ±x faces: u = z, v = y
  if (k === 1) return [0, 2]; // ±y faces: u = x, v = z
  return [0, 1]; // ±z faces: u = x, v = y
}

const EPS = 1e-4;

function collect(walls: WallSegment[], bounds: [number, number, number, number], wallHeight: number, texel: number, ceilingTexel: number) {
  const px = (len: number, t: number) => Math.max(1, Math.ceil(len / t));
  const [minX, minZ, sizeX, sizeZ] = bounds;
  const pending: PendingRect[] = [
    {
      w: px(sizeX, texel),
      h: px(sizeZ, texel),
      rect: { origin: new THREE.Vector3(minX, 0, minZ), uAxis: new THREE.Vector3(sizeX, 0, 0), vAxis: new THREE.Vector3(0, 0, sizeZ), normal: new THREE.Vector3(0, 1, 0) },
    },
    {
      w: px(sizeX, ceilingTexel),
      h: px(sizeZ, ceilingTexel),
      rect: { origin: new THREE.Vector3(minX, wallHeight, minZ), uAxis: new THREE.Vector3(sizeX, 0, 0), vAxis: new THREE.Vector3(0, 0, sizeZ), normal: new THREE.Vector3(0, -1, 0) },
    },
  ];
  walls.forEach((wall, piece) => {
    const half = wall.size.map((s) => s / 2);
    const bottom = wall.position[1] - half[1];
    const top = wall.position[1] + half[1];
    for (let face = 0; face < 6; face++) {
      // Tops of full-height walls / bottoms on the floor are never seen; window sills and heads are.
      if (face === 2 && top >= wallHeight - EPS) continue;
      if (face === 3 && bottom <= EPS) continue;
      const k = Math.floor(face / 2);
      const sign = face % 2 === 0 ? 1 : -1;
      // Faces outside the floor footprint (perimeter walls' outer faces and corner ends) are never seen.
      const plane = wall.position[k] + sign * half[k];
      if (k === 0 && (plane < minX - EPS || plane > minX + sizeX + EPS)) continue;
      if (k === 2 && (plane < minZ - EPS || plane > minZ + sizeZ + EPS)) continue;
      const [ua, va] = faceAxes(face);
      const origin = new THREE.Vector3(...wall.position);
      origin.setComponent(k, wall.position[k] + sign * half[k]);
      origin.setComponent(ua, wall.position[ua] - half[ua]);
      origin.setComponent(va, wall.position[va] - half[va]);
      const uAxis = new THREE.Vector3().setComponent(ua, wall.size[ua]);
      const vAxis = new THREE.Vector3().setComponent(va, wall.size[va]);
      pending.push({
        w: px(wall.size[ua], texel),
        h: px(wall.size[va], texel),
        rect: { origin, uAxis, vAxis, normal: new THREE.Vector3(...FACE_NORMALS[face]) },
        piece,
        face,
      });
    }
  });
  return pending;
}

/** Where packRects put each rect: the inner (un-guttered) area's pixel position. */
export interface PackedLayout {
  width: number;
  height: number;
  at: { x: number; y: number }[];
}

/** Shelf packing at a fixed width, tallest first. Null when a rect is wider than `width`. */
function packAt(sizes: { w: number; h: number }[], order: number[], width: number, gutter: number): PackedLayout | null {
  const at: PackedLayout["at"] = new Array(sizes.length);
  let x = 0;
  let y = 0;
  let shelf = 0;
  for (const i of order) {
    const pw = sizes[i].w + 2 * gutter;
    const ph = sizes[i].h + 2 * gutter;
    if (pw > width) return null;
    if (x + pw > width) {
      x = 0;
      y += shelf;
      shelf = 0;
    }
    at[i] = { x: x + gutter, y: y + gutter };
    x += pw;
    shelf = Math.max(shelf, ph);
  }
  return { width, height: Math.max(1, y + shelf), at };
}

/**
 * Packs rects (each grown by `gutter` texels per side) into the smallest-area atlas no larger than
 * `maxSize`², trying a range of widths (WebGL2 has no power-of-two rule). Null if nothing fits. Shared by the
 * daylight and picture-light bakes.
 */
export function packRects(sizes: { w: number; h: number }[], maxSize: number, gutter = DAYLIGHT_GUTTER): PackedLayout | null {
  const order = sizes.map((_, i) => i).sort((a, b) => sizes[b].h - sizes[a].h);
  let best: PackedLayout | null = null;
  for (let width = 64; width <= maxSize; width += 32) {
    const packed = packAt(sizes, order, width, gutter);
    if (!packed || packed.height > maxSize) continue;
    if (!best || packed.width * packed.height < best.width * best.height) best = packed;
  }
  return best;
}

/** Lays out the atlas for a room. `walls` must be the pieces actually rendered (cut around the windows). */
export function buildDaylightAtlas(
  walls: WallSegment[],
  room: { center: [number, number]; size: [number, number] },
  wallHeight: number,
  maxSize = MAX_ATLAS_SIZE
): DaylightAtlas {
  const bounds: [number, number, number, number] = [
    room.center[0] - room.size[0] / 2,
    room.center[1] - room.size[1] / 2,
    room.size[0],
    room.size[1],
  ];
  let texel = DAYLIGHT_TEXEL;
  let ceilingTexel = DAYLIGHT_CEILING_TEXEL;
  for (;;) {
    const pending = collect(walls, bounds, wallHeight, texel, ceilingTexel);
    const packed = packRects(pending, maxSize);
    if (packed) {
      const placed = pending.map((p, i) => ({ ...p.rect, ...packed.at[i], w: p.w, h: p.h, piece: p.piece, face: p.face }));
      const [floor, ceiling, ...rest] = placed;
      const faces = rest.map((r) => ({ ...r, piece: r.piece!, face: r.face! }));
      return { width: packed.width, height: packed.height, floor, ceiling, faces, bounds };
    }
    texel *= 1.25;
    ceilingTexel *= 1.25;
  }
}

/** Atlas UV rect (u0, v0, du, dv) of a rect's inner area. */
export function rectUv(atlas: DaylightAtlas, r: AtlasRect): [number, number, number, number] {
  return [r.x / atlas.width, r.y / atlas.height, r.w / atlas.width, r.h / atlas.height];
}

/**
 * Adds the `daylightUv` attribute to a wall piece's box geometry (local coordinates, centred on the piece):
 * each vertex maps into its face's rect. Faces with no rect (hidden tops/bottoms) map to the floor rect's
 * corner — never sampled visibly.
 */
export function addDaylightUv(geometry: THREE.BufferGeometry, atlas: DaylightAtlas, piece: number, size: [number, number, number]): void {
  const pos = geometry.attributes.position;
  const nrm = geometry.attributes.normal;
  const uv = new Float32Array(pos.count * 2);
  const byFace = new Map(atlas.faces.filter((f) => f.piece === piece).map((f) => [f.face, f]));
  for (let i = 0; i < pos.count; i++) {
    const n = [nrm.getX(i), nrm.getY(i), nrm.getZ(i)];
    const k = n.reduce((best, _, j) => (Math.abs(n[j]) > Math.abs(n[best]) ? j : best), 0);
    const face = k * 2 + (n[k] > 0 ? 0 : 1);
    const r = byFace.get(face);
    if (!r) {
      uv[i * 2] = atlas.floor.x / atlas.width;
      uv[i * 2 + 1] = atlas.floor.y / atlas.height;
      continue;
    }
    const [ua, va] = faceAxes(face);
    const p = [pos.getX(i), pos.getY(i), pos.getZ(i)];
    const fu = p[ua] / size[ua] + 0.5;
    const fv = p[va] / size[va] + 0.5;
    uv[i * 2] = (r.x + fu * r.w) / atlas.width;
    uv[i * 2 + 1] = (r.y + fv * r.h) / atlas.height;
  }
  geometry.setAttribute("daylightUv", new THREE.BufferAttribute(uv, 2));
}

/**
 * The bake geometry: one quad per rect, guttered, in atlas clip space (`position.xy`), carrying each corner's
 * world position (extrapolated across the gutter) and the face normal.
 */
export function buildBakeGeometry(atlas: DaylightAtlas): THREE.BufferGeometry {
  return buildRectBakeGeometry([atlas.floor, atlas.ceiling, ...atlas.faces], atlas.width, atlas.height);
}

/** buildBakeGeometry for any list of atlas rects (an atlas `width` × `height` texels). */
export function buildRectBakeGeometry(rects: AtlasRect[], width: number, height: number): THREE.BufferGeometry {
  const g = DAYLIGHT_GUTTER;
  const position = new Float32Array(rects.length * 4 * 3);
  const world = new Float32Array(rects.length * 4 * 3);
  const normal = new Float32Array(rects.length * 4 * 3);
  const index: number[] = [];
  rects.forEach((r, ri) => {
    const corners: [number, number][] = [
      [-g, -g],
      [r.w + g, -g],
      [r.w + g, r.h + g],
      [-g, r.h + g],
    ];
    corners.forEach(([cx, cy], ci) => {
      const o = (ri * 4 + ci) * 3;
      position[o] = ((r.x + cx) / width) * 2 - 1;
      position[o + 1] = ((r.y + cy) / height) * 2 - 1;
      position[o + 2] = 0;
      const w = r.origin.clone().addScaledVector(r.uAxis, cx / r.w).addScaledVector(r.vAxis, cy / r.h);
      world.set([w.x, w.y, w.z], o);
      normal.set([r.normal.x, r.normal.y, r.normal.z], o);
    });
    const b = ri * 4;
    index.push(b, b + 1, b + 2, b, b + 2, b + 3);
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(position, 3));
  geometry.setAttribute("worldPos", new THREE.BufferAttribute(world, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(normal, 3));
  geometry.setIndex(index);
  return geometry;
}

/** The off-screen target the atlas is baked into (linear HDR irradiance, filtered, no mips). */
export function createDaylightTarget(atlas: { width: number; height: number }): THREE.WebGLRenderTarget {
  return new THREE.WebGLRenderTarget(atlas.width, atlas.height, {
    type: THREE.HalfFloatType,
    format: THREE.RGBAFormat,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: false,
    generateMipmaps: false,
  });
}

// --- Revision ----------------------------------------------------------------------------------------
// Every write to the daylight uniforms (window lights, sun, shadow casters) bumps this; DaylightBaker
// re-bakes on the next frame when it changed.

let revision = 0;
export function bumpDaylightRevision(): void {
  revision++;
}
export function daylightRevision(): number {
  return revision;
}
