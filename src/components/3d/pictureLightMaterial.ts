// Picture light on the painting itself and its wall label (2026-11-25): each of these meshes evaluates only
// the lamps that can reach it — its own, plus at most one neighbour whose wash spills onto it
// (lampsReaching, pictureLightBake.ts) — through three's own BRDF (RE_Direct), so the canvas varnish sheen,
// the weave normal map and the gilded frame's highlights respond exactly as they did to the old spotLights.
// The lamps are per-material uniforms (each painting / label owns its material); the program is shared, so
// there's one compile per kind (paintings: daylight only; labels: + ceiling fixtures), never per room.

import * as THREE from "three";
import { ceilingLightApply, daylightApply, patchLitShader } from "./ceilingLight";
import { PICTURE_LIGHT_FUNCTIONS, pictureLampUniform, pictureLightUniforms, type PictureLightPlacement } from "./pictureLight";
import { MAX_OBJECT_PICTURE_LIGHTS } from "./pictureLightBake";

const FRAGMENT_DECL = /* glsl */ `
${PICTURE_LIGHT_FUNCTIONS}
uniform vec3 uPictureLightColor;
uniform vec3 uPictureLamps[${MAX_OBJECT_PICTURE_LIGHTS}];
uniform vec3 uPictureLampNormals[${MAX_OBJECT_PICTURE_LIGHTS}];
uniform vec4 uPictureLampWindows[${MAX_OBJECT_PICTURE_LIGHTS}];
uniform int uPictureLampCount;
`;

// After lights_fragment_end, like the ceiling/daylight terms; geometry* and material are three's own locals.
const APPLY = /* glsl */ `
for ( int i = 0; i < ${MAX_OBJECT_PICTURE_LIGHTS}; i ++ ) {
  if ( i >= uPictureLampCount ) break;
  vec3 lamp = uPictureLamps[ i ];
  float s = pictureLightIntensity( vCeilingLightWorldPos, lamp, uPictureLampNormals[ i ], uPictureLampWindows[ i ] );
  if ( s > 0.0 ) {
    IncidentLight pictureIncident;
    pictureIncident.direction = normalize( ( viewMatrix * vec4( lamp - vCeilingLightWorldPos, 0.0 ) ).xyz );
    pictureIncident.color = uPictureLightColor * s;
    pictureIncident.visible = true;
    RE_Direct( pictureIncident, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
  }
}
`;

interface LampUniforms {
  uPictureLamps: { value: THREE.Vector3[] };
  uPictureLampNormals: { value: THREE.Vector3[] };
  uPictureLampWindows: { value: THREE.Vector4[] };
  uPictureLampCount: { value: number };
}

function lampUniforms(lights: PictureLightPlacement[]): LampUniforms {
  const packed = lights.slice(0, MAX_OBJECT_PICTURE_LIGHTS).map(pictureLampUniform);
  const pad = <T>(list: T[], make: () => T) => Array.from({ length: MAX_OBJECT_PICTURE_LIGHTS }, (_, i) => list[i] ?? make());
  return {
    uPictureLamps: { value: pad(packed.map((l) => l.position), () => new THREE.Vector3()) },
    uPictureLampNormals: { value: pad(packed.map((l) => l.normal), () => new THREE.Vector3(0, 0, 1)) },
    uPictureLampWindows: { value: pad(packed.map((l) => l.window), () => new THREE.Vector4(1, 0, 0, 0)) },
    uPictureLampCount: { value: packed.length },
  };
}

function onBeforeCompile(this: THREE.Material, shader: THREE.WebGLProgramParametersWithUniforms) {
  const data = this.userData as { pictureLamps: LampUniforms; pictureCeiling: boolean };
  const base = data.pictureCeiling ? ceilingLightApply("vCeilingLightWorldPos") : daylightApply("vCeilingLightWorldPos");
  patchLitShader(shader, `${base}\n${APPLY}`);
  Object.assign(shader.uniforms, pictureLightUniforms, data.pictureLamps);
  shader.fragmentShader = shader.fragmentShader.replace("#include <common>", `#include <common>\n${FRAGMENT_DECL}`);
}

/**
 * Lets a painting's canvas/frame (`ceiling: false` — window daylight + sun, no ceiling fixtures, as
 * applyDaylight) or a wall label (`ceiling: true` — + ceiling fixtures, as applyCeilingLight) receive the
 * picture lights in `lights` (own lamp first, see lampsReaching). Call once, before the first render, on a
 * material owned by that one mesh.
 */
export function applyPictureLight(material: THREE.MeshStandardMaterial, lights: PictureLightPlacement[], options: { ceiling: boolean }): void {
  material.userData.pictureLamps = lampUniforms(lights);
  material.userData.pictureCeiling = options.ceiling;
  material.onBeforeCompile = onBeforeCompile;
  material.customProgramCacheKey = () => (options.ceiling ? "vea-picture-lit-ceiling" : "vea-picture-lit-daylight");
  material.needsUpdate = true;
}
