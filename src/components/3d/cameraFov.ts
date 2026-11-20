// Camera field-of-view policy. Pure math, unit-tested (cameraFov.test.ts); CameraFov in Scene.tsx is the
// only thing that writes `camera.fov`.
//
// A fixed vertical FOV gives a different horizontal view on every screen shape: the old fixed 65° was
// ~98° horizontally on 16:9 — GoPro-like edge stretching that made the rooms read as a game. Instead the
// horizontal view is held near what a person actually takes in (~77°, i.e. 48° vertical on 16:9) and the
// vertical FOV is derived from the aspect ratio, clamped so very wide (phone landscape, ultrawide) screens
// don't get a letterbox-thin slice and narrow ones don't balloon back into a fisheye.

/** Horizontal field of view (degrees) the camera aims for. */
export const TARGET_HORIZONTAL_FOV = 77;
/** Vertical FOV bounds (degrees). The lower bound keeps a whole painting + label in view on 19.5:9 phones. */
export const MIN_VERTICAL_FOV = 44;
export const MAX_VERTICAL_FOV = 58;

/** Strongest magnification of the pinch / mouse-wheel zoom, relative to the normal view. */
export const MAX_ZOOM = 2.5;

const DEG = Math.PI / 180;

/** Vertical FOV (degrees) for a viewport of the given width / height. */
export function fovForAspect(aspect: number): number {
  if (!(aspect > 0)) return MAX_VERTICAL_FOV;
  const vertical = (2 * Math.atan(Math.tan((TARGET_HORIZONTAL_FOV * DEG) / 2) / aspect)) / DEG;
  return Math.min(MAX_VERTICAL_FOV, Math.max(MIN_VERTICAL_FOV, vertical));
}

/** Horizontal FOV (degrees) that a vertical FOV gives at the given aspect ratio. */
export function horizontalFov(verticalFov: number, aspect: number): number {
  return (2 * Math.atan(Math.tan((verticalFov * DEG) / 2) * aspect)) / DEG;
}

/** Zoom factor clamped to [1×, MAX_ZOOM×] — never wider than the normal view. */
export function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(1, zoom));
}

/** FOV (degrees) of `baseFov` magnified `zoom` times (binocular-style: tan of the half-angle shrinks). */
export function fovAtZoom(baseFov: number, zoom: number): number {
  return (2 * Math.atan(Math.tan((baseFov * DEG) / 2) / zoom)) / DEG;
}

/** Shared, mutable zoom state: ClickNavigation.tsx writes it, CameraFov (Scene.tsx) applies it. */
export interface CameraZoom {
  zoom: number;
}
