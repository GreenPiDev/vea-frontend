import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { buildBakeGeometry, daylightRevision, type DaylightAtlas } from "./daylightBake";
import { WINDOW_LIGHT_FRAGMENT_DECL, windowLightUniforms } from "./windowLight";
import { SUN_LIGHT_FRAGMENT_DECL, sunLightUniforms } from "./sunLight";

const VERTEX = /* glsl */ `
attribute vec3 worldPos;
varying vec3 vBakeWorld;
varying vec3 vBakeNormal;
void main() {
  vBakeWorld = worldPos;
  vBakeNormal = normal;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

// The same window + sun (+ sun shadow) functions the live surfaces run, once per texel.
const FRAGMENT = /* glsl */ `
${WINDOW_LIGHT_FRAGMENT_DECL}
${SUN_LIGHT_FRAGMENT_DECL}
varying vec3 vBakeWorld;
varying vec3 vBakeNormal;
void main() {
  vec3 n = normalize(vBakeNormal);
  gl_FragColor = vec4(windowLightIrradiance(vBakeWorld, n) + sunLightIrradiance(vBakeWorld, n), 1.0);
}
`;

/**
 * Bakes the room surfaces' daylight into `target` (layout: daylightBake.ts) on the first frame and again
 * whenever the daylight uniforms change (window lights, sun, shadow casters — e.g. when a furniture model
 * finishes loading). One draw into an off-screen target, before the frame renders; nothing per frame otherwise.
 */
export default function DaylightBaker({ atlas, target }: { atlas: DaylightAtlas; target: THREE.WebGLRenderTarget }) {
  const gl = useThree((s) => s.gl);
  const { scene, camera, geometry, material } = useMemo(() => {
    const geometry = buildBakeGeometry(atlas);
    const material = new THREE.ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      uniforms: { ...windowLightUniforms, ...sunLightUniforms },
      depthTest: false,
      depthWrite: false,
      blending: THREE.NoBlending,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.frustumCulled = false;
    const scene = new THREE.Scene();
    scene.add(mesh);
    return { scene, camera: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), geometry, material };
  }, [atlas]);
  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material]
  );

  const baked = useRef<{ revision: number; target: THREE.WebGLRenderTarget; scene: THREE.Scene } | null>(null);
  useFrame(() => {
    const revision = daylightRevision();
    const last = baked.current;
    if (last && last.revision === revision && last.target === target && last.scene === scene) return;
    const previousTarget = gl.getRenderTarget();
    const previousClear = gl.getClearColor(new THREE.Color());
    const previousAlpha = gl.getClearAlpha();
    gl.setRenderTarget(target);
    gl.setClearColor(0x000000, 0);
    gl.clear(true, false, false);
    gl.render(scene, camera);
    gl.setRenderTarget(previousTarget);
    gl.setClearColor(previousClear, previousAlpha);
    baked.current = { revision, target, scene };
  });

  return null;
}
