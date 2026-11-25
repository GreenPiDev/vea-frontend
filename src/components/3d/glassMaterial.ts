import * as THREE from "three";

/**
 * Glass in one pass: what it lets through is the background multiplied by a tint (blendDst = 1 − absorption),
 * and on top it *adds* its own colour, which is black diffuse + the env-map reflection with the BRDF's
 * Fresnel — ~4 % face-on, much more at a grazing angle, like real float glass. No
 * MeshPhysicalMaterial.transmission (that re-renders the scene). Used for windows (WindowFixtures.tsx) and
 * glass balustrades (Balconies.tsx, MezzanineStructure.tsx).
 */
export function createGlassMaterial(absorption: [number, number, number]): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ color: 0x000000, roughness: 0.03, metalness: 0 });
  m.transparent = true;
  m.depthWrite = false;
  m.blending = THREE.CustomBlending;
  m.blendEquation = THREE.AddEquation;
  m.blendSrc = THREE.OneFactor;
  m.blendDst = THREE.OneMinusConstantColorFactor;
  m.blendColor.setRGB(...absorption);
  return m;
}
