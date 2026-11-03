import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { Artwork as ArtworkData } from "./artworks";
import { SHADOW_SPREAD, computeArtworkShadow } from "./artworkShadow";

// The quad's own scale carries everything per-instance, so no extra instanced attributes are needed:
// x/y = quad size (the silhouette is that minus SHADOW_SPREAD per side), z = shadow strength (z scale
// has no effect on a flat quad's geometry).
const VERTEX = /* glsl */ `
varying vec2 vLocal;
varying vec2 vHalf;
varying float vStrength;
void main() {
  mat4 m = mat4(1.0);
  #ifdef USE_INSTANCING
    m = instanceMatrix;
  #endif
  vec3 scale = vec3(length(m[0].xyz), length(m[1].xyz), length(m[2].xyz));
  vHalf = scale.xy * 0.5;
  vLocal = position.xy * scale.xy;
  vStrength = scale.z;
  gl_Position = projectionMatrix * modelViewMatrix * m * vec4(position, 1.0);
}
`;

const FRAGMENT = /* glsl */ `
uniform float uSpread;
varying vec2 vLocal;
varying vec2 vHalf;
varying float vStrength;
void main() {
  // Signed distance to the painting's silhouette rectangle (negative inside).
  vec2 q = abs(vLocal) - (vHalf - uSpread);
  float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
  float shadow = 1.0 - smoothstep(-uSpread * 0.5, uSpread, d);
  gl_FragColor = vec4(0.0, 0.0, 0.0, shadow * shadow * vStrength);
}
`;

const shadowMaterial = new THREE.ShaderMaterial({
  vertexShader: VERTEX,
  fragmentShader: FRAGMENT,
  uniforms: { uSpread: { value: SHADOW_SPREAD } },
  transparent: true,
  depthWrite: false,
  polygonOffset: true,
  polygonOffsetFactor: -1,
  polygonOffsetUnits: -1,
});

const unitQuad = new THREE.PlaneGeometry(1, 1);

/**
 * Every painting's soft wall shadow in one InstancedMesh — a single draw call regardless of artwork
 * count, a handful of ALU ops per covered pixel, no textures. See artworkShadow.ts.
 */
export default function ArtworkWallShadows({ artworks }: { artworks: ArtworkData[] }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const count = artworks.length;
  const shadows = useMemo(() => artworks.map(computeArtworkShadow), [artworks]);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    shadows.forEach((s, i) => {
      position.set(...s.position);
      quaternion.setFromAxisAngle(up, s.rotationY);
      scale.set(s.width, s.height, s.strength);
      mesh.setMatrixAt(i, matrix.compose(position, quaternion, scale));
    });
    mesh.instanceMatrix.needsUpdate = true;
  }, [shadows]);

  if (count === 0) return null;

  return (
    <instancedMesh
      // Instance capacity is fixed at construction (args), so a different count needs a fresh mesh;
      // R3F disposes the old one on unmount (not the shared geometry/material passed through args).
      key={count}
      ref={meshRef}
      args={[unitQuad, shadowMaterial, count]}
      // One draw call either way; instance bounds would need recomputing on every layout change otherwise.
      frustumCulled={false}
      raycast={() => null}
    />
  );
}
