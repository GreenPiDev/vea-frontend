import { useEffect, useState } from "react";
import { isTouchPrimaryDevice } from "./navigationMode";

const PORTRAIT_QUERY = "(orientation: portrait)";

function shouldForce(): boolean {
  return isTouchPrimaryDevice() && (window.matchMedia?.(PORTRAIT_QUERY).matches ?? false);
}

/**
 * True while a phone/tablet shows the 3D exhibition in portrait. The scene root then rotates itself 90°
 * with CSS (`.app-root.force-landscape`, App.css), so the exhibition is always laid out landscape — the
 * visitor just turns the phone. This is the path that works everywhere: Android also gets a real
 * orientation lock (mobileImmersive.ts), after which the viewport is landscape and this turns false, but
 * iPhone Safari has no orientation/fullscreen API for pages at all.
 *
 * Everything inside the rotated root (canvas, HUD, the artwork card's fixed overlay) rotates along, since
 * a transformed ancestor becomes the containing block for its `position: fixed` children. Pointer input
 * stays correct because the canvas measures itself with offsetWidth/Height (Scene.tsx's `resize`) and
 * ClickNavigation reads `offsetX/Y`, which browsers map through CSS transforms.
 */
export function useForcedLandscape(): boolean {
  const [forced, setForced] = useState(shouldForce);

  useEffect(() => {
    const query = window.matchMedia?.(PORTRAIT_QUERY);
    if (!query) return;
    const onChange = () => setForced(shouldForce());
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  return forced;
}
