// Mobile "immersive" exhibition view: fullscreen + landscape lock on entry, both released on exit.
//
// Browser support is uneven, so every step is best-effort and silent on failure:
// - Fullscreen needs a user gesture — callers invoke enterMobileImmersive() from a tap/click handler.
// - Screen orientation lock only works while fullscreen (Android Chrome/Firefox). iPhone Safari has
//   neither API for pages; there useForcedLandscape.ts rotates the scene with CSS instead.
// Desktop is never touched: there the existing fullscreen button stays the visitor's own choice.

import { isTouchPrimaryDevice } from "./navigationMode";

type OrientationLockType = "landscape" | "portrait" | "any";
interface LockableOrientation {
  lock?: (orientation: OrientationLockType) => Promise<void>;
  unlock?: () => void;
}
interface WebkitFullscreenElement {
  webkitRequestFullscreen?: () => void;
}

function orientation(): LockableOrientation | undefined {
  return (screen as unknown as { orientation?: LockableOrientation }).orientation;
}

export async function enterMobileImmersive(): Promise<void> {
  if (!isTouchPrimaryDevice()) return;
  const root = document.documentElement as HTMLElement & WebkitFullscreenElement;
  try {
    if (!document.fullscreenElement) {
      if (root.requestFullscreen) await root.requestFullscreen({ navigationUI: "hide" });
      else root.webkitRequestFullscreen?.();
    }
  } catch {
    return;
  }
  try {
    await orientation()?.lock?.("landscape");
  } catch {
    // Unsupported here — useForcedLandscape.ts rotates the scene with CSS instead.
  }
}

export function exitMobileImmersive(): void {
  if (!isTouchPrimaryDevice()) return;
  try {
    orientation()?.unlock?.();
  } catch {
    // ignore
  }
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
}
