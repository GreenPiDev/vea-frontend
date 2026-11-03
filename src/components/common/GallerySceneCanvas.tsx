import { Suspense, useEffect, useState } from "react";
import Scene from "../3d/Scene";
import type { ArtworkIconPosition } from "../3d/ArtworkIconProjector";
import type { Exhibition } from "../3d/exhibitions";
import type { SeatSpot } from "../3d/seating";
import {
  isTouchPrimaryDevice,
  loadNavigationMode,
  saveNavigationMode,
  type NavigationMode,
} from "../../lib/navigationMode";
import { enterMobileImmersive, exitMobileImmersive } from "../../lib/mobileImmersive";
import GalleryInstructionsOverlay from "./GalleryInstructionsOverlay";
import NavigationModeSwitch from "./NavigationModeSwitch";
import LoadingScreen from "./LoadingScreen";

// Deferred so a StrictMode/dev remount (cleanup immediately followed by a fresh mount) cancels it instead
// of dropping the fullscreen the exhibition card tap just started.
let pendingImmersiveExit: ReturnType<typeof setTimeout> | undefined;

interface GallerySceneCanvasProps {
  exhibition: Exhibition;
  overlayHidden: boolean;
  onLockChange: (locked: boolean) => void;
  onIconPositionsChange: (positions: ArtworkIconPosition[]) => void;
  onCanvasReady?: (canvas: HTMLCanvasElement) => void;
  seatedSpot?: SeatSpot | null;
  onNearestSeatChange?: (seat: SeatSpot | null) => void;
  /** Click/tap on a painting (click-to-go mode). Omitted → paintings aren't clickable/highlighted. */
  onArtworkClick?: (artworkId: string) => void;
}

// The `#gallery-canvas-wrapper` + Suspense + <Scene> + instructions-card
// combo — identical across every full-bleed 3D scene screen (App.tsx's
// gallery route, both preview pages). `overlayHidden` lets each caller
// decide when the "click to start" card should disappear beyond just
// `locked` (App.tsx also hides it while an artwork detail card is open).
// Also owns the navigation mode (click-to-go vs. WASD walk, bottom-left
// switch) and the mobile fullscreen/landscape lifecycle, so every 3D screen
// gets both without per-caller wiring.
export default function GallerySceneCanvas({
  exhibition,
  overlayHidden,
  onLockChange,
  onIconPositionsChange,
  onCanvasReady,
  seatedSpot,
  onNearestSeatChange,
  onArtworkClick,
}: GallerySceneCanvasProps) {
  const [touchDevice] = useState(isTouchPrimaryDevice);
  const [navigationMode, setNavigationMode] = useState<NavigationMode>(loadNavigationMode);
  // Click mode has no pointer lock to signal "the visitor is in" — the first tap on the instructions
  // card is that signal instead (and the user gesture mobile fullscreen needs).
  const [clickModeStarted, setClickModeStarted] = useState(false);

  // Leaving the 3D scene (back button, browser back, route change) hands the phone back in portrait.
  useEffect(() => {
    clearTimeout(pendingImmersiveExit);
    return () => {
      pendingImmersiveExit = setTimeout(exitMobileImmersive, 0);
    };
  }, []);

  function changeMode(mode: NavigationMode) {
    setNavigationMode(mode);
    saveNavigationMode(mode);
    // Switching into click mode is itself a deliberate interaction — don't show the start card again.
    if (mode === "click") setClickModeStarted(true);
  }

  function startClickMode() {
    setClickModeStarted(true);
    void enterMobileImmersive();
  }

  const instructionsHidden = overlayHidden || (navigationMode === "click" && clickModeStarted);

  return (
    <>
      {/* id targeted by Player.tsx's PointerLockControls `selector` — scopes
          the "click re-engages pointer lock" behavior to clicks that land on
          the 3D canvas itself, so clicking UI on top (detail card, lightbox,
          HUD buttons) can't silently re-lock the camera behind it. */}
      <div id="gallery-canvas-wrapper" className="gallery-canvas-wrapper">
        <Suspense fallback={<LoadingScreen />}>
          <Scene
            key={exhibition.id}
            exhibition={exhibition}
            onLockChange={onLockChange}
            onIconPositionsChange={onIconPositionsChange}
            onCanvasReady={onCanvasReady}
            seatedSpot={seatedSpot}
            onNearestSeatChange={onNearestSeatChange}
            navigationMode={navigationMode}
            onArtworkClick={onArtworkClick}
          />
        </Suspense>

        {/* Lives inside the wrapper (not as a sibling) so a click here still
            counts toward PointerLockControls' scoped `selector` re-lock
            listener — this is the "click to start/resume" prompt. In click
            mode it catches the first tap itself instead (see above). */}
        <GalleryInstructionsOverlay
          title={exhibition.name}
          hidden={instructionsHidden}
          navigationMode={navigationMode}
          touchDevice={touchDevice}
          onStart={navigationMode === "click" ? startClickMode : undefined}
        />
      </div>

      {/* Outside the wrapper, so using the switch never triggers a pointer-lock re-engage. Touch devices
          only get click mode (no keyboard/pointer lock), so there's nothing to switch there. */}
      {!touchDevice && <NavigationModeSwitch mode={navigationMode} onChange={changeMode} />}
    </>
  );
}
