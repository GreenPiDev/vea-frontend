// Procedural linen-canvas weave normal map, shared by every painting surface (Artwork.tsx).
//
// Generated once in JS (a 128² RGBA tile, ~64 KB of GPU memory) instead of shipping a texture file: no
// download, no license question, and it tiles perfectly by construction. Mipmapped, so the weave fades
// to a flat normal with distance on its own — it only shows up close, where a real canvas's texture is
// visible too — and doesn't shimmer/moiré from across the room.

import * as THREE from "three";

export const WEAVE_TEXTURE_SIZE = 128;
/** Threads per tile along each axis — must be even so the over/under checkerboard wraps seamlessly. */
export const WEAVE_THREADS = 8;
/** Real-world size one texture tile covers on the canvas (m) → ~2.5 mm thread pitch, a medium linen. */
export const WEAVE_TILE_METERS = 0.02;

function frac(v: number) {
  return v - Math.floor(v);
}

/**
 * Height (0..1) of a plain-weave surface at tile coordinate (u, v) in [0, 1).
 * Every thread is a rounded ridge across its width that undulates over and under the crossing threads
 * along its length (warp and weft in opposite phase — a checkerboard of "which one is on top"); the
 * surface is whichever thread is higher. Continuous everywhere, so the normals have no seams.
 */
export function weaveHeight(u: number, v: number): number {
  const tu = u * WEAVE_THREADS;
  const tv = v * WEAVE_THREADS;
  const column = Math.floor(tu);
  const row = Math.floor(tv);
  const warp = Math.sqrt(Math.sin(Math.PI * frac(tu))) * (0.5 + 0.5 * Math.sin(Math.PI * (tv - column)));
  const weft = Math.sqrt(Math.sin(Math.PI * frac(tv))) * (0.5 - 0.5 * Math.sin(Math.PI * (tu - row)));
  return Math.max(warp, weft);
}

/** RGBA8 tangent-space normal map (OpenGL convention, three's default) for weaveHeight, wrapping at the tile edges. */
export function buildWeaveNormalData(size = WEAVE_TEXTURE_SIZE, bumpStrength = 2.5): Uint8Array {
  const heights = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      heights[y * size + x] = weaveHeight((x + 0.5) / size, (y + 0.5) / size);
    }
  }
  const h = (x: number, y: number) => heights[((y + size) % size) * size + ((x + size) % size)];

  const data = new Uint8Array(size * size * 4);
  // Height differences are per texel; scale so bumpStrength reads in "texel-independent" units.
  const k = (bumpStrength * size) / (WEAVE_THREADS * 16);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (h(x + 1, y) - h(x - 1, y)) * k;
      const dy = (h(x, y + 1) - h(x, y - 1)) * k;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * size + x) * 4;
      data[i] = Math.round(((-dx / len) * 0.5 + 0.5) * 255);
      data[i + 1] = Math.round(((-dy / len) * 0.5 + 0.5) * 255);
      data[i + 2] = Math.round(((1 / len) * 0.5 + 0.5) * 255);
      data[i + 3] = 255;
    }
  }
  return data;
}

let sharedTexture: THREE.DataTexture | null = null;

/** The one shared weave normal map. Lives for the app's lifetime (it's tiny), so callers never dispose it. */
export function getCanvasWeaveNormalMap(): THREE.DataTexture {
  if (!sharedTexture) {
    const texture = new THREE.DataTexture(
      buildWeaveNormalData(),
      WEAVE_TEXTURE_SIZE,
      WEAVE_TEXTURE_SIZE,
      THREE.RGBAFormat,
      THREE.UnsignedByteType
    );
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.generateMipmaps = true;
    texture.anisotropy = 4;
    // A normal map is vector data, not color.
    texture.colorSpace = THREE.NoColorSpace;
    // Read through the painting geometry's `uv1` (meters / WEAVE_TILE_METERS), not its 0..1 `uv` — so one
    // texture instance tiles at the same real-world thread size on paintings of any size.
    texture.channel = 1;
    texture.needsUpdate = true;
    sharedTexture = texture;
  }
  return sharedTexture;
}
