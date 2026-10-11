import { Suspense } from "react";
import Scene from "../3d/Scene";
import type { ArtworkIconPosition } from "../3d/ArtworkIconProjector";
import type { Exhibition } from "../3d/exhibitions";
import GalleryInstructionsOverlay from "./GalleryInstructionsOverlay";
import LoadingScreen from "./LoadingScreen";

interface GallerySceneCanvasProps {
  exhibition: Exhibition;
  overlayHidden: boolean;
  onLockChange: (locked: boolean) => void;
  onIconPositionsChange: (positions: ArtworkIconPosition[]) => void;
  onCanvasReady?: (canvas: HTMLCanvasElement) => void;
}

// The `#gallery-canvas-wrapper` + Suspense + <Scene> + instructions-card
// combo — identical across every full-bleed 3D scene screen (App.tsx's
// gallery route, both preview pages). `overlayHidden` lets each caller
// decide when the "click to start" card should disappear beyond just
// `locked` (App.tsx also hides it while an artwork detail card is open).
export default function GallerySceneCanvas({
  exhibition,
  overlayHidden,
  onLockChange,
  onIconPositionsChange,
  onCanvasReady,
}: GallerySceneCanvasProps) {
  return (
    // id targeted by Player.tsx's PointerLockControls `selector` — scopes
    // the "click re-engages pointer lock" behavior to clicks that land on
    // the 3D canvas itself, so clicking UI on top (detail card, lightbox,
    // HUD buttons) can't silently re-lock the camera behind it.
    <div id="gallery-canvas-wrapper" className="gallery-canvas-wrapper">
      <Suspense fallback={<LoadingScreen />}>
        <Scene
          key={exhibition.id}
          exhibition={exhibition}
          onLockChange={onLockChange}
          onIconPositionsChange={onIconPositionsChange}
          onCanvasReady={onCanvasReady}
        />
      </Suspense>

      {/* Lives inside the wrapper (not as a sibling) so a click here still
          counts toward PointerLockControls' scoped `selector` re-lock
          listener — this is the "click to start/resume" prompt. */}
      <GalleryInstructionsOverlay title={exhibition.name} hidden={overlayHidden} />
    </div>
  );
}
