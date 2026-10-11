import { useEffect, useState } from "react";

// Shared by every full-bleed 3D scene screen (App.tsx's gallery route,
// ExhibitionPreviewPage.tsx, ExhibitionTemplatePreviewPage.tsx) — they all
// need the same "track document.fullscreenElement + expose a toggle"
// behavior for their HUD's fullscreen button.
export function useFullscreenToggle() {
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const onChange = () => setIsFullscreen(document.fullscreenElement != null);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  function toggleFullscreen() {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      document.documentElement.requestFullscreen();
    }
  }

  return { isFullscreen, toggleFullscreen };
}
