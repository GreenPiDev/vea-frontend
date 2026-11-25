import { useEffect } from "react";
import * as THREE from "three";
import { useThree } from "@react-three/fiber";
import { useProgress } from "@react-three/drei";
import { pendingTextures } from "./pendingTextures";

/** Let React commit the components that were waiting on the finished loads (Suspense) before scanning. */
const SETTLE_MS = 300;

/**
 * Removes the first-look stutter. three compiles a material's shader program and uploads its textures lazily,
 * the first time an object using them is *in view* — so the first turn toward a wall that wasn't on screen at
 * load (another lit painting, a furniture model, a label, the hover highlight) stalled the frame for tens to
 * hundreds of ms while the program linked and a 2048 px photo was decoded and uploaded. Here, once loading is
 * done (and again after anything that loads later), every program in the scene is compiled — in parallel
 * where the driver supports KHR_parallel_shader_compile — and the textures are uploaded one per task, so the
 * visitor's first turns are as smooth as the later ones. Visible result is unchanged.
 *
 * The scene is drawn into the composer's buffers, not the canvas, and three keys programs on that (linear
 * output, no tone mapping): compiling with no render target bound would build the wrong variants, so a
 * throwaway target is bound for the (synchronous) compile step.
 */
export default function ShaderWarmup() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const invalidate = useThree((s) => s.invalidate);
  const loading = useProgress((s) => s.active);

  useEffect(() => {
    if (loading) return;
    let cancelled = false;
    let uploadTimer: ReturnType<typeof setTimeout> | null = null;

    const settleTimer = setTimeout(() => {
      const target = new THREE.WebGLRenderTarget(1, 1);
      const previous = gl.getRenderTarget();
      let compiled: Promise<unknown> = Promise.resolve();
      try {
        gl.setRenderTarget(target);
        compiled = gl.compileAsync(scene, camera);
      } catch {
        // Warm-up is an optimisation only — a failure here just leaves the usual lazy compile.
      } finally {
        gl.setRenderTarget(previous);
        target.dispose();
      }

      const queue = pendingTextures(scene, (t) => (gl.properties.get(t) as { __version?: number }).__version);
      const uploadNext = () => {
        uploadTimer = null;
        if (cancelled) return;
        const texture = queue.shift();
        if (!texture) return;
        gl.initTexture(texture);
        uploadTimer = setTimeout(uploadNext, 0);
      };
      uploadNext();

      compiled.then(() => {
        if (!cancelled) invalidate();
      });
    }, SETTLE_MS);

    return () => {
      cancelled = true;
      clearTimeout(settleTimer);
      if (uploadTimer) clearTimeout(uploadTimer);
    };
  }, [loading, gl, scene, camera, invalidate]);

  return null;
}
