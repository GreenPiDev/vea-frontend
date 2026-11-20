// Soft daylight through the windows (window step 2 of the daylight plan: sky light; sun patches come next).
//
// Each window is a rectangular Lambertian emitter on its glass plane, with the radiance of what's outside
// it: the cosine-weighted mean of the panorama over the hemisphere the window faces (outdoorPanoramaLight.ts,
// a 16 × 8 grid generated from the photo, turned by the room's panorama rotation), × the glass share of the
// opening (bars block light) × the glass's own transmittance × DAYLIGHT_WINDOW_GAIN. The view and the light
// therefore always agree: a sunny garden gives a bright, slightly cool light, the overcast city a greyer one.
//
// Irradiance from a polygon of uniform radiance L at point p with normal n (Lambert's polygon formula):
//
//   E = L/2 · Σ_edges θ_i · (n · γ_i)      θ_i = angle between v_i and v_{i+1}, γ_i = normalize(v_i × v_{i+1})
//
// with v_i the unit vectors from p to the corners. Exact for an unoccluded window above the surface's
// horizon (clamped at 0 when it dips below). Points on the outside of the glass plane get nothing.
//
// Added in the same shader hook as the ceiling-fixture light (ceilingLight.ts → ceilingLightApply), so the
// room surfaces, furniture, wall labels and window joinery all receive it. Fixed-size uniform arrays with a
// constant loop bound: switching rooms never recompiles; a room without windows costs one loop exit.
// Known limitation (shared with the ceiling light): no visibility — free-standing partitions don't shadow it.

import * as THREE from "three";
import { isTouchPrimaryDevice } from "../../lib/navigationMode";
import { DAYLIGHT_DESATURATION, DAYLIGHT_WINDOW_GAIN } from "./sceneLighting";
import { PANORAMA_LIGHT, PANORAMA_LIGHT_GRID_H, PANORAMA_LIGHT_GRID_W } from "./outdoorPanoramaLight";
import { GLASS_ABSORPTION, WINDOW_SETBACK, buildWindowParts, windowTransmissionMask } from "./windowGeometry";
import type { WindowOpening } from "./windowOpenings";
import { OUTDOOR_PANORAMAS } from "./outdoorPanoramas";
import { bumpDaylightRevision } from "./daylightBake";

/** Area-light slots: the windows themselves, then the sun patches' floor bounce (daylightBounce.ts). */
export const MAX_WINDOW_LIGHTS = isTouchPrimaryDevice() ? 6 : 12;

export interface WindowLight {
  /** Glass-plane corners, ordered so the formula comes out positive on the room side. */
  corners: [THREE.Vector3, THREE.Vector3, THREE.Vector3, THREE.Vector3];
  /** Unit normal into the room. */
  normal: THREE.Vector3;
  /** Linear RGB radiance after gain, bars and glass. */
  radiance: [number, number, number];
  /** Emitting area (m²) and the share of it that lets light through (1 for a bounce patch). */
  area: number;
  share: number;
}

/** World direction of a panorama texel direction, with the room's background rotation applied (three's convention). */
export function panoramaToWorld(phi: number, elevation: number, rotationY: number): THREE.Vector3 {
  const dir = new THREE.Vector3(Math.cos(phi) * Math.cos(elevation), Math.sin(elevation), Math.sin(phi) * Math.cos(elevation));
  return dir.applyAxisAngle(new THREE.Vector3(0, 1, 0), rotationY);
}

/**
 * The background rotation (rotationY, in [0, 2π)) that puts a panorama's sun at azimuth `phi` in the floor-plan
 * direction (dx, dz) — the inverse of panoramaToWorld's horizontal part (rotating by r turns azimuth phi into
 * phi − r). Used by the window editor's draggable sun.
 */
export function rotationForSunDirection(phi: number, dx: number, dz: number): number {
  const r = phi - Math.atan2(dz, dx);
  const tau = Math.PI * 2;
  return ((r % tau) + tau) % tau;
}

/** Cosine-weighted mean linear radiance of the panorama over the hemisphere around `outward`. */
export function hemisphereRadiance(panoramaId: string, rotationY: number, outward: THREE.Vector3): [number, number, number] {
  const light = PANORAMA_LIGHT[panoramaId];
  if (!light) return [0, 0, 0];
  const out: [number, number, number] = [0, 0, 0];
  let total = 0;
  for (let j = 0; j < PANORAMA_LIGHT_GRID_H; j++) {
    const elevation = (0.5 - (j + 0.5) / PANORAMA_LIGHT_GRID_H) * Math.PI;
    for (let i = 0; i < PANORAMA_LIGHT_GRID_W; i++) {
      const phi = ((i + 0.5) / PANORAMA_LIGHT_GRID_W - 0.5) * 2 * Math.PI;
      // Cell solid angle ∝ cos(elevation); Lambert weight = cos to the window's outward normal.
      const w = Math.max(panoramaToWorld(phi, elevation, rotationY).dot(outward), 0) * Math.cos(elevation);
      if (w <= 0) continue;
      const k = (j * PANORAMA_LIGHT_GRID_W + i) * 3;
      out[0] += w * light.grid[k];
      out[1] += w * light.grid[k + 1];
      out[2] += w * light.grid[k + 2];
      total += w;
    }
  }
  return total > 0 ? [out[0] / total, out[1] / total, out[2] / total] : out;
}

/**
 * Brightness of the view as seen through a window (not the light it casts): the panorama's mean over the
 * window's hemisphere × the background intensity × glass share and transmittance. For the window panels in
 * the environment map (RoomEnvironment.tsx), so reflections of a window match the window itself.
 */
export function windowViewRadiance(
  opening: WindowOpening,
  panoramaId: string,
  rotationY: number,
  backgroundIntensity: number
): [number, number, number] {
  const outward = new THREE.Vector3(-opening.inward[0], 0, -opening.inward[1]);
  const sky = hemisphereRadiance(panoramaId, rotationY, outward);
  const k = backgroundIntensity * glassShare(opening);
  return [sky[0] * k * (1 - GLASS_ABSORPTION[0]), sky[1] * k * (1 - GLASS_ABSORPTION[1]), sky[2] * k * (1 - GLASS_ABSORPTION[2])];
}

function desaturate([r, g, b]: [number, number, number], amount: number): [number, number, number] {
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return [r + (y - r) * amount, g + (y - g) * amount, b + (y - b) * amount];
}

/** Share of the opening that lets light through (the rest is frame, sashes and glazing bars). */
export function glassShare(opening: WindowOpening): number {
  const parts = buildWindowParts(opening);
  parts.joinery.dispose();
  parts.hardware?.dispose();
  const mask = windowTransmissionMask(opening, parts, 64);
  return mask.reduce((s, v) => s + v, 0) / mask.length;
}

export function windowLightsFor(openings: WindowOpening[], panoramaId: string, rotationY: number): WindowLight[] {
  const scale = OUTDOOR_PANORAMAS.find((p) => p.id === panoramaId)?.windowLightScale ?? 1;
  return openings.map((o) => {
    const normal = new THREE.Vector3(o.inward[0], 0, o.inward[1]);
    const along = o.axis === "x" ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1);
    const glass = new THREE.Vector3(...o.center).addScaledVector(normal, -WINDOW_SETBACK);
    const hw = along.clone().multiplyScalar(o.width / 2);
    const hh = new THREE.Vector3(0, o.height / 2, 0);
    const a = glass.clone().sub(hw).sub(hh);
    const b = glass.clone().add(hw).sub(hh);
    const c = glass.clone().add(hw).add(hh);
    const d = glass.clone().sub(hw).add(hh);
    // Counter-clockwise seen from the room: (b − a) × (d − a) must point into the room.
    const corners: WindowLight["corners"] =
      b.clone().sub(a).cross(d.clone().sub(a)).dot(normal) > 0 ? [a, b, c, d] : [a, d, c, b];

    const sky = desaturate(hemisphereRadiance(panoramaId, rotationY, normal.clone().negate()), DAYLIGHT_DESATURATION);
    const share = glassShare(o);
    const gain = DAYLIGHT_WINDOW_GAIN * scale;
    const radiance: [number, number, number] = [
      sky[0] * share * gain * (1 - GLASS_ABSORPTION[0]),
      sky[1] * share * gain * (1 - GLASS_ABSORPTION[1]),
      sky[2] * share * gain * (1 - GLASS_ABSORPTION[2]),
    ];
    return { corners, normal, radiance, area: o.width * o.height, share };
  });
}

/** CPU mirror of the shader term: irradiance per unit radiance (multiply by the window's radiance). */
export function windowFormFactor(p: THREE.Vector3, n: THREE.Vector3, light: WindowLight): number {
  if (p.clone().sub(light.corners[0]).dot(light.normal) <= 0) return 0;
  const v = light.corners.map((c) => c.clone().sub(p).normalize());
  let e = 0;
  for (let i = 0; i < 4; i++) {
    const a = v[i];
    const b = v[(i + 1) % 4];
    const theta = Math.acos(THREE.MathUtils.clamp(a.dot(b), -1, 1));
    const g = new THREE.Vector3().crossVectors(a, b);
    const len = g.length();
    if (len < 1e-9) continue;
    e += theta * n.dot(g) / len;
  }
  return Math.max(-0.5 * e, 0);
}

// --- GPU side ------------------------------------------------------------------------------------------

export interface WindowLightUniforms {
  /** 4 corners per window. */
  uWindowCorners: { value: THREE.Vector3[] };
  /** xyz = linear radiance. */
  uWindowRadiance: { value: THREE.Vector3[] };
  /** Inward normal (xyz); the plane offset is taken from corner 0. */
  uWindowNormal: { value: THREE.Vector3[] };
  uWindowCount: { value: number };
}

/** Shared like ceilingLightUniforms (furniture materials are cached across rooms). */
export const windowLightUniforms: WindowLightUniforms = {
  uWindowCorners: { value: Array.from({ length: MAX_WINDOW_LIGHTS * 4 }, () => new THREE.Vector3()) },
  uWindowRadiance: { value: Array.from({ length: MAX_WINDOW_LIGHTS }, () => new THREE.Vector3()) },
  uWindowNormal: { value: Array.from({ length: MAX_WINDOW_LIGHTS }, () => new THREE.Vector3()) },
  uWindowCount: { value: 0 },
};

/** Writes a room's window lights into the shared uniforms; an empty list switches daylight off. */
export function setWindowLights(lights: WindowLight[]): void {
  bumpDaylightRevision(); // re-bake the room surfaces (daylightBake.ts)
  const n = Math.min(lights.length, MAX_WINDOW_LIGHTS);
  for (let i = 0; i < n; i++) {
    const l = lights[i];
    for (let k = 0; k < 4; k++) windowLightUniforms.uWindowCorners.value[i * 4 + k].copy(l.corners[k]);
    windowLightUniforms.uWindowRadiance.value[i].set(...l.radiance);
    windowLightUniforms.uWindowNormal.value[i].copy(l.normal);
  }
  windowLightUniforms.uWindowCount.value = n;
}

export const WINDOW_LIGHT_FRAGMENT_DECL = /* glsl */ `
#define MAX_WINDOW_LIGHTS ${MAX_WINDOW_LIGHTS}
uniform vec3 uWindowCorners[MAX_WINDOW_LIGHTS * 4];
uniform vec3 uWindowRadiance[MAX_WINDOW_LIGHTS];
uniform vec3 uWindowNormal[MAX_WINDOW_LIGHTS];
uniform int uWindowCount;

// Edge term θ·(a×b)/|a×b| of Lambert's polygon formula without acos/length: Heitz et al. 2017's cubic fit of
// θ/sin θ (LTC area lights, error < 0.1 %) — the exact version cost 4 acos + 4 sqrt per window per fragment.
vec3 windowEdge(vec3 a, vec3 b) {
  float x = dot(a, b);
  float y = abs(x);
  float v = (0.8543985 + (0.4965155 + 0.0145206 * y) * y) / (3.4175940 + (4.1616724 + y) * y);
  float thetaOverSin = x > 0.0 ? v : 0.5 * inversesqrt(max(1.0 - x * x, 1e-7)) - v;
  return cross(a, b) * thetaOverSin;
}

vec3 windowLightIrradiance(vec3 p, vec3 n) {
  vec3 e = vec3(0.0);
  for (int i = 0; i < MAX_WINDOW_LIGHTS; i++) {
    if (i >= uWindowCount) break;
    vec3 c0 = uWindowCorners[i * 4];
    if (dot(p - c0, uWindowNormal[i]) <= 0.0) continue;
    vec3 v0 = normalize(c0 - p);
    vec3 v1 = normalize(uWindowCorners[i * 4 + 1] - p);
    vec3 v2 = normalize(uWindowCorners[i * 4 + 2] - p);
    vec3 v3 = normalize(uWindowCorners[i * 4 + 3] - p);
    float f = dot(n, windowEdge(v0, v1) + windowEdge(v1, v2) + windowEdge(v2, v3) + windowEdge(v3, v0));
    e += max(-0.5 * f, 0.0) * uWindowRadiance[i];
  }
  return e;
}
`;
