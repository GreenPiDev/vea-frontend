// Picture lights: the light comes out of the visible lamp bar above each painting (sergi-gercekcilestirme.md
// Adım 7, option B — "tablo lambası").
//
// Why not a plain three.js spot cone at the lamp: a point source 0.2–0.5 m off the wall lights the wall as
// standoff / d³, so with any round cone the brightest spot is right under the lamp — above the painting — and
// a 1.6 m canvas gets ~6 % at its bottom edge (measured with a CPU model of three's spot term over the whole
// parameter space, see the Adım 7 notes in CLAUDE.md). That's the trap the previous code fell into: it moved
// the real emitter 1.6 m out from the wall (BEAM_STANDOFF) so the cone could reach the canvas, which made the
// visible fixture and the light's real origin disagree and still left a round hot spot above the frame.
//
// What real picture lights do instead is use an asymmetric reflector that throws more light toward the far
// (lower) part of the canvas. That's modelled here exactly: the light leaves the lamp bar, and its intensity
// per direction is chosen so the *irradiance on the wall plane* follows a designed window — even across the
// canvas, fading gently from top (1.0) to bottom (BOTTOM_LEVEL) and toward the sides (EDGE_LEVEL), with a
// soft wall wash (SPILL) around it. For a ray that hits the wall s metres in front of the lamp after
// travelling d metres, wall irradiance = I·(s/d)/d², so I = gain·shape·d³/s and the light reaching any point
// at distance d' is I/d'². Surfaces off the wall plane (frame faces, a plinth top near the wall) get the
// physically consistent amount for that intensity distribution — the frame's top face is lit from above,
// not a sticker.
//
// No three.js lights (2026-11-25 — they used to be a pool of 8 spotLights reassigned to the nearest paintings
// and faded out past ~9–15 m, so lamps visibly switched on as the visitor walked up; and every lit surface in
// the room paid for 8 spot evaluations per pixel). Every lamp is now always on, at a fixed cost:
//   - the wall wash is baked once per room (pictureLightBake.ts + PictureLightBaker.tsx) — intensity and the
//     direction to the lamp per texel, so the wall's normal map and specular still respond exactly as before;
//   - the painting itself (canvas, its sides, the frame) and its wall label evaluate only the lamps that can
//     reach them (own lamp + at most one neighbour) live in their shader (pictureLightMaterial.ts).
// Both run PICTURE_LIGHT_FUNCTIONS (below), mirrored on the CPU by pictureLightIntensity — tested in
// pictureLight.test.ts.

import * as THREE from "three";
import type { Artwork as ArtworkData } from "./artworks";
import { ARTWORK_WALL_GAP } from "./artworkShadow";
import { canvasZ } from "./frameProfile";

/** Lamp bar height above the canvas's top edge. placeArtworksAlongWall() leaves 0.73 m headroom. */
export const LAMP_RISE = 0.45;
/** Lamp never closer than this to the ceiling (hand-authored static rooms). */
export const CEILING_CLEARANCE = 0.15;
/** LED strip sits this far under the bar's axis — the actual emitting line. */
export const LAMP_STRIP_DROP = 0.038;
/**
 * Lamp arm length (bar distance from the wall), longer for bigger paintings like real picture lights. Also
 * keeps the light from arriving too grazing at the bottom of a tall canvas, where it would exaggerate the
 * canvas weave normal map.
 */
export function lampStandoff(paintingHeight: number): number {
  return THREE.MathUtils.clamp(0.2 + 0.15 * paintingHeight, 0.3, 0.9);
}

/** Irradiance at the canvas's top centre per unit lamp intensity. With the brightest theme (spotIntensity 26 × 0.75) a white canvas top stays just under Scene.tsx's bloom threshold (1.5). */
export const PICTURE_LIGHT_GAIN = 0.26;
/** Relative irradiance at the canvas's bottom edge (top = 1) — a gentle fade, not a hot spot. */
export const BOTTOM_LEVEL = 0.6;
/** Relative irradiance at the canvas's side edges (centre = 1). */
export const EDGE_LEVEL = 0.8;
/** Width of the soft wall wash around the canvas (m). Covers the frame border (FRAME_BORDER) comfortably. */
export const SPILL = 0.3;
/**
 * Light stops this far past the painting's plane: the wall face is ARTWORK_WALL_GAP behind it, plus margin.
 * Anything farther (the floor on the other side of a partition) is behind the wall and gets nothing.
 */
const WALL_CUTOFF = ARTWORK_WALL_GAP + 0.05;

export interface PictureLightPlacement {
  /** Emitting point (centre of the LED strip), world space. */
  position: THREE.Vector3;
  /** Wall normal (horizontal, unit, points into the room). */
  normal: THREE.Vector3;
  /**
   * Lamp → canvas plane distance along the normal (m). The window is designed on the canvas plane, so the
   * canvas gets it exactly; the wall face a few cm behind receives it slightly dimmer.
   */
  standoff: number;
  /** Depth below the lamp of the canvas top / bottom edge (m). */
  topDepth: number;
  bottomDepth: number;
  /** Half the canvas width (m). */
  halfWidth: number;
}

/** Bar height for a painting (shared with fixtureGeometry.ts so the visible lamp and the light agree). */
export function lampBarY(data: ArtworkData, wallHeight: number): number {
  const topEdge = data.position[1] + data.height / 2;
  return Math.min(topEdge + LAMP_RISE, wallHeight - CEILING_CLEARANCE);
}

export function pictureLightPlacement(data: ArtworkData, wallHeight: number): PictureLightPlacement {
  const topEdge = data.position[1] + data.height / 2;
  const armLength = lampStandoff(data.height);
  // The window is designed on the canvas plane itself, which sits in the frame's rebate (frameProfile.ts).
  const standoff = armLength - canvasZ(data.frame);
  const y = lampBarY(data, wallHeight) - LAMP_STRIP_DROP;
  const normal = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), data.rotationY);
  const position = new THREE.Vector3(
    data.position[0] + normal.x * armLength,
    y,
    data.position[2] + normal.z * armLength
  );
  const topDepth = Math.max(y - topEdge, 0.05);
  return {
    position,
    normal,
    standoff,
    topDepth,
    bottomDepth: topDepth + data.height,
    halfWidth: (data.height * data.aspect) / 2,
  };
}

const smoothstep = (a: number, b: number, x: number) => {
  const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

/** Relative wall irradiance at depth `t` below the lamp and horizontal offset `x` from the canvas centre. */
export function pictureLightShape(t: number, x: number, top: number, bottom: number, halfWidth: number): number {
  const a = THREE.MathUtils.clamp((t - top) / Math.max(bottom - top, 1e-3), 0, 1);
  let f = 1 + (BOTTOM_LEVEL - 1) * a;
  f *= 1 - smoothstep(0, SPILL, Math.max(top - t, 0) + Math.max(t - bottom, 0));
  f *= smoothstep(0, 0.1, t);
  const ax = Math.abs(x);
  const b = Math.min(ax / Math.max(halfWidth, 1e-3), 1);
  let g = 1 - (1 - EDGE_LEVEL) * b * b;
  g *= 1 - smoothstep(0, SPILL, Math.max(ax - halfWidth, 0));
  return f * g;
}

/**
 * CPU mirror of PICTURE_LIGHT_FUNCTIONS' pictureLightIntensity: the light reaching `p` per unit lamp intensity,
 * before the surface's cosine (what a three.js light's `color` carries into the BRDF).
 */
export function pictureLightIntensity(p: THREE.Vector3Like, light: PictureLightPlacement): number {
  const rx = p.x - light.position.x;
  const ry = p.y - light.position.y;
  const rz = p.z - light.position.z;
  const d = Math.hypot(rx, ry, rz);
  if (d < 1e-4) return 0;
  const toWall = -(rx * light.normal.x + rz * light.normal.z);
  if (toWall < 0.02 || toWall > light.standoff + WALL_CUTOFF) return 0;
  const k = light.standoff / toWall;
  const t = -ry * k;
  // side = up × normal
  const sideX = light.normal.z;
  const sideZ = -light.normal.x;
  const x = (rx * sideX + rz * sideZ) * k;
  const shape = pictureLightShape(t, x, light.topDepth, light.bottomDepth, light.halfWidth);
  if (shape <= 0) return 0;
  return (PICTURE_LIGHT_GAIN * shape * light.standoff * light.standoff * d) / (toWall * toWall * toWall);
}

/** Irradiance at `p` (surface normal `n`) per unit lamp intensity. */
export function pictureLightIrradiance(
  p: THREE.Vector3Like,
  n: THREE.Vector3Like,
  light: PictureLightPlacement
): number {
  const intensity = pictureLightIntensity(p, light);
  if (intensity <= 0) return 0;
  const rx = light.position.x - p.x;
  const ry = light.position.y - p.y;
  const rz = light.position.z - p.z;
  const d = Math.hypot(rx, ry, rz);
  return intensity * Math.max((n.x * rx + n.y * ry + n.z * rz) / d, 0);
}

/**
 * World box holding every point a lamp can reach: the pyramid from the lamp to its window (grown by SPILL) on
 * the farthest plane it lights (standoff + WALL_CUTOFF). Outside it pictureLightIntensity is exactly 0.
 */
export function pictureLightInfluence(light: PictureLightPlacement): THREE.Box3 {
  const far = light.standoff + WALL_CUTOFF;
  const scale = far / light.standoff;
  const side = new THREE.Vector3(light.normal.z, 0, -light.normal.x);
  const box = new THREE.Box3().expandByPoint(light.position);
  const top = Math.max(light.topDepth - SPILL, 0);
  const bottom = light.bottomDepth + SPILL;
  const half = light.halfWidth + SPILL;
  for (const t of [top, bottom]) {
    for (const x of [-half, half]) {
      box.expandByPoint(
        light.position
          .clone()
          .addScaledVector(light.normal, -far)
          .addScaledVector(side, x * scale)
          .add(new THREE.Vector3(0, -t * scale, 0))
      );
    }
  }
  return box.expandByScalar(0.01);
}

/** The lamp as shader data: emitting point, wall normal, and the window (standoff, top depth, bottom depth, half width). */
export function pictureLampUniform(light: PictureLightPlacement): { position: THREE.Vector3; normal: THREE.Vector3; window: THREE.Vector4 } {
  return {
    position: light.position.clone(),
    normal: light.normal.clone(),
    window: new THREE.Vector4(light.standoff, light.topDepth, light.bottomDepth, light.halfWidth),
  };
}

// --- GPU side ------------------------------------------------------------------------------------------

const f = (v: number) => v.toFixed(4);

/** World-space GLSL mirror of pictureLightShape / pictureLightIntensity. `win` = (standoff, top, bottom, halfWidth). */
export const PICTURE_LIGHT_FUNCTIONS = /* glsl */ `
float pictureLightShape( float t, float ax, float top, float bottom, float halfWidth ) {
  float a = clamp( ( t - top ) / max( bottom - top, 1e-3 ), 0.0, 1.0 );
  float fv = mix( 1.0, ${f(BOTTOM_LEVEL)}, a );
  fv *= 1.0 - smoothstep( 0.0, ${f(SPILL)}, max( top - t, 0.0 ) + max( t - bottom, 0.0 ) );
  fv *= smoothstep( 0.0, 0.1, t );
  float b = min( ax / max( halfWidth, 1e-3 ), 1.0 );
  float g = 1.0 - ${f(1 - EDGE_LEVEL)} * b * b;
  g *= 1.0 - smoothstep( 0.0, ${f(SPILL)}, max( ax - halfWidth, 0.0 ) );
  return fv * g;
}

// Light reaching world point p from the lamp at \`lamp\` hung on a wall with (horizontal) normal n, per unit
// intensity, before the surface cosine.
float pictureLightIntensity( vec3 p, vec3 lamp, vec3 n, vec4 win ) {
  vec3 ray = p - lamp;
  float d = max( length( ray ), 1e-4 );
  float toWall = - dot( ray, n );
  if ( toWall < 0.02 || toWall > win.x + ${f(WALL_CUTOFF)} ) return 0.0;
  float k = win.x / toWall;
  vec3 side = vec3( n.z, 0.0, - n.x );
  float shape = pictureLightShape( - ray.y * k, abs( dot( ray, side ) * k ), win.y, win.z, win.w );
  return ${f(PICTURE_LIGHT_GAIN)} * shape * win.x * win.x * d / ( toWall * toWall * toWall );
}
`;

/**
 * Lamp colour × intensity (theme.spotColor × spotIntensity × SPOT_INTENSITY_SCALE), shared by the wall bake
 * lookup and every painting/label material. Module singleton like ceilingLightUniforms: one gallery Canvas at
 * a time, refreshed per room by GalleryLights — a uniform, so changing it never recompiles or re-bakes.
 */
export const pictureLightUniforms = {
  uPictureLightColor: { value: new THREE.Color(0, 0, 0) },
};

export function setPictureLightColor(color: THREE.ColorRepresentation, intensity: number): void {
  pictureLightUniforms.uPictureLightColor.value.set(color).multiplyScalar(intensity);
}
