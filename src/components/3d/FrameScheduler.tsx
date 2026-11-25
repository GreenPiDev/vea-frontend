import { useEffect, useRef } from "react";
import * as THREE from "three";
import { addEffect, useFrame, useThree } from "@react-three/fiber";
import { daylightRevision } from "./daylightBake";
import { takeOutlineActivity } from "./artworkOutline";

// On-demand rendering (Canvas frameloop="demand", 2026-11-25). A gallery visit is mostly standing still and
// looking: with the default "always" loop the GPU redrew the whole lit room + post-processing 60–120 times a
// second even then — what made laptops (fanless MacBook Air) and phones hot. Now a frame is drawn only when
// something on screen can change:
//   - the camera moved this frame (walking, click-walks, drag-look inertia, sitting down, teleports, zoom),
//     plus a short tail after it stops so the 10 Hz trackers (ArtworkIconProjector, SeatProximityTracker,
//     WalkArtworkPicker) catch the final position;
//   - input on the canvas / keyboard / pointer-locked mouse (the hover ring and highlight follow the pointer);
//   - the hover highlight is fading (every frame) or only breathing (BREATH_FPS — a 2.8 s, 12 % pulse);
//   - the daylight inputs changed (DaylightBaker re-bakes in its useFrame).
// React commits that touch three objects invalidate by themselves (R3F), so loading needs nothing extra.
// Code that moves the camera from outside a frame (ArtworkGoTo) calls invalidate() itself.
//
// Whatever must keep animating calls invalidate() *inside* a frame: R3F drops an invalidate() made after the
// frame's render pass (the loop has already decided to stop) — hence useFrame here, not addAfterEffect.

/** Keep drawing this long after the last movement/input. */
const TAIL_MS = 250;
/** Frame rate of the highlight's breath when nothing else moves. */
const BREATH_FPS = 15;
const EPSILON = 1e-6;

/**
 * Whether the current frame continues an unbroken run of frames (the previous one asked for it). False for
 * the first frame after the loop was idle — QualityMonitor skips those, their gap isn't render time.
 */
const loopState = { continuous: false };

/** Drives the on-demand loop — mount once inside the Canvas. */
export default function FrameScheduler() {
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);
  const clock = useThree((s) => s.clock);
  const invalidate = useThree((s) => s.invalidate);

  const activeUntil = useRef(0);
  const continuing = useRef(false);
  const breathTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const last = useRef({
    position: new THREE.Vector3(),
    quaternion: new THREE.Quaternion(),
    fov: 0,
    revision: -1,
  });

  // Coming back from idle: drop the idle gap from the clock, or the first frame's delta would be seconds long
  // and every eased motion (sitting down, look-at turns, the highlight fade) would jump to its end.
  useEffect(
    () =>
      addEffect(() => {
        loopState.continuous = continuing.current;
        if (!continuing.current) clock.getDelta();
      }),
    [clock]
  );

  useEffect(() => {
    const canvas = gl.domElement;
    const wake = () => {
      activeUntil.current = performance.now() + TAIL_MS;
      invalidate();
    };
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      // Typing in a form (an offer on the detail card) doesn't touch the scene.
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      wake();
    };
    const onLockedMove = () => {
      if (document.pointerLockElement === canvas) wake();
    };
    const canvasEvents = ["pointerdown", "pointermove", "pointerup", "pointerleave", "wheel"] as const;
    for (const type of canvasEvents) canvas.addEventListener(type, wake, { passive: true });
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    document.addEventListener("mousemove", onLockedMove);
    document.addEventListener("pointerlockchange", wake);
    wake();
    return () => {
      for (const type of canvasEvents) canvas.removeEventListener(type, wake);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
      document.removeEventListener("mousemove", onLockedMove);
      document.removeEventListener("pointerlockchange", wake);
      if (breathTimer.current) clearTimeout(breathTimer.current);
    };
  }, [gl, invalidate]);

  // Priority 2: after everything that moves the camera (priority 0) and after EffectComposer's render (1).
  useFrame(() => {
    if (breathTimer.current) {
      clearTimeout(breathTimer.current);
      breathTimer.current = null;
    }
    const now = performance.now();
    const cam = camera as THREE.PerspectiveCamera;
    const prev = last.current;
    const revision = daylightRevision();
    const changed =
      prev.position.distanceToSquared(cam.position) > EPSILON * EPSILON ||
      1 - Math.abs(prev.quaternion.dot(cam.quaternion)) > EPSILON ||
      Math.abs(prev.fov - (cam.fov ?? 0)) > EPSILON ||
      prev.revision !== revision;
    if (changed) {
      prev.position.copy(cam.position);
      prev.quaternion.copy(cam.quaternion);
      prev.fov = cam.fov ?? 0;
      prev.revision = revision;
      activeUntil.current = now + TAIL_MS;
    }

    const outline = takeOutlineActivity();
    continuing.current = now < activeUntil.current || outline === "fading";
    if (continuing.current) {
      invalidate();
    } else if (outline === "breathing") {
      breathTimer.current = setTimeout(() => {
        breathTimer.current = null;
        invalidate();
      }, 1000 / BREATH_FPS);
    }
  }, 2);

  return null;
}

/** Same knobs as drei's PerformanceMonitor (which Scene.tsx used before on-demand rendering). */
interface QualityMonitorProps {
  /** Starting quality (0..1). */
  factor: number;
  step: number;
  /** FPS samples per decision. */
  iterations: number;
  onChange: (factor: number) => void;
}

/** Length of one FPS sample, in continuous render time. */
const SAMPLE_MS = 250;
/** Share of a decision's samples that must agree (drei's default threshold). */
const THRESHOLD = 0.75;

/**
 * FPS-driven quality, like drei's PerformanceMonitor — but drei times frames by wall clock, so under on-demand
 * rendering every idle pause would read as a terrible frame rate and drag the quality down. This one only
 * counts frames that continue an unbroken run (loopState.continuous), i.e. real render time.
 */
export function QualityMonitor({ factor, step, iterations, onChange }: QualityMonitorProps) {
  const st = useRef({ factor, frames: 0, elapsed: 0, lastTime: 0, refreshRate: 0, samples: [] as number[] });
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useFrame(() => {
    const s = st.current;
    const now = performance.now();
    const gap = now - s.lastTime;
    s.lastTime = now;
    if (!loopState.continuous || gap <= 0) return;
    s.frames++;
    s.elapsed += gap;
    if (s.elapsed < SAMPLE_MS) return;
    const fps = (s.frames / s.elapsed) * 1000;
    s.frames = 0;
    s.elapsed = 0;
    s.refreshRate = Math.max(s.refreshRate, fps);
    s.samples.push(fps);
    if (s.samples.length < iterations) return;
    const [lower, upper] = s.refreshRate > 100 ? [60, 100] : [40, 60];
    const high = s.samples.filter((v) => v >= upper).length;
    const low = s.samples.filter((v) => v < lower).length;
    s.samples = [];
    let next = s.factor;
    if (high > iterations * THRESHOLD) next = Math.min(1, next + step);
    if (low > iterations * THRESHOLD) next = Math.max(0, next - step);
    if (next !== s.factor) {
      s.factor = next;
      onChangeRef.current(next);
    }
  });

  return null;
}
