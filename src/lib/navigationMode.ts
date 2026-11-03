// How the visitor moves through a 3D exhibition:
// - "click": click-to-go (click the floor or a painting's floor marker, drag to look) — works with a mouse
//   and with touch, so it's the only mode offered on touch-first devices.
// - "walk": the original pointer-lock mouse-look + WASD.
// The visitor's choice is remembered per browser (localStorage — a per-device convenience, not account data).

export type NavigationMode = "click" | "walk";

const STORAGE_KEY = "vea.navigationMode";

/** Phones/tablets: the primary pointer is a finger, so pointer lock + WASD can't work. */
export function isTouchPrimaryDevice(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(pointer: coarse)").matches;
}

export function loadNavigationMode(): NavigationMode {
  if (isTouchPrimaryDevice()) return "click";
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "click" || stored === "walk") return stored;
  } catch {
    // Storage blocked (private mode etc.) — fall through to the default.
  }
  return "click";
}

export function saveNavigationMode(mode: NavigationMode): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // Not persisting is fine; the choice still applies for this session.
  }
}
