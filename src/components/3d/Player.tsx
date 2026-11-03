import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { PointerLockControls } from "@react-three/drei";
import * as THREE from "three";
import { EYE_HEIGHT } from "./galleryLayout";
import { useExhibition } from "./ExhibitionContext";
import type { SeatSpot } from "./seating";
import { angleDelta, collides, stepToward, type NavigationRequest } from "./clickNavigationGeometry";
import type { NavigationMode } from "../../lib/navigationMode";

const WALK_SPEED = 3.6;
/** Click-to-go walking pace (m/s) — eases down over the last metre so arrival doesn't stop dead. */
const CLICK_WALK_SPEED = 3.2;
/** Exponential turn rate (per second) when a painting marker swings the view toward the work. */
const LOOK_LERP_SPEED = 5;
// Fixed drop from standing eye height while seated — no per-asset offset
// (see seating.ts's design note), good enough for the chair/bench models
// this ships with.
const SEAT_EYE_HEIGHT = EYE_HEIGHT - 0.45;
// Exponential approach rate (per second) for the sit-down camera glide —
// frame-rate independent, converges within a few frames without needing to
// track elapsed time explicitly.
const SIT_LERP_SPEED = 6;
// On standing, the camera is still sitting exactly at the seat's x/z — which
// is inside the furniture's own AABB collider (every placed piece is a
// collider, see galleryLayout.ts's furnitureCollider()). Left there, every
// subsequent move attempt's destination is still inside that same box, so
// collides() rejects it in every direction — the visitor is trapped until a
// refresh resets their position. Nudging forward (the direction they were
// facing while seated, i.e. away from the chair) clears the box; shrinking
// distances are tried in case a wall/other collider sits close behind.
const STAND_CLEARANCE_STEPS = [0.9, 0.6, 0.3];

interface PlayerProps {
  onLockChange?: (locked: boolean) => void;
  /** Non-null while the visitor is sitting — see seating.ts/App.tsx's Enter state machine. WASD movement is suspended and the camera glides to this spot; mouse-look (PointerLockControls) stays fully active. */
  seatedSpot?: SeatSpot | null;
  /** "walk": pointer-lock mouse-look. "click": ClickNavigation.tsx drives look/targets instead. WASD works in both. */
  navigationMode: NavigationMode;
  /** Click-to-go target/look request, written by ClickNavigation.tsx and consumed here every frame. */
  navigation: NavigationRequest;
}

/** First-person controller: WASD move + wall collision, plus either pointer-lock look or click-to-go. */
export default function Player({ onLockChange, seatedSpot, navigationMode, navigation }: PlayerProps) {
  const { camera } = useThree();
  const { layout } = useExhibition();
  const keys = useRef({ forward: false, back: false, left: false, right: false });
  // Tracks which seat we're currently gliding toward, so the one-time yaw
  // snap only fires on the frame a new sit begins, not every frame while
  // already seated.
  const seatedIdRef = useRef<string | null>(null);
  const seatTargetRef = useRef(new THREE.Vector3());
  // Last known seat facing, kept up to date every frame while seated so
  // it's available on the frame standing-up is detected (seatedSpot is
  // already null by then).
  const seatedRotationRef = useRef(0);

  useEffect(() => {
    camera.position.set(...layout.playerStart);
    // PointerLockControls reads the camera's live quaternion on every mouse
    // move rather than caching one at construction time, so setting the
    // initial yaw here is enough to seed the starting look direction.
    // YXZ (yaw, then pitch) — the order PointerLockControls also decomposes into, so both look modes and
    // the click-to-go turn read/write the same yaw/pitch angles.
    camera.rotation.order = "YXZ";
    camera.rotation.set(0, layout.playerStartYaw, 0);
  }, [camera, layout.playerStart, layout.playerStartYaw]);

  // Leaving walk mode unmounts PointerLockControls, which doesn't release an active lock by itself.
  useEffect(() => {
    if (navigationMode !== "walk" && document.pointerLockElement) document.exitPointerLock();
  }, [navigationMode]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => setKey(e.code, true);
    const up = (e: KeyboardEvent) => setKey(e.code, false);
    const setKey = (code: string, value: boolean) => {
      switch (code) {
        case "KeyW":
        case "ArrowUp":
          keys.current.forward = value;
          break;
        case "KeyS":
        case "ArrowDown":
          keys.current.back = value;
          break;
        case "KeyA":
        case "ArrowLeft":
          keys.current.left = value;
          break;
        case "KeyD":
        case "ArrowRight":
          keys.current.right = value;
          break;
      }
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  const forwardDir = useRef(new THREE.Vector3());
  const rightDir = useRef(new THREE.Vector3());

  useFrame((_, delta) => {
    if (seatedSpot) {
      // Sitting overrides any walk in progress.
      navigation.target = null;
      navigation.look = null;
      // seatedSpot.rotationY is the placement's own facing (the direction
      // the furniture model's front — where its back/backrest is — points).
      // A visitor sitting IN it faces the opposite way, out into the room,
      // hence the +PI flip on the one-time snap below.
      const facingOutYaw = seatedSpot.rotationY + Math.PI;
      if (seatedIdRef.current !== seatedSpot.id) {
        seatedIdRef.current = seatedSpot.id;
        camera.rotation.set(0, facingOutYaw, 0);
      }
      seatTargetRef.current.set(seatedSpot.x, SEAT_EYE_HEIGHT, seatedSpot.z);
      camera.position.lerp(seatTargetRef.current, Math.min(1, SIT_LERP_SPEED * delta));
      seatedRotationRef.current = facingOutYaw;
      return;
    }
    if (seatedIdRef.current !== null) {
      // Just stood up — the early-return below (no key pressed) would
      // otherwise leave the camera pinned at seated eye-height until the
      // visitor's next step, since the normal `pos.y = EYE_HEIGHT` reset at
      // the bottom of this function never runs while standing still.
      seatedIdRef.current = null;
      camera.position.y = EYE_HEIGHT;

      // Step out of the seat's own collider (see STAND_CLEARANCE_STEPS'
      // comment above) before WASD control resumes below.
      const forwardX = -Math.sin(seatedRotationRef.current);
      const forwardZ = -Math.cos(seatedRotationRef.current);
      for (const clearance of STAND_CLEARANCE_STEPS) {
        const nx = camera.position.x + forwardX * clearance;
        const nz = camera.position.z + forwardZ * clearance;
        if (!collides(nx, nz, layout.colliders)) {
          camera.position.x = nx;
          camera.position.z = nz;
          break;
        }
      }
    }

    const { forward, back, left, right } = keys.current;
    const anyKey = forward || back || left || right;
    if (anyKey) {
      // The keyboard always wins over a click-to-go walk in progress.
      navigation.target = null;
      navigation.look = null;
    }

    if (navigation.look) {
      const k = Math.min(1, LOOK_LERP_SPEED * delta);
      const dYaw = angleDelta(camera.rotation.y, navigation.look.yaw);
      const dPitch = navigation.look.pitch - camera.rotation.x;
      if (Math.abs(dYaw) < 1e-3 && Math.abs(dPitch) < 1e-3) {
        camera.rotation.set(navigation.look.pitch, navigation.look.yaw, 0);
        navigation.look = null;
      } else {
        camera.rotation.set(camera.rotation.x + dPitch * k, camera.rotation.y + dYaw * k, 0);
      }
    }

    if (navigation.target && !anyKey) {
      const pos = camera.position;
      const remaining = Math.hypot(navigation.target.x - pos.x, navigation.target.z - pos.z);
      const speed = CLICK_WALK_SPEED * Math.min(1, 0.25 + remaining);
      const step = stepToward(pos, navigation.target, speed * Math.min(delta, 0.05), layout.colliders);
      pos.x = step.x;
      pos.z = step.z;
      pos.y = EYE_HEIGHT;
      if (step.arrived || step.blocked) navigation.target = null;
      return;
    }

    if (!anyKey) return;

    camera.getWorldDirection(forwardDir.current);
    forwardDir.current.y = 0;
    forwardDir.current.normalize();
    rightDir.current.set(-forwardDir.current.z, 0, forwardDir.current.x);

    const moveStep = WALK_SPEED * Math.min(delta, 0.05);
    let dx = 0;
    let dz = 0;
    if (forward) {
      dx += forwardDir.current.x * moveStep;
      dz += forwardDir.current.z * moveStep;
    }
    if (back) {
      dx -= forwardDir.current.x * moveStep;
      dz -= forwardDir.current.z * moveStep;
    }
    if (right) {
      dx += rightDir.current.x * moveStep;
      dz += rightDir.current.z * moveStep;
    }
    if (left) {
      dx -= rightDir.current.x * moveStep;
      dz -= rightDir.current.z * moveStep;
    }

    const pos = camera.position;

    if (dx !== 0 && !collides(pos.x + dx, pos.z, layout.colliders)) {
      pos.x += dx;
    }
    if (dz !== 0 && !collides(pos.x, pos.z + dz, layout.colliders)) {
      pos.z += dz;
    }
    pos.y = EYE_HEIGHT;
  });

  if (navigationMode !== "walk") return null;

  return (
    <PointerLockControls
      // Scoped to the canvas wrapper (see App.tsx) — without this, drei
      // defaults to listening for clicks on the whole `document`, so
      // clicking any UI on top of the scene (the artwork detail card, its
      // image lightbox, HUD buttons) would silently re-engage pointer lock
      // behind it, hijacking the mouse into camera look while that UI is
      // still open.
      selector="#gallery-canvas-wrapper"
      onLock={() => onLockChange?.(true)}
      onUnlock={() => onLockChange?.(false)}
    />
  );
}
