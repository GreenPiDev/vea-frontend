import { useTranslation } from "react-i18next";
import { useFullscreenToggle } from "../../lib/useFullscreenToggle";

// The "⤢ Tam Ekran" / "⤡ Tam Ekrandan Çık" HUD button — identical markup
// and behavior across every full-bleed 3D scene screen, so it's a shared
// component rather than copy-pasted per screen (see useFullscreenToggle).
export default function FullscreenToggleButton() {
  const { t } = useTranslation();
  const { isFullscreen, toggleFullscreen } = useFullscreenToggle();

  return (
    <button className="hud-button" onClick={toggleFullscreen}>
      {isFullscreen ? t("fullscreenExit") : t("fullscreenEnter")}
    </button>
  );
}
