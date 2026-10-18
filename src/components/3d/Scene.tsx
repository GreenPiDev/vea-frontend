import { Suspense, useEffect, useMemo, useState } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { PerformanceMonitor, Stats } from "@react-three/drei";
import { EffectComposer, Bloom, Vignette, SMAA } from "@react-three/postprocessing";
import * as THREE from "three";
import Gallery from "./Gallery";
import Player from "./Player";
import ArtworkIconProjector, { type ArtworkIconPosition } from "./ArtworkIconProjector";
import { buildRoomLayout } from "./galleryLayout";
import { ExhibitionProvider } from "./ExhibitionContext";
import type { Exhibition } from "./exhibitions";

// Render cost scales with the actual number of pixels the GPU has to fill every frame —
// a browser window maximized on a 4K TV or a wide external monitor has several times the
// CSS pixel area of a laptop's own screen, even at the exact same pixel ratio. Capping the
// renderer's *total* output pixel budget (not just its ratio relative to CSS size) means a
// visitor on a huge screen gets a lower resolution render rather than a choppy one — fluid
// over sharp, which matters more once this scene is walked around in than static sharpness
// does. 1920x1080 is a deliberately conservative target; this is the ceiling, ordinary
// laptop/phone windows rarely hit it and keep their normal (FPS-driven, see below) ratio.
const MAX_RENDER_PIXELS = 1920 * 1080;
// Never drop below this even on an enormous screen — past this point the blur would be more
// distracting than the fluidity gain is worth.
const MIN_RENDER_SCALE = 0.5;

/**
 * Combines two independent signals into the renderer's actual pixel ratio:
 * 1. `qualityScale` — FPS-driven (see PerformanceMonitor below): how much headroom this
 *    device has proven it has, same idea as before.
 * 2. A hard cap derived from the canvas's current CSS size, so `qualityScale` alone can
 *    never push a giant window past MAX_RENDER_PIXELS total fragments per frame.
 * Must live inside <Canvas> (needs live `size`/`gl` from the R3F render tree) rather than
 * going through the `dpr` prop, which only knows a flat ratio, not the window's actual
 * pixel area.
 */
function AdaptiveRenderScale({ qualityScale }: { qualityScale: number }) {
  const { gl, size } = useThree();

  useEffect(() => {
    const sizeCapScale = Math.sqrt(MAX_RENDER_PIXELS / (size.width * size.height));
    const scale = Math.max(MIN_RENDER_SCALE, Math.min(qualityScale, sizeCapScale));
    gl.setPixelRatio(scale);
  }, [gl, size, qualityScale]);

  return null;
}

interface SceneProps {
  exhibition: Exhibition;
  onLockChange?: (locked: boolean) => void;
  onIconPositionsChange?: (positions: ArtworkIconPosition[]) => void;
  onCanvasReady?: (canvas: HTMLCanvasElement) => void;
}

export default function Scene({
  exhibition,
  onLockChange,
  onIconPositionsChange,
  onCanvasReady,
}: SceneProps) {
  // FPS-driven quality signal: start conservative and only spend extra pixels once the
  // device has proven it can hold frame rate, so mid/low-end GPUs don't pay retina-level
  // render cost by default. Combined with the window-size cap in AdaptiveRenderScale above.
  const [qualityScale, setQualityScale] = useState(1);

  const layout = useMemo(
    () =>
      exhibition.customLayout ??
      buildRoomLayout(exhibition.roomSize ?? [10, 10], exhibition.wallHeight),
    [exhibition]
  );

  return (
    <Canvas
      gl={{ antialias: false, toneMapping: THREE.ACESFilmicToneMapping }}
      camera={{ fov: 65, near: 0.1, far: 100, position: layout.playerStart }}
      onCreated={({ gl }) => {
        gl.outputColorSpace = THREE.SRGBColorSpace;
        onCanvasReady?.(gl.domElement);
      }}
    >
      <AdaptiveRenderScale qualityScale={qualityScale} />
      <PerformanceMonitor
        onIncline={() => setQualityScale(1.5)}
        onDecline={() => setQualityScale(1)}
        // A borderline device can incline/decline back and forth every few seconds,
        // which reads to the user as FPS randomly swinging. Once drei detects that
        // oscillation (default: 3 flip-flops), settle on the conservative resolution
        // instead of letting it keep bouncing.
        onFallback={() => setQualityScale(1)}
      />
      <color attach="background" args={[exhibition.theme.backgroundColor]} />
      <ExhibitionProvider exhibition={exhibition} layout={layout}>
        <Suspense fallback={null}>
          <Gallery />
        </Suspense>
        <Player onLockChange={onLockChange} />
        {onIconPositionsChange && (
          <ArtworkIconProjector onPositionsChange={onIconPositionsChange} />
        )}
      </ExhibitionProvider>
      <Stats className="fps-stats" />
      {/* multisampling stays 0 (real MSAA, same as the renderer's own antialias:false above, is the
          expensive option) — SMAA is a cheap edge-detection post-process pass instead, added last so
          it smooths the final composited frame (including Bloom's contribution) in one go. */}
      <EffectComposer multisampling={0}>
        <Bloom intensity={0.35} luminanceThreshold={0.82} luminanceSmoothing={0.3} mipmapBlur />
        <Vignette eskil={false} offset={0.22} darkness={0.55} />
        <SMAA />
      </EffectComposer>
    </Canvas>
  );
}
