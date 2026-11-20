// Directional room light from the ceiling fixtures (sergi-gercekcilestirme.md Adım 6).
//
// Before this, the ceiling fixtures were glowing discs that lit nothing: the room was lit by a
// directionless ambient/hemisphere fill, so the two walls of a corner had the same brightness, there
// were no light pools on the floor and a plinth read as one flat tone. Real lights fix that, but every
// three.js spot/point light changes the light count (program recompiles) and costs a full lighting
// evaluation per fragment — so this is an analytic, fixed-cost, diffuse-only downlight term instead:
//
//   E = power · lobe(down) · max(N·L, 0) / (d² + ε)      lobe = UPLIGHT + (1 − UPLIGHT) · down^LOBE
//
// added to `reflectedLight.directDiffuse` by a shader patch (room surfaces: roomAoMaterial.ts; furniture:
// applyCeilingLight below). Every light it adds has a visible source — the fixture disc at that exact
// position (GalleryLights.tsx) — so it respects the "no sourceless light" rule. **No specular**: the
// lamps' reflections on glossy floors already come from the env map (RoomEnvironment.tsx); a specular
// term here would double them.
//
// The fixtures are packed into a fixed-size uniform array (MAX_CEILING_LIGHTS is a #define, the loop has
// a constant bound and stops at the live count), so changing rooms never recompiles a program. A room
// with more fixtures than that gets nearby ones merged on the CPU (clusterCeilingLights), once.
//
// Pure functions here are unit-tested (ceilingLight.test.ts); the GLSL mirrors ceilingIrradiance().

import * as THREE from "three";
import type { RoomLayout } from "./galleryLayout";
import { isTouchPrimaryDevice } from "../../lib/navigationMode";
import { CEILING_LIGHT_FLOOR_IRRADIANCE } from "./sceneLighting";
import { WINDOW_LIGHT_FRAGMENT_DECL, windowLightUniforms } from "./windowLight";
import { SUN_LIGHT_FRAGMENT_DECL, sunLightUniforms } from "./sunLight";

/** Uniform array size. Phones get fewer slots — the loop runs per fragment on every room surface. */
export const MAX_CEILING_LIGHTS = isTouchPrimaryDevice() ? 12 : 24;
/** Exponent of the downward lobe: 2 ≈ a wide downlight — soft floor pools, walls fade in below the ceiling. */
export const CEILING_LIGHT_LOBE = 2;
/** Isotropic share of the fixture's light (spill from the housing) — gives the ceiling a faint halo. */
export const CEILING_LIGHT_UPLIGHT = 0.03;
/** Softens the 1/d² singularity right at the fixture (m²). */
export const CEILING_LIGHT_EPSILON = 0.05;
// Brightness: CEILING_LIGHT_FLOOR_IRRADIANCE in sceneLighting.ts. Each fixture's power is that × its
// height², so the pool under a light looks the same in a 3 m room and in the 13 m Grande Galerie —
// taller rooms get stronger fixtures, as in real buildings.
/** Theme ambientIntensity that maps to CEILING_LIGHT_FLOOR_IRRADIANCE; dark themes scale down with it. */
const REFERENCE_AMBIENT = 0.4;

export interface CeilingLight {
  x: number;
  y: number;
  z: number;
  /** E·d² units: irradiance = power · lobe · cos / d². */
  power: number;
}

/** Fixture power so that the floor straight below gets `floorIrradiance`. */
export function fixturePower(height: number, floorIrradiance: number): number {
  return floorIrradiance * height * height;
}

/** Ceiling fixtures of a layout as lights, scaled by the theme's own ambient level (dark rooms stay dark). */
export function ceilingLightsForLayout(
  ceilingSpots: RoomLayout["ceilingSpots"],
  themeAmbientIntensity: number
): CeilingLight[] {
  const floorIrradiance = CEILING_LIGHT_FLOOR_IRRADIANCE * (themeAmbientIntensity / REFERENCE_AMBIENT);
  return ceilingSpots.map(([x, y, z]) => ({ x, y, z, power: fixturePower(y, floorIrradiance) }));
}

/**
 * Merges the closest pairs of lights (power-weighted centroid, summed power) until at most `max` remain.
 * Total power is preserved, so a room with a very dense curator-placed grid loses some pool detail but
 * none of its brightness. O(n³) — runs once per layout on at most a few dozen fixtures.
 */
export function clusterCeilingLights(lights: CeilingLight[], max: number): CeilingLight[] {
  const out = lights.map((l) => ({ ...l }));
  while (out.length > max) {
    let bi = 0;
    let bj = 1;
    let best = Infinity;
    for (let i = 0; i < out.length; i++) {
      for (let j = i + 1; j < out.length; j++) {
        const d = (out[i].x - out[j].x) ** 2 + (out[i].y - out[j].y) ** 2 + (out[i].z - out[j].z) ** 2;
        if (d < best) {
          best = d;
          bi = i;
          bj = j;
        }
      }
    }
    const a = out[bi];
    const b = out[bj];
    const power = a.power + b.power;
    const wa = power > 0 ? a.power / power : 0.5;
    const wb = 1 - wa;
    out[bi] = { x: a.x * wa + b.x * wb, y: a.y * wa + b.y * wb, z: a.z * wa + b.z * wb, power };
    out.splice(bj, 1);
  }
  return out;
}

/** CPU mirror of the shader term: irradiance (before colour) at point `p` with unit normal `n`. */
export function ceilingIrradiance(
  p: { x: number; y: number; z: number },
  n: { x: number; y: number; z: number },
  lights: CeilingLight[]
): number {
  let e = 0;
  for (const l of lights) {
    const dx = l.x - p.x;
    const dy = l.y - p.y;
    const dz = l.z - p.z;
    const d2 = dx * dx + dy * dy + dz * dz;
    const inv = 1 / Math.sqrt(Math.max(d2, 1e-8));
    const down = Math.max(dy * inv, 0);
    const lobe = CEILING_LIGHT_UPLIGHT + (1 - CEILING_LIGHT_UPLIGHT) * Math.pow(down, CEILING_LIGHT_LOBE);
    const cos = Math.max((n.x * dx + n.y * dy + n.z * dz) * inv, 0);
    e += (l.power * lobe * cos) / (d2 + CEILING_LIGHT_EPSILON);
  }
  return e;
}

// --- GPU side ------------------------------------------------------------------------------------------

export interface CeilingLightUniforms {
  /** xyz = position, w = power. */
  uCeilingLights: { value: THREE.Vector4[] };
  uCeilingLightCount: { value: number };
  /** Linear-space fixture colour (theme spotColor). */
  uCeilingLightColor: { value: THREE.Color };
}

/**
 * The scene's single ceiling-light uniform set. Module-level on purpose: furniture materials come from
 * useGLTF's cache and are shared by every room that places that model, so they're patched once and must
 * keep reading the *current* room's lights — re-pointing them per room would recompile. Only one gallery
 * Canvas is mounted at a time; CeilingLightSync (Gallery.tsx) refreshes the values when the room changes.
 */
export const ceilingLightUniforms: CeilingLightUniforms = {
  uCeilingLights: { value: Array.from({ length: MAX_CEILING_LIGHTS }, () => new THREE.Vector4()) },
  uCeilingLightCount: { value: 0 },
  uCeilingLightColor: { value: new THREE.Color(1, 1, 1) },
};

/** Writes a room's lights into the shared uniforms (clustered down to MAX_CEILING_LIGHTS if needed). */
export function setCeilingLights(lights: CeilingLight[], color: THREE.ColorRepresentation): void {
  const packed = clusterCeilingLights(lights, MAX_CEILING_LIGHTS);
  const slots = ceilingLightUniforms.uCeilingLights.value;
  for (let i = 0; i < MAX_CEILING_LIGHTS; i++) {
    const l = packed[i];
    if (l) slots[i].set(l.x, l.y, l.z, l.power);
    else slots[i].set(0, 0, 0, 0);
  }
  ceilingLightUniforms.uCeilingLightCount.value = packed.length;
  ceilingLightUniforms.uCeilingLightColor.value.set(color);
}

/** Declarations + irradiance functions (ceiling fixtures + window daylight, windowLight.ts). Needs a world-space position/normal from the caller. */
export const CEILING_LIGHT_FRAGMENT_DECL = /* glsl */ `
${WINDOW_LIGHT_FRAGMENT_DECL}
${SUN_LIGHT_FRAGMENT_DECL}
#define MAX_CEILING_LIGHTS ${MAX_CEILING_LIGHTS}
uniform vec4 uCeilingLights[MAX_CEILING_LIGHTS];
uniform int uCeilingLightCount;
uniform vec3 uCeilingLightColor;

vec3 ceilingLightIrradiance(vec3 p, vec3 n) {
  float e = 0.0;
  for (int i = 0; i < MAX_CEILING_LIGHTS; i++) {
    if (i >= uCeilingLightCount) break;
    vec4 l = uCeilingLights[i];
    vec3 toLight = l.xyz - p;
    float d2 = dot(toLight, toLight);
    vec3 L = toLight * inversesqrt(max(d2, 1e-8));
    float down = max(L.y, 0.0);
    float lobe = ${CEILING_LIGHT_UPLIGHT.toFixed(3)} + ${(1 - CEILING_LIGHT_UPLIGHT).toFixed(3)} * pow(down, ${CEILING_LIGHT_LOBE.toFixed(1)});
    e += l.w * lobe * max(dot(n, L), 0.0) / (d2 + ${CEILING_LIGHT_EPSILON.toFixed(3)});
  }
  return e * uCeilingLightColor;
}
`;

/**
 * Inserted after three's `lights_fragment_end` (where direct lights have been summed). Adds the ceiling
 * fixtures, the windows' daylight (windowLight.ts) and the sun patches (sunLight.ts) — all direct, diffuse-only,
 * with visible sources. `normal` is the
 * view-space shading normal *with* the normal map applied, so the room's surface relief catches this
 * light too; it's brought to world space to match the light positions. `worldPos` is the caller's varying;
 * `occlusion` an optional GLSL float expression scaling the term (the floor's furniture contact shadow).
 */
export function ceilingLightApply(worldPos: string, occlusion = "1.0"): string {
  return /* glsl */ `
{
  vec3 ceilingN = normalize(inverseTransformDirection(normal, viewMatrix));
  reflectedLight.directDiffuse += (ceilingLightIrradiance(${worldPos}, ceilingN) + windowLightIrradiance(${worldPos}, ceilingN)
      + sunLightIrradiance(${worldPos}, ceilingN))
    * BRDF_Lambert(material.diffuseColor) * (${occlusion});
}
`;
}

// --- Furniture patch -----------------------------------------------------------------------------------

const FURNITURE_VERTEX_DECL = /* glsl */ `
varying vec3 vCeilingLightWorldPos;
`;
// Own world position (three's `worldPosition` only exists under some defines). Instanced: furniture is
// drawn with drei's <Instances>.
const FURNITURE_VERTEX_BODY = /* glsl */ `
{
  vec4 ceilingWorld = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
    ceilingWorld = instanceMatrix * ceilingWorld;
  #endif
  vCeilingLightWorldPos = (modelMatrix * ceilingWorld).xyz;
}
`;

function patchLitShader(shader: THREE.WebGLProgramParametersWithUniforms, apply: string) {
  Object.assign(shader.uniforms, ceilingLightUniforms, windowLightUniforms, sunLightUniforms);
  shader.vertexShader = shader.vertexShader
    .replace("#include <common>", `#include <common>\n${FURNITURE_VERTEX_DECL}`)
    .replace("#include <project_vertex>", `#include <project_vertex>\n${FURNITURE_VERTEX_BODY}`);
  shader.fragmentShader = shader.fragmentShader
    .replace("#include <common>", `#include <common>\nvarying vec3 vCeilingLightWorldPos;\n${CEILING_LIGHT_FRAGMENT_DECL}`)
    .replace("#include <lights_fragment_end>", `#include <lights_fragment_end>\n${apply}`);
}

function furnitureOnBeforeCompile(shader: THREE.WebGLProgramParametersWithUniforms) {
  patchLitShader(shader, ceilingLightApply("vCeilingLightWorldPos"));
}

/** Daylight only (windows + sun), no ceiling fixtures — for paintings and frames, see applyDaylight. */
function daylightApply(worldPos: string): string {
  return /* glsl */ `
{
  vec3 ceilingN = normalize(inverseTransformDirection(normal, viewMatrix));
  reflectedLight.directDiffuse += (windowLightIrradiance(${worldPos}, ceilingN) + sunLightIrradiance(${worldPos}, ceilingN))
    * BRDF_Lambert(material.diffuseColor);
}
`;
}

function daylightOnBeforeCompile(shader: THREE.WebGLProgramParametersWithUniforms) {
  patchLitShader(shader, daylightApply("vCeilingLightWorldPos"));
}

/**
 * Lets a (GLTF furniture) material receive the ceiling light, so a plinth or bench is lit from the same
 * fixtures as the room around it. Only MeshStandard/MeshPhysical materials (they have the lighting
 * chunks this hooks into); idempotent, and leaves a material that already has its own onBeforeCompile alone.
 */
export function applyCeilingLight(material: THREE.Material): void {
  if (!(material instanceof THREE.MeshStandardMaterial)) return;
  if (material.userData.ceilingLight) return;
  if (material.onBeforeCompile !== THREE.Material.prototype.onBeforeCompile) return;
  material.userData.ceilingLight = true;
  material.onBeforeCompile = furnitureOnBeforeCompile;
  material.needsUpdate = true;
}

/**
 * Lets a painting's canvas or frame material receive the window daylight and the sun patches (a work hit by
 * low sun lights up like the wall around it), but *not* the ceiling fixtures — the picture lights already
 * set the works' exposure (sceneLighting.ts). Same rules as applyCeilingLight; its own program cache key,
 * since three keys programs by onBeforeCompile's source.
 */
export function applyDaylight(material: THREE.Material): void {
  if (!(material instanceof THREE.MeshStandardMaterial)) return;
  if (material.userData.daylight) return;
  if (material.onBeforeCompile !== THREE.Material.prototype.onBeforeCompile) return;
  material.userData.daylight = true;
  material.onBeforeCompile = daylightOnBeforeCompile;
  material.customProgramCacheKey = () => "vea-daylight";
  material.needsUpdate = true;
}
