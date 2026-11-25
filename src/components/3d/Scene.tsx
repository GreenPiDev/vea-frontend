import { Suspense, useContext, useEffect, useMemo, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Stats } from "@react-three/drei";
import {
  EffectComposer,
  EffectComposerContext,
  Bloom,
  Vignette,
  Noise,
  SMAA,
  ToneMapping,
} from "@react-three/postprocessing";
import SeparateFXAA from "./SeparateFXAA";
import FrameScheduler, { QualityMonitor } from "./FrameScheduler";
import { antialiasMode, renderPixelRatio } from "./renderScale";
import { isTouchPrimaryDevice } from "../../lib/navigationMode";
import { BlendFunction, ToneMappingMode, type BloomEffect } from "postprocessing";
import * as THREE from "three";
import Gallery from "./Gallery";
import ShaderWarmup from "./ShaderWarmup";
import Player from "./Player";
import ArtworkIconProjector, { type ArtworkIconPosition } from "./ArtworkIconProjector";
import SeatProximityTracker from "./SeatProximityTracker";
import ClickNavigation from "./ClickNavigation";
import WalkArtworkPicker from "./WalkArtworkPicker";
import ArtworkGoTo, { type ArtworkGoToRequest } from "./ArtworkGoTo";
import { createNavigationRequest } from "./clickNavigationGeometry";
import { fovAtZoom, fovForAspect, type CameraZoom } from "./cameraFov";
import type { NavigationMode } from "../../lib/navigationMode";
import { buildRoomLayout } from "./galleryLayout";
import { ExhibitionProvider } from "./ExhibitionContext";
import type { Exhibition } from "./exhibitions";
import type { SeatSpot } from "./seating";

/**
 * Starting point of the FPS-driven quality (0..1). Phones start mid-way (already ~1.8× on a 2.6× screen):
 * starting higher meant several seconds of stutter while the monitor stepped down.
 */
const INITIAL_QUALITY = isTouchPrimaryDevice() ? 0.5 : 0.75;
/** One FPS sample window = PERF_ITERATIONS × 250 ms; shorter than drei's 10 so a slow device adapts sooner. */
const PERF_ITERATIONS = 6;
/** How far one PerformanceMonitor incline/decline moves the quality. */
const QUALITY_STEP = 0.25;

/**
 * Sets the renderer's pixel ratio from the screen density, the canvas size and the FPS-driven quality
 * (renderScale.ts has the policy). Rendered *inside* <EffectComposer>: the composer sizes its buffers only
 * when the canvas CSS size changes, not when the pixel ratio does, so it has to be resized here too —
 * otherwise the post-processing chain keeps rendering at whatever ratio it started with.
 */
function AdaptiveRenderScale({ quality }: { quality: number }) {
  const { gl, size, invalidate } = useThree();
  const { composer } = useContext(EffectComposerContext);

  useEffect(() => {
    const ratio = renderPixelRatio({
      devicePixelRatio: window.devicePixelRatio,
      cssWidth: size.width,
      cssHeight: size.height,
      quality,
    });
    if (gl.getPixelRatio() === ratio) return;
    gl.setPixelRatio(ratio);
    composer.setSize(size.width, size.height);
    // Resizing clears the drawing buffer — redraw now (on-demand loop, FrameScheduler.tsx).
    invalidate();
  }, [gl, composer, size, quality, invalidate]);

  return null;
}

/**
 * The only writer of `camera.fov`: the aspect-derived base FOV (cameraFov.ts) narrowed by the click-mode
 * pinch/wheel zoom. A per-frame compare is a handful of ALU ops and keeps resize + zoom from fighting
 * over the camera; the projection matrix is only rebuilt when the value actually changes.
 */
function CameraFov({ cameraZoom }: { cameraZoom: CameraZoom }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const size = useThree((s) => s.size);
  useFrame(() => {
    const fov = fovAtZoom(fovForAspect(size.width / Math.max(1, size.height)), cameraZoom.zoom);
    if (Math.abs(fov - camera.fov) < 1e-4) return;
    camera.fov = fov;
    camera.updateProjectionMatrix();
  });
  return null;
}

/**
 * The FPS counter: dev server, or `?fps` in the URL on a live build — visitors never see it. Under on-demand
 * rendering (FrameScheduler.tsx) it reads low/frozen while nothing moves; that's frames not drawn, not slowness.
 */
const SHOW_FPS_STATS = import.meta.env.DEV || new URLSearchParams(window.location.search).has("fps");

/** Bloom's luminance (threshold) pass at half resolution — see the <Bloom> comment in Scene. */
function halfResBloomThreshold(bloom: BloomEffect | null) {
  if (bloom) bloom.luminancePass.resolution.scale = 0.5;
}

interface SceneProps {
  exhibition: Exhibition;
  onLockChange?: (locked: boolean) => void;
  onIconPositionsChange?: (positions: ArtworkIconPosition[]) => void;
  onCanvasReady?: (canvas: HTMLCanvasElement) => void;
  seatedSpot?: SeatSpot | null;
  onNearestSeatChange?: (seat: SeatSpot | null) => void;
  navigationMode: NavigationMode;
  /** Click/tap on a painting in click-to-go mode (opens its info card in App.tsx). */
  onArtworkClick?: (artworkId: string) => void;
  /** Click/tap on a painting's wall label. */
  onLabelClick?: (artworkId: string) => void;
  /** Walk to a painting chosen outside the Canvas (the thumbnail rail). */
  goToArtwork?: ArtworkGoToRequest | null;
}

export default function Scene({
  exhibition,
  onLockChange,
  onIconPositionsChange,
  onCanvasReady,
  seatedSpot,
  onNearestSeatChange,
  navigationMode,
  onArtworkClick,
  onLabelClick,
  goToArtwork = null,
}: SceneProps) {
  // Click-to-go request shared by ClickNavigation (writes) and Player (reads every frame).
  const [navigation] = useState(createNavigationRequest);
  // Pinch / wheel magnification shared by ClickNavigation (writes) and CameraFov (applies).
  const [cameraZoom] = useState<CameraZoom>(() => ({ zoom: 1 }));
  // FPS-driven quality (0..1), turned into a pixel ratio by AdaptiveRenderScale above.
  const [quality, setQuality] = useState(INITIAL_QUALITY);
  const [antialias] = useState(() => antialiasMode(window.devicePixelRatio, isTouchPrimaryDevice()));

  const layout = useMemo(
    () =>
      exhibition.customLayout ??
      buildRoomLayout(exhibition.roomSize ?? [10, 10], exhibition.wallHeight),
    [exhibition]
  );

  return (
    <Canvas
      // No renderer-level toneMapping here: <EffectComposer> forces gl.toneMapping to NoToneMapping while
      // mounted (@react-three/postprocessing does this unconditionally), so a value set here was silently
      // ignored and the HDR frame was hard-clipped. Tone mapping lives in the composer instead, see below.
      // The canvas's own framebuffer only ever receives the composer's final full-screen pass — the scene is
      // drawn into the composer's buffers, which carry their own depth. So no depth/stencil here (memory +
      // bandwidth on shared-memory GPUs like a MacBook Air's), and no alpha: the page never shows through,
      // and an opaque canvas spares the browser compositor a blend every frame. Keep the composer mounted —
      // without it the scene would render straight here, with no depth buffer.
      gl={{ antialias: false, alpha: false, depth: false, stencil: false }}
      // Frames only when something on screen can change — see FrameScheduler.tsx (device heat on long visits).
      frameloop="demand"
      // Layout size (offsetWidth/Height) instead of getBoundingClientRect: on a phone held upright the
      // scene root is rotated 90° with CSS (useForcedLandscape.ts), and the bounding rect would report the
      // rotated, portrait box — the wrong aspect ratio.
      resize={{ offsetSize: true }}
      // fov here is only the first frame's value — CameraFov derives the real one from the aspect ratio.
      camera={{ fov: 48, near: 0.1, far: 100, position: layout.playerStart }}
      onCreated={({ gl }) => {
        gl.outputColorSpace = THREE.SRGBColorSpace;
        onCanvasReady?.(gl.domElement);
      }}
    >
      <FrameScheduler />
      {/* drei's PerformanceMonitor times frames by wall clock — idle pauses would read as low FPS under
          on-demand rendering. QualityMonitor counts continuous render time only (FrameScheduler.tsx). */}
      <QualityMonitor factor={INITIAL_QUALITY} step={QUALITY_STEP} iterations={PERF_ITERATIONS} onChange={setQuality} />
      <color attach="background" args={[exhibition.theme.backgroundColor]} />
      <ExhibitionProvider exhibition={exhibition} layout={layout}>
        <Suspense fallback={null}>
          <Gallery />
        </Suspense>
        {/* Compiles every shader + uploads every texture once loading settles — no stall on the first turns. */}
        <ShaderWarmup />
        <CameraFov cameraZoom={cameraZoom} />
        <Player
          onLockChange={onLockChange}
          seatedSpot={seatedSpot}
          navigationMode={navigationMode}
          navigation={navigation}
        />
        <ArtworkGoTo request={goToArtwork} navigation={navigation} />
        {navigationMode === "walk" && onArtworkClick && <WalkArtworkPicker onArtworkClick={onArtworkClick} onLabelClick={onLabelClick} />}
        {navigationMode === "click" && (
          <ClickNavigation
            navigation={navigation}
            movementLocked={Boolean(seatedSpot)}
            onArtworkClick={onArtworkClick}
            onLabelClick={onLabelClick}
            cameraZoom={cameraZoom}
          />
        )}
        {onIconPositionsChange && (
          <ArtworkIconProjector onPositionsChange={onIconPositionsChange} />
        )}
        {onNearestSeatChange && (
          <SeatProximityTracker
            seats={exhibition.seats ?? []}
            disabled={Boolean(seatedSpot)}
            onNearestSeatChange={onNearestSeatChange}
          />
        )}
      </ExhibitionProvider>
      {SHOW_FPS_STATS && <Stats className="fps-stats" />}
      {/* multisampling stays 0 (real MSAA, same as the renderer's own antialias:false above, is the
          expensive option) — SMAA is a cheap edge-detection post-process pass instead, added last so
          it smooths the final composited frame (including Bloom's contribution) in one go. */}
      <EffectComposer multisampling={0}>
        <AdaptiveRenderScale quality={quality} />
        {/* Bloom runs on the linear HDR frame (before tone mapping). Threshold 1.0 = only true light sources
            (emissive fixtures, values above display white) glow; the previous 0.82 also caught brightly
            spot-lit wall/canvas areas, giving paintings a hazy halo instead of a crisp lit surface. */}
        {/* Threshold 1.5 (was 1.0): since the exposure rebalance (sceneLighting.ts) the light areas of a
            picture-lit canvas reach ~1.4 linear, and a painting must never glow like a lamp. The ceiling
            fixture discs (emissive 3) and the picture-light LED strips (3.5) still clear it and keep their halo. */}
        {/* Threshold pass at half resolution (postprocessing runs it at full size by default): its output only
            feeds the mip blur, whose first level is half size anyway — one full-size HalfFloat write + read
            less per frame for the same glow. */}
        <Bloom ref={halfResBloomThreshold} intensity={0.4} luminanceThreshold={1.5} luminanceSmoothing={0.25} mipmapBlur />
        {/* Khronos PBR Neutral rather than ACES Filmic: ACES shifts hues and saturation (warm yellows/oranges
            especially), which misrepresents the artworks' real colors — the one thing a gallery must not do.
            Neutral leaves everything below ~0.8 essentially linear (so the room's existing brightness tuning
            still holds) and only rolls off the highlights that used to hard-clip into flat white patches. */}
        <ToneMapping mode={ToneMappingMode.NEUTRAL} />
        {/* Was offset 0.22 / darkness 0.55 — strong enough to read as a filter rather than a lens. With the
            narrower camera (cameraFov.ts) a light touch is all that's left to do. */}
        <Vignette eskil={false} offset={0.3} darkness={0.3} />
        {/* Faint animated film grain, after tone mapping (works on display-referred values). A clean CG frame
            has dead-flat colour areas and can band on smooth gradients; real camera footage always carries
            some grain. OVERLAY rather than the default SCREEN: noise averages 0.5, and overlay(c, 0.5) = c, so
            it adds texture without lifting the exposure (SCREEN only ever brightens), and its amplitude
            scales with the underlying value in the darks, like premultiply would. Not a convolution, so it
            merges into the same EffectPass as ToneMapping/Vignette — no extra pass, a few ALU per pixel. */}
        <Noise blendFunction={BlendFunction.OVERLAY} opacity={0.05} />
        {/* Single-pass FXAA on high-density (phone/retina) screens, SMAA elsewhere — see antialiasMode. */}
        {antialias === "smaa" ? <SMAA /> : <SeparateFXAA />}
      </EffectComposer>
    </Canvas>
  );
}
