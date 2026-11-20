// Light on the outside surfaces of a balcony (platform, railing, facade) — balcony.ts / Balconies.tsx.
//
// Inside the room, daylight is the windows + sun patches (windowLight.ts, sunLight.ts). Outside there is no
// window in the way: the surface sees the panorama's sky and ground directly, and the sun everywhere except in
// the facade's shadow. Both come from the same generated panorama data as the room's daylight
// (outdoorPanoramaLight.ts), so a balcony agrees with the view around it and with the patches inside.
//
// - Sky: an "ambient cube" — the panorama's irradiance onto the six axis directions (cosine-weighted mean
//   radiance × π, hemisphereRadiance), blended by the normal's squared components. Six uniforms, no fetch.
// - Room spill: every opening on a balcony's wall glows outward with the lit room behind it
//   (OUTDOOR_ROOM_SPILL), the same Lambert polygon form factor as windowLight.ts — a warm pool by the door.
// - Sun: N·L × the facade-shadow test — the ray toward the sun, if it heads back into a facade's plane,
//   is shadowed when it meets that plane below the wall top (soft over a few cm). Railings cast no shadow.
//
// Not three.js lights: an onBeforeCompile patch with its own program cache key, and a module-level uniform
// singleton set per room (setOutdoorLight), like the other daylight terms.

import * as THREE from "three";
import { OUTDOOR_ROOM_SPILL, OUTDOOR_SKY_GAIN, OUTDOOR_SUN_IRRADIANCE } from "./sceneLighting";
import { PANORAMA_LIGHT } from "./outdoorPanoramaLight";
import { hemisphereRadiance, panoramaToWorld } from "./windowLight";
import { sunTint } from "./sunLight";
import type { Facade } from "./balcony";
import type { WindowOpening } from "./windowOpenings";

/** Facades the sun-shadow test checks (one per wall with a balcony). */
export const MAX_OUTDOOR_FACADES = 8;
/** Openings on balcony walls that spill room light outside. */
export const MAX_OUTDOOR_SPILLS = 8;

/** An opening seen from outside: corners on the wall's outer face (counter-clockwise from outside), outward normal. */
export interface SpillLight {
  corners: [THREE.Vector3, THREE.Vector3, THREE.Vector3, THREE.Vector3];
  normal: THREE.Vector3;
}

/** Every opening on a wall that has a balcony, as an outward-facing emitter on the wall's outer face. */
export function spillLightsFor(openings: WindowOpening[] | undefined, facades: Facade[]): SpillLight[] {
  const walls = new Set(facades.map((f) => f.wallId));
  return (openings ?? [])
    .filter((o) => walls.has(o.wallId))
    .map((o) => {
      const normal = new THREE.Vector3(-o.inward[0], 0, -o.inward[1]);
      const along = o.axis === "x" ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1);
      const c = new THREE.Vector3(...o.center).addScaledVector(normal, o.depth / 2);
      const hw = along.clone().multiplyScalar(o.width / 2);
      const hh = new THREE.Vector3(0, o.height / 2, 0);
      const a = c.clone().sub(hw).sub(hh);
      const b = c.clone().add(hw).sub(hh);
      const cc = c.clone().add(hw).add(hh);
      const d = c.clone().sub(hw).add(hh);
      const corners: SpillLight["corners"] = b.clone().sub(a).cross(d.clone().sub(a)).dot(normal) > 0 ? [a, b, cc, d] : [a, d, cc, b];
      return { corners, normal };
    });
}

/** Ambient-cube order: +x, −x, +y, −y, +z, −z. */
export const AMBIENT_CUBE_AXES: [number, number, number][] = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];

export interface OutdoorLightSetup {
  /** Irradiance (linear RGB) onto each ambient-cube axis. */
  sky: [number, number, number][];
  /** Toward the sun, or null under an overcast sky. */
  sunDirection: THREE.Vector3 | null;
  sunColor: [number, number, number];
  facades: Facade[];
  spills: SpillLight[];
}

export function outdoorLightFor(
  panoramaId: string,
  rotationY: number,
  backgroundIntensity: number,
  facades: Facade[],
  spills: SpillLight[] = []
): OutdoorLightSetup {
  const k = Math.PI * backgroundIntensity * OUTDOOR_SKY_GAIN;
  const sky = AMBIENT_CUBE_AXES.map((a) => {
    const r = hemisphereRadiance(panoramaId, rotationY, new THREE.Vector3(...a));
    return [r[0] * k, r[1] * k, r[2] * k] as [number, number, number];
  });
  const sun = PANORAMA_LIGHT[panoramaId]?.sun ?? null;
  if (!sun) return { sky, sunDirection: null, sunColor: [0, 0, 0], facades, spills };
  const tint = sunTint(sun.elevation);
  return {
    sky,
    sunDirection: panoramaToWorld(sun.phi, sun.elevation, rotationY),
    sunColor: tint.map((c) => c * OUTDOOR_SUN_IRRADIANCE) as [number, number, number],
    facades,
    spills,
  };
}

/** CPU mirror of the shader's facade shadow: 1 = in the sun, 0 = in a facade's shadow (hard edge). */
export function facadeSunVisibility(p: THREE.Vector3, sun: THREE.Vector3, facades: Facade[]): number {
  for (const f of facades) {
    const dist = f.normal[0] * p.x + f.normal[1] * p.z - f.plane;
    if (dist < 0.02) continue;
    const sd = f.normal[0] * sun.x + f.normal[1] * sun.z;
    if (sd >= -1e-4) continue;
    const t = dist / -sd;
    const hit = p.clone().addScaledVector(sun, t);
    const along = f.axis === "x" ? hit.x : hit.z;
    if (along >= f.start && along <= f.end && hit.y < f.height) return 0;
  }
  return 1;
}

// --- GPU side ------------------------------------------------------------------------------------------

export interface OutdoorLightUniforms {
  uOutdoorSky: { value: THREE.Vector3[] };
  uOutdoorSunDir: { value: THREE.Vector3 };
  uOutdoorSunColor: { value: THREE.Color };
  /** Per facade, 2 × vec4: (normal.x, normal.z, plane, height), (start, end, axisIsX, 0). */
  uOutdoorFacades: { value: THREE.Vector4[] };
  uOutdoorFacadeCount: { value: number };
  uOutdoorSpillCorners: { value: THREE.Vector3[] };
  uOutdoorSpillNormal: { value: THREE.Vector3[] };
  uOutdoorSpillCount: { value: number };
  uOutdoorSpillRadiance: { value: THREE.Vector3 };
}

export const outdoorLightUniforms: OutdoorLightUniforms = {
  uOutdoorSky: { value: AMBIENT_CUBE_AXES.map(() => new THREE.Vector3()) },
  uOutdoorSunDir: { value: new THREE.Vector3(0, 1, 0) },
  uOutdoorSunColor: { value: new THREE.Color(0, 0, 0) },
  uOutdoorFacades: { value: Array.from({ length: MAX_OUTDOOR_FACADES * 2 }, () => new THREE.Vector4()) },
  uOutdoorFacadeCount: { value: 0 },
  uOutdoorSpillCorners: { value: Array.from({ length: MAX_OUTDOOR_SPILLS * 4 }, () => new THREE.Vector3()) },
  uOutdoorSpillNormal: { value: Array.from({ length: MAX_OUTDOOR_SPILLS }, () => new THREE.Vector3()) },
  uOutdoorSpillCount: { value: 0 },
  uOutdoorSpillRadiance: { value: new THREE.Vector3(...OUTDOOR_ROOM_SPILL) },
};

export function setOutdoorLight(setup: OutdoorLightSetup): void {
  const u = outdoorLightUniforms;
  setup.sky.forEach((c, i) => u.uOutdoorSky.value[i].set(...c));
  if (setup.sunDirection) u.uOutdoorSunDir.value.copy(setup.sunDirection);
  u.uOutdoorSunColor.value.setRGB(...setup.sunColor);
  const n = Math.min(setup.facades.length, MAX_OUTDOOR_FACADES);
  for (let i = 0; i < n; i++) {
    const f = setup.facades[i];
    u.uOutdoorFacades.value[i * 2].set(f.normal[0], f.normal[1], f.plane, f.height);
    u.uOutdoorFacades.value[i * 2 + 1].set(f.start, f.end, f.axis === "x" ? 1 : 0, 0);
  }
  u.uOutdoorFacadeCount.value = n;
  const m = Math.min(setup.spills.length, MAX_OUTDOOR_SPILLS);
  for (let i = 0; i < m; i++) {
    setup.spills[i].corners.forEach((c, k) => u.uOutdoorSpillCorners.value[i * 4 + k].copy(c));
    u.uOutdoorSpillNormal.value[i].copy(setup.spills[i].normal);
  }
  u.uOutdoorSpillCount.value = m;
}

const FRAGMENT_DECL = /* glsl */ `
varying vec3 vOutdoorWorldPos;
#define MAX_OUTDOOR_FACADES ${MAX_OUTDOOR_FACADES}
uniform vec3 uOutdoorSky[6];
uniform vec3 uOutdoorSunDir;
uniform vec3 uOutdoorSunColor;
uniform vec4 uOutdoorFacades[MAX_OUTDOOR_FACADES * 2];
uniform int uOutdoorFacadeCount;
#define MAX_OUTDOOR_SPILLS ${MAX_OUTDOOR_SPILLS}
uniform vec3 uOutdoorSpillCorners[MAX_OUTDOOR_SPILLS * 4];
uniform vec3 uOutdoorSpillNormal[MAX_OUTDOOR_SPILLS];
uniform int uOutdoorSpillCount;
uniform vec3 uOutdoorSpillRadiance;

// Lambert polygon edge term (same Heitz et al. 2017 θ/sin θ fit as windowLight.ts).
vec3 outdoorEdge(vec3 a, vec3 b) {
  float x = dot(a, b);
  float y = abs(x);
  float v = (0.8543985 + (0.4965155 + 0.0145206 * y) * y) / (3.4175940 + (4.1616724 + y) * y);
  float thetaOverSin = x > 0.0 ? v : 0.5 * inversesqrt(max(1.0 - x * x, 1e-7)) - v;
  return cross(a, b) * thetaOverSin;
}

vec3 outdoorSpill(vec3 p, vec3 n) {
  float e = 0.0;
  for (int i = 0; i < MAX_OUTDOOR_SPILLS; i++) {
    if (i >= uOutdoorSpillCount) break;
    vec3 c0 = uOutdoorSpillCorners[i * 4];
    if (dot(p - c0, uOutdoorSpillNormal[i]) <= 0.01) continue;
    vec3 v0 = normalize(c0 - p);
    vec3 v1 = normalize(uOutdoorSpillCorners[i * 4 + 1] - p);
    vec3 v2 = normalize(uOutdoorSpillCorners[i * 4 + 2] - p);
    vec3 v3 = normalize(uOutdoorSpillCorners[i * 4 + 3] - p);
    float f = dot(n, outdoorEdge(v0, v1) + outdoorEdge(v1, v2) + outdoorEdge(v2, v3) + outdoorEdge(v3, v0));
    e += max(-0.5 * f, 0.0);
  }
  return e * uOutdoorSpillRadiance;
}

vec3 outdoorSky(vec3 n) {
  vec3 n2 = n * n;
  return n2.x * (n.x > 0.0 ? uOutdoorSky[0] : uOutdoorSky[1])
       + n2.y * (n.y > 0.0 ? uOutdoorSky[2] : uOutdoorSky[3])
       + n2.z * (n.z > 0.0 ? uOutdoorSky[4] : uOutdoorSky[5]);
}

float outdoorSunVisibility(vec3 p) {
  float vis = 1.0;
  for (int i = 0; i < MAX_OUTDOOR_FACADES; i++) {
    if (i >= uOutdoorFacadeCount) break;
    vec4 a = uOutdoorFacades[i * 2];
    vec4 b = uOutdoorFacades[i * 2 + 1];
    float dist = dot(a.xy, p.xz) - a.z;
    if (dist < 0.02) continue;
    float sd = dot(a.xy, uOutdoorSunDir.xz);
    if (sd >= -1e-4) continue;
    vec3 h = p + uOutdoorSunDir * (dist / -sd);
    float along = b.z > 0.5 ? h.x : h.z;
    float inside = step(b.x, along) * step(along, b.y);
    vis *= 1.0 - inside * smoothstep(-0.04, 0.04, a.w - h.y);
  }
  return vis;
}
`;

const APPLY = /* glsl */ `
{
  vec3 outdoorN = normalize(inverseTransformDirection(normal, viewMatrix));
  reflectedLight.indirectDiffuse += outdoorSky(outdoorN) * BRDF_Lambert(material.diffuseColor);
  reflectedLight.directDiffuse += outdoorSpill(vOutdoorWorldPos, outdoorN) * BRDF_Lambert(material.diffuseColor);
  float outdoorCos = dot(outdoorN, uOutdoorSunDir);
  if (outdoorCos > 0.0) {
    reflectedLight.directDiffuse += outdoorCos * outdoorSunVisibility(vOutdoorWorldPos) * uOutdoorSunColor
      * BRDF_Lambert(material.diffuseColor);
  }
}
`;

function outdoorOnBeforeCompile(shader: THREE.WebGLProgramParametersWithUniforms) {
  Object.assign(shader.uniforms, outdoorLightUniforms);
  shader.vertexShader = shader.vertexShader
    .replace("#include <common>", "#include <common>\nvarying vec3 vOutdoorWorldPos;")
    .replace("#include <project_vertex>", "#include <project_vertex>\nvOutdoorWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;");
  shader.fragmentShader = shader.fragmentShader
    .replace("#include <common>", `#include <common>\n${FRAGMENT_DECL}`)
    .replace("#include <lights_fragment_end>", `#include <lights_fragment_end>\n${APPLY}`);
}

/** Lets an outside surface (balcony platform, railing, facade) take the panorama's sky and sun. */
export function applyOutdoorLight(material: THREE.MeshStandardMaterial): void {
  material.onBeforeCompile = outdoorOnBeforeCompile;
  material.customProgramCacheKey = () => "vea-outdoor";
  material.needsUpdate = true;
}
