// Sun shadows of furniture and paintings (daylight step 4).
//
// The sun patches (sunLight.ts) are analytic: per fragment, a ray toward the sun is tested against the
// windows. This adds the same kind of ray test against a few simple volumes standing in the room — one
// oriented box per painting (frame outline × wall-to-face depth) and one box or vertical cylinder per
// furniture piece (its model's real bounding box, measured from the loaded GLTF) — so a bench leaves its
// shadow in the patch and a painting hit by low sun throws a thin shadow on the wall beside it.
//
// Cost: the loop only runs for fragments that the sun actually reaches through a window (a small part of
// the screen), over a fixed-size uniform array (no recompiles). Only volumes the sun can reach are packed
// (packSunOccluders samples each volume against the sun's window paths), so a room full of furniture in the
// shade costs nothing. Edges are softened by how deep the ray passes inside the volume (distance to its
// nearest face at the middle of the ray's run through it), over a band that widens the further the shadow
// falls from its caster — it hides the box approximation and stands in for the penumbra. Volumes a fragment sits inside are skipped, so a piece never shadows itself (a sofa seat isn't
// shaded by its own backrest — accepted).
//
// Pure math (occluderTransmission) mirrors the GLSL and is tested in sunOccluders.test.ts.

import * as THREE from "three";
import { isTouchPrimaryDevice } from "../../lib/navigationMode";
import { bumpDaylightRevision } from "./daylightBake";

/** Uniform array size (3 × vec4 per volume). */
export const MAX_SUN_OCCLUDERS = isTouchPrimaryDevice() ? 8 : 16;
/** Penumbra stand-in: depth (m) inside a volume over which a ray's shadow fades in, at the caster … */
export const SUN_SHADOW_SOFTNESS = 0.02;
/** … plus this much per metre between the caster and the surface the shadow falls on. */
export const SUN_SHADOW_SOFTNESS_SLOPE = 0.015;
/** The band never exceeds this share of the volume's thinnest half extent, so thin casters (a painting) still go fully dark. */
export const SUN_SHADOW_SOFTNESS_MAX_SHARE = 0.8;
/** A fragment closer than this to (or inside) a volume ignores it — no self-shadowing. */
export const SUN_OCCLUDER_SELF_MARGIN = 0.01;

export interface SunOccluder {
  /** World centre of the volume. */
  center: [number, number, number];
  /** Half extents in the volume's own frame (x = width, y = height, z = depth). */
  half: [number, number, number];
  /** Yaw (three.js rotationY convention). */
  rotationY: number;
  /** Vertical cylinder (elliptic, radii half.x / half.z) instead of a box. */
  round?: boolean;
  /** 0..1 — how much light the volume blocks (1 = solid). */
  opacity?: number;
}

/** A furniture piece's occluder: its model's local bounding box (already scaled) placed at the piece's transform. */
export function furnitureOccluder(
  localBox: THREE.Box3,
  position: [number, number, number],
  rotationY: number,
  round?: boolean
): SunOccluder {
  const c = localBox.getCenter(new THREE.Vector3());
  const s = localBox.getSize(new THREE.Vector3());
  const offset = new THREE.Vector3(c.x, 0, c.z).applyAxisAngle(new THREE.Vector3(0, 1, 0), rotationY);
  return {
    center: [position[0] + offset.x, position[1] + c.y, position[2] + offset.z],
    half: [s.x / 2, s.y / 2, s.z / 2],
    rotationY,
    round,
  };
}

/**
 * A hung painting's occluder: its outer outline (canvas + frame border), from the wall face (`wallGap` behind
 * the artwork's origin) to its front face (`front`, z in the artwork's own frame).
 */
export function artworkOccluder(
  position: [number, number, number],
  rotationY: number,
  outerWidth: number,
  outerHeight: number,
  wallGap: number,
  front: number
): SunOccluder {
  const midZ = (front - wallGap) / 2;
  const offset = new THREE.Vector3(0, 0, midZ).applyAxisAngle(new THREE.Vector3(0, 1, 0), rotationY);
  return {
    center: [position[0] + offset.x, position[1], position[2] + offset.z],
    half: [outerWidth / 2, outerHeight / 2, (front + wallGap) / 2],
    rotationY,
  };
}

/** Points spread through the volume (3 × 3 × 3 grid incl. corners) — used to ask "can the sun reach it?". */
export function occluderSamplePoints(o: SunOccluder): THREE.Vector3[] {
  const pts: THREE.Vector3[] = [];
  const axisY = new THREE.Vector3(0, 1, 0);
  for (const fx of [-1, 0, 1])
    for (const fy of [-1, 0, 1])
      for (const fz of [-1, 0, 1]) {
        const k = o.round && fx !== 0 && fz !== 0 ? Math.SQRT1_2 : 1;
        const local = new THREE.Vector3(fx * o.half[0] * k, fy * o.half[1], fz * o.half[2] * k).applyAxisAngle(axisY, o.rotationY);
        pts.push(local.add(new THREE.Vector3(...o.center)));
      }
  return pts;
}

/**
 * Ray (origin p, direction d, world) against one volume: [tNear, depth] — where it enters, and how far inside
 * it runs (distance to the nearest face at the middle of its run) — or null. Null too when p is inside.
 */
function intersect(p: THREE.Vector3, d: THREE.Vector3, o: SunOccluder): [number, number] | null {
  const c = Math.cos(o.rotationY);
  const s = Math.sin(o.rotationY);
  const dx = p.x - o.center[0];
  const dy = p.y - o.center[1];
  const dz = p.z - o.center[2];
  // World → local is the transpose of three's Y rotation.
  const lx = c * dx - s * dz;
  const lz = s * dx + c * dz;
  const m = SUN_OCCLUDER_SELF_MARGIN;
  const [hx, hy, hz] = o.half;
  if (Math.abs(dy) < hy + m) {
    if (o.round ? (lx / (hx + m)) ** 2 + (lz / (hz + m)) ** 2 < 1 : Math.abs(lx) < hx + m && Math.abs(lz) < hz + m) return null;
  }
  const ro = [lx / hx, dy / hy, lz / hz];
  const rd = [(c * d.x - s * d.z) / hx, d.y / hy, (s * d.x + c * d.z) / hz];
  let tNear = -Infinity;
  let tFar = Infinity;
  const slab = (i: number) => {
    if (Math.abs(rd[i]) < 1e-9) {
      if (Math.abs(ro[i]) > 1) tFar = -Infinity;
      return;
    }
    const t1 = (-1 - ro[i]) / rd[i];
    const t2 = (1 - ro[i]) / rd[i];
    tNear = Math.max(tNear, Math.min(t1, t2));
    tFar = Math.min(tFar, Math.max(t1, t2));
  };
  slab(1);
  if (o.round) {
    const a = rd[0] * rd[0] + rd[2] * rd[2];
    const b = ro[0] * rd[0] + ro[2] * rd[2];
    const k = ro[0] * ro[0] + ro[2] * ro[2] - 1;
    const disc = b * b - a * k;
    if (disc <= 0 || a < 1e-9) return null; // (a vertical ray never happens: the sun is never at the zenith)
    const sq = Math.sqrt(disc);
    tNear = Math.max(tNear, (-b - sq) / a);
    tFar = Math.min(tFar, (-b + sq) / a);
  } else {
    slab(0);
    slab(2);
  }
  tNear = Math.max(tNear, 0);
  if (tFar <= tNear) return null;
  const tMid = (tNear + tFar) / 2;
  const mx = lx + (c * d.x - s * d.z) * tMid;
  const my = dy + d.y * tMid;
  const mz = lz + (s * d.x + c * d.z) * tMid;
  const side = o.round ? (1 - Math.hypot(mx / hx, mz / hz)) * Math.min(hx, hz) : Math.min(hx - Math.abs(mx), hz - Math.abs(mz));
  return [tNear, Math.max(Math.min(side, hy - Math.abs(my)), 0)];
}

/** CPU mirror of the shader: share of sunlight (0..1) reaching `p` along `sunDir` past the volumes. */
export function occluderTransmission(p: THREE.Vector3, sunDir: THREE.Vector3, occluders: SunOccluder[]): number {
  let vis = 1;
  for (const o of occluders) {
    const hit = intersect(p, sunDir, o);
    if (!hit) continue;
    const pen = Math.min(SUN_SHADOW_SOFTNESS + SUN_SHADOW_SOFTNESS_SLOPE * hit[0], SUN_SHADOW_SOFTNESS_MAX_SHARE * Math.min(...o.half));
    vis *= 1 - (o.opacity ?? 1) * THREE.MathUtils.smoothstep(hit[1], 0, pen);
  }
  return vis;
}

/**
 * Picks the volumes worth testing: those with at least one sample point the sun reaches (`reaches`, the
 * window test from sunLight.ts), in the given priority order, capped at MAX_SUN_OCCLUDERS.
 */
export function packSunOccluders(candidates: SunOccluder[], reaches: (p: THREE.Vector3) => boolean, max = MAX_SUN_OCCLUDERS): SunOccluder[] {
  const out: SunOccluder[] = [];
  for (const o of candidates) {
    if (out.length >= max) break;
    if (occluderSamplePoints(o).some(reaches)) out.push(o);
  }
  return out;
}

// --- GPU side ------------------------------------------------------------------------------------------

export interface SunOccluderUniforms {
  /** Per volume, 3 × vec4: (centre, bounding radius), (half extents, ±opacity — negative = cylinder), (cos yaw, sin yaw, –, –). */
  uSunOccluders: { value: THREE.Vector4[] };
  uSunOccluderCount: { value: number };
}

export const sunOccluderUniforms: SunOccluderUniforms = {
  uSunOccluders: { value: Array.from({ length: MAX_SUN_OCCLUDERS * 3 }, () => new THREE.Vector4()) },
  uSunOccluderCount: { value: 0 },
};

export function writeSunOccluderUniforms(occluders: SunOccluder[]): void {
  bumpDaylightRevision(); // re-bake the room surfaces (daylightBake.ts)
  const n = Math.min(occluders.length, MAX_SUN_OCCLUDERS);
  const v = sunOccluderUniforms.uSunOccluders.value;
  for (let i = 0; i < n; i++) {
    const o = occluders[i];
    const opacity = o.opacity ?? 1;
    const radius = Math.hypot(...o.half) + SUN_OCCLUDER_SELF_MARGIN;
    v[i * 3].set(o.center[0], o.center[1], o.center[2], radius);
    v[i * 3 + 1].set(o.half[0], o.half[1], o.half[2], o.round ? -opacity : opacity);
    v[i * 3 + 2].set(Math.cos(o.rotationY), Math.sin(o.rotationY), 0, 0);
  }
  sunOccluderUniforms.uSunOccluderCount.value = n;
}

// --- Sources -------------------------------------------------------------------------------------------
// Furniture volumes are only known once each model's GLTF has loaded (FurnitureInstances.tsx, one per
// model); paintings and the sun come from GalleryLights.tsx. Each registers its own list here; the packed
// uniform set is rebuilt whenever any of them changes.

const sources = new Map<string, { priority: number; occluders: SunOccluder[] }>();
let reachesSun: ((p: THREE.Vector3) => boolean) | null = null;

function repack() {
  if (!reachesSun) {
    writeSunOccluderUniforms([]);
    return;
  }
  const ordered = [...sources.values()].sort((a, b) => a.priority - b.priority).flatMap((s) => s.occluders);
  writeSunOccluderUniforms(packSunOccluders(ordered, reachesSun));
}

/** Registers (or replaces) one source's volumes. Lower priority values are packed first. */
export function setSunOccluderSource(key: string, occluders: SunOccluder[], priority: number): void {
  sources.set(key, { priority, occluders });
  repack();
}

export function removeSunOccluderSource(key: string): void {
  if (sources.delete(key)) repack();
}

/** The current room's "does the sun reach this point" test (null = no sun) — set with the sun itself. */
export function setSunReachTest(test: ((p: THREE.Vector3) => boolean) | null): void {
  reachesSun = test;
  repack();
}

export const SUN_OCCLUDER_FRAGMENT_DECL = /* glsl */ `
#define MAX_SUN_OCCLUDERS ${MAX_SUN_OCCLUDERS}
uniform vec4 uSunOccluders[MAX_SUN_OCCLUDERS * 3];
uniform int uSunOccluderCount;

float sunOccluderVisibility(vec3 p, vec3 dir) {
  float vis = 1.0;
  for (int i = 0; i < MAX_SUN_OCCLUDERS; i++) {
    if (i >= uSunOccluderCount) break;
    vec4 a = uSunOccluders[i * 3];
    vec3 d = p - a.xyz;
    // Cheap reject first: the ray misses the volume's bounding sphere (most volumes, most fragments).
    float tc = -dot(d, dir);
    float dd = dot(d, d);
    float r2 = a.w * a.w;
    if (dd - tc * tc > r2 || (tc < 0.0 && dd > r2)) continue;
    vec4 b = uSunOccluders[i * 3 + 1];
    vec2 cs = uSunOccluders[i * 3 + 2].xy;
    bool isRound = b.w < 0.0;
    float c = cs.x;
    float s = cs.y;
    vec3 l = vec3(c * d.x - s * d.z, d.y, s * d.x + c * d.z);
    vec3 hm = b.xyz + ${SUN_OCCLUDER_SELF_MARGIN.toFixed(3)};
    if (abs(l.y) < hm.y) {
      vec2 q = l.xz / hm.xz;
      if (isRound ? dot(q, q) < 1.0 : all(lessThan(abs(q), vec2(1.0)))) continue;
    }
    vec3 ld = vec3(c * dir.x - s * dir.z, dir.y, s * dir.x + c * dir.z);
    vec3 ro = l / b.xyz;
    vec3 rd = ld / b.xyz;
    vec3 inv = 1.0 / rd;
    vec3 t1 = (-1.0 - ro) * inv;
    vec3 t2 = (1.0 - ro) * inv;
    vec3 tMin = min(t1, t2);
    vec3 tMax = max(t1, t2);
    float tNear;
    float tFar;
    if (isRound) {
      float qa = dot(rd.xz, rd.xz);
      float qb = dot(ro.xz, rd.xz);
      float qc = dot(ro.xz, ro.xz) - 1.0;
      float disc = qb * qb - qa * qc;
      if (disc <= 0.0 || qa < 1e-9) continue;
      float sq = sqrt(disc);
      tNear = max(tMin.y, (-qb - sq) / qa);
      tFar = min(tMax.y, (-qb + sq) / qa);
    } else {
      tNear = max(max(tMin.x, tMin.y), tMin.z);
      tFar = min(min(tMax.x, tMax.y), tMax.z);
    }
    tNear = max(tNear, 0.0);
    if (tFar <= tNear) continue;
    vec3 m = l + ld * (0.5 * (tNear + tFar));
    float side = isRound ? (1.0 - length(m.xz / b.xz)) * min(b.x, b.z) : min(b.x - abs(m.x), b.z - abs(m.z));
    float depth = max(min(side, b.y - abs(m.y)), 0.0);
    float pen = min(${SUN_SHADOW_SOFTNESS.toFixed(3)} + ${SUN_SHADOW_SOFTNESS_SLOPE.toFixed(3)} * tNear,
      ${SUN_SHADOW_SOFTNESS_MAX_SHARE.toFixed(2)} * min(min(b.x, b.y), b.z));
    vis *= 1.0 - abs(b.w) * smoothstep(0.0, pen, depth);
  }
  return vis;
}
`;
