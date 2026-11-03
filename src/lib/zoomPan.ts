// Pure pinch-zoom / pan math for ZoomableImage.tsx. Coordinates are in the element's own (local, CSS
// layout) pixels, relative to its centre; the transform applied is `translate(x, y) scale(scale)` with
// transform-origin at the centre.

export interface ZoomPanState {
  scale: number;
  x: number;
  y: number;
}

export const ZOOM_MIN = 1;
export const ZOOM_MAX = 5;
/** Double-tap zoom level. */
export const ZOOM_DOUBLE_TAP = 2.5;

export const IDENTITY: ZoomPanState = { scale: 1, x: 0, y: 0 };

export function clampScale(scale: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, scale));
}

/** Keep the scaled content covering the frame: at most (scale - 1) × half the size of travel each way. */
export function clampPan(state: ZoomPanState, width: number, height: number): ZoomPanState {
  const maxX = ((state.scale - 1) * width) / 2;
  const maxY = ((state.scale - 1) * height) / 2;
  return {
    scale: state.scale,
    x: Math.min(maxX, Math.max(-maxX, state.x)),
    y: Math.min(maxY, Math.max(-maxY, state.y)),
  };
}

/** Rescale to `nextScale` keeping the content point under `focus` (centre-relative) fixed on screen. */
export function zoomAbout(state: ZoomPanState, nextScale: number, focusX: number, focusY: number): ZoomPanState {
  const scale = clampScale(nextScale);
  const ratio = scale / state.scale;
  return {
    scale,
    x: focusX - (focusX - state.x) * ratio,
    y: focusY - (focusY - state.y) * ratio,
  };
}

/**
 * Screen-space (clientX/Y) delta → the element's local axes. The exhibition view rotates its root 90°
 * clockwise on a phone held upright (useForcedLandscape.ts, `.app-root.force-landscape`); there a finger
 * moving down the screen moves along the content's +x.
 */
export function screenToLocalDelta(dx: number, dy: number, rotated: boolean): { x: number; y: number } {
  return rotated ? { x: dy, y: -dx } : { x: dx, y: dy };
}
