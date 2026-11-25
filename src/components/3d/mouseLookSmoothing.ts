/**
 * Smoothed pointer-lock mouse-look (walk mode). drei's PointerLockControls wrote every mousemove straight into
 * the camera — mouse events arrive unevenly against frames (and Chrome sometimes sends a large spike), so the
 * view turned in hard steps. Instead mouse motion is accumulated as a *pending* turn and each frame applies a
 * frame-rate-independent share of it (exponential decay with time constant LOOK_SMOOTHING_TIME).
 *
 * Only the remaining delta is applied, never an absolute target, so other camera writers (click-to-go turns,
 * thumbnail teleports, sitting down) compose with it instead of being fought.
 */

/** Radians per pixel of mouse movement — the same as three's PointerLockControls (pointerSpeed 1). */
export const MOUSE_LOOK_SENSITIVITY = 0.002;

/**
 * Time constant (s) of the smoothing: ~63 % of a flick is applied after this long, ~95 % after 3×. Raise for a
 * softer, more trailing look; lower for a snappier one.
 */
export const LOOK_SMOOTHING_TIME = 0.07;

/** Pitch limit (rad) — just short of straight up/down, like PointerLockControls' default polar range. */
export const MAX_LOOK_PITCH = Math.PI / 2 - 1e-3;

/** Below this (rad) the rest of a pending turn is applied at once, so the loop can go idle. */
const SNAP_EPSILON = 1e-5;

export interface PendingLook {
  yaw: number;
  pitch: number;
}

/** Adds one mousemove's worth of turn (movementX/Y in CSS px) to the pending look. */
export function addMouseMovement(pending: PendingLook, movementX: number, movementY: number): void {
  pending.yaw -= movementX * MOUSE_LOOK_SENSITIVITY;
  pending.pitch -= movementY * MOUSE_LOOK_SENSITIVITY;
}

/**
 * Takes this frame's share of the pending look out of `pending` and returns it. `delta` is the frame time (s).
 */
export function consumeLook(pending: PendingLook, delta: number, smoothingTime = LOOK_SMOOTHING_TIME): PendingLook {
  const k = smoothingTime <= 0 ? 1 : 1 - Math.exp(-Math.max(0, delta) / smoothingTime);
  const take = (v: number) => (Math.abs(v) < SNAP_EPSILON ? v : v * k);
  const out = { yaw: take(pending.yaw), pitch: take(pending.pitch) };
  pending.yaw -= out.yaw;
  pending.pitch -= out.pitch;
  return out;
}

/** Applies a pitch step and clamps; drops the rest of a pending pitch that runs into the limit. */
export function applyPitch(current: number, step: number, pending: PendingLook): number {
  const next = current + step;
  if (next > MAX_LOOK_PITCH || next < -MAX_LOOK_PITCH) {
    pending.pitch = 0;
    return Math.max(-MAX_LOOK_PITCH, Math.min(MAX_LOOK_PITCH, next));
  }
  return next;
}
