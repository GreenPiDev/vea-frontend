import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { buildRectBakeGeometry, isTargetAllocated } from "./daylightBake";
import { PICTURE_LIGHT_FUNCTIONS, pictureLampUniform, type PictureLightPlacement } from "./pictureLight";
import type { PictureLightAtlas } from "./pictureLightBake";

const VERTEX = /* glsl */ `
attribute vec3 worldPos;
varying vec3 vBakeWorld;
void main() {
  vBakeWorld = worldPos;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

// One lamp per draw, added up: rgb = I·(lamp − p), a = I (pictureLightBake.ts). The clamp only guards HalfFloat
// range right at a lamp, where the window shape is already ~0.
const FRAGMENT = /* glsl */ `
${PICTURE_LIGHT_FUNCTIONS}
uniform vec3 uLamp;
uniform vec3 uLampNormal;
uniform vec4 uLampWindow;
varying vec3 vBakeWorld;
void main() {
  float s = min(pictureLightIntensity(vBakeWorld, uLamp, uLampNormal, uLampWindow), 1000.0);
  gl_FragColor = vec4(s * (uLamp - vBakeWorld), s);
}
`;

/**
 * Bakes the picture lights' wall wash into `target` (layout: pictureLightBake.ts) on the first frame after the
 * room (its walls or paintings) changes: one additive draw per lamp over the rects it reaches, into an
 * off-screen target, before the frame renders. Nothing per frame otherwise.
 */
export default function PictureLightBaker({
  atlas,
  target,
  lights,
}: {
  atlas: PictureLightAtlas;
  target: THREE.WebGLRenderTarget;
  lights: PictureLightPlacement[];
}) {
  const gl = useThree((s) => s.gl);
  const bake = useMemo(() => {
    const scene = new THREE.Scene();
    const geometries: THREE.BufferGeometry[] = [];
    const materials: THREE.ShaderMaterial[] = [];
    lights.forEach((light, i) => {
      const rects = atlas.rects.filter((r) => r.lights.includes(i));
      if (!rects.length) return;
      const geometry = buildRectBakeGeometry(rects, atlas.width, atlas.height);
      const lamp = pictureLampUniform(light);
      const material = new THREE.ShaderMaterial({
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        uniforms: {
          uLamp: { value: lamp.position },
          uLampNormal: { value: lamp.normal },
          uLampWindow: { value: lamp.window },
        },
        depthTest: false,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.CustomBlending,
        blendEquation: THREE.AddEquation,
        blendSrc: THREE.OneFactor,
        blendDst: THREE.OneFactor,
        blendSrcAlpha: THREE.OneFactor,
        blendDstAlpha: THREE.OneFactor,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.frustumCulled = false;
      scene.add(mesh);
      geometries.push(geometry);
      materials.push(material);
    });
    return { scene, camera: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), geometries, materials };
  }, [atlas, lights]);
  useEffect(
    () => () => {
      for (const g of bake.geometries) g.dispose();
      for (const m of bake.materials) m.dispose();
    },
    [bake]
  );

  const baked = useRef<{ target: THREE.WebGLRenderTarget; scene: THREE.Scene } | null>(null);
  // Re-bake when the target was freed under us (StrictMode, see isTargetAllocated) — and ask for that frame.
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => invalidate(), [target, invalidate]);
  useFrame(() => {
    const last = baked.current;
    if (last && last.target === target && last.scene === bake.scene && isTargetAllocated(gl, target)) return;
    const previousTarget = gl.getRenderTarget();
    const previousClear = gl.getClearColor(new THREE.Color());
    const previousAlpha = gl.getClearAlpha();
    gl.setRenderTarget(target);
    gl.setClearColor(0x000000, 0);
    gl.clear(true, false, false);
    gl.render(bake.scene, bake.camera);
    gl.setRenderTarget(previousTarget);
    gl.setClearColor(previousClear, previousAlpha);
    baked.current = { target, scene: bake.scene };
  });

  return null;
}
