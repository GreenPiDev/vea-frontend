import type { ArtworkIconPosition } from "../components/3d/ArtworkIconProjector";

/**
 * Where the artworks' "i" icons sit on screen, written by ArtworkIconProjector (inside the Canvas, ~10 Hz while
 * the view moves) and read by ArtworkIconOverlay through useSyncExternalStore. Kept out of App's state on
 * purpose: as App state, every update re-rendered App and with it the whole Canvas tree (2026-11-25).
 */
export interface IconPositionStore {
  get: () => ArtworkIconPosition[];
  /** Stores and notifies only when something visibly changed (see samePositions). */
  set: (positions: ArtworkIconPosition[]) => void;
  subscribe: (listener: () => void) => () => void;
}

/** Sub-pixel moves and tiny distance changes don't count — they'd re-render the icons for nothing. */
const PIXEL_EPSILON = 0.5;
const DISTANCE_SQ_EPSILON = 1e-3;

export function samePositions(a: ArtworkIconPosition[], b: ArtworkIconPosition[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const p = a[i];
    const q = b[i];
    if (p.id !== q.id || p.visible !== q.visible) return false;
    if (Math.abs(p.distanceSq - q.distanceSq) > DISTANCE_SQ_EPSILON) return false;
    // Hidden icons don't move on screen visibly — only their visibility matters.
    if (p.visible && (Math.abs(p.x - q.x) > PIXEL_EPSILON || Math.abs(p.y - q.y) > PIXEL_EPSILON)) return false;
  }
  return true;
}

export function createIconPositionStore(): IconPositionStore {
  let current: ArtworkIconPosition[] = [];
  const listeners = new Set<() => void>();
  return {
    get: () => current,
    set: (positions) => {
      if (samePositions(current, positions)) return;
      current = positions;
      listeners.forEach((l) => l());
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}
