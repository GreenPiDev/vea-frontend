import { Trans, useTranslation } from "react-i18next";
import type { NavigationMode } from "../../lib/navigationMode";

interface GalleryInstructionsOverlayProps {
  title: string;
  hidden: boolean;
  navigationMode: NavigationMode;
  touchDevice: boolean;
  /** Click mode: the card itself takes the first tap (there's no pointer lock to start). */
  onStart?: () => void;
}

// The "how to move / click to start" card shown over the canvas when the
// visitor enters — identical across every full-bleed 3D scene screen
// (App.tsx's gallery route, both preview pages), only the title (the
// exhibition's name) differs per caller. Text follows the active navigation
// mode; on desktop it also points at the bottom-left mode switch.
export default function GalleryInstructionsOverlay({
  title,
  hidden,
  navigationMode,
  touchDevice,
  onStart,
}: GalleryInstructionsOverlayProps) {
  const { t } = useTranslation();

  const textKey = touchDevice
    ? "galleryInstructionsTouchText"
    : navigationMode === "click"
      ? "galleryInstructionsClickText"
      : "galleryInstructionsText";
  const hintKey = touchDevice
    ? "galleryInstructionsTouchHint"
    : navigationMode === "click"
      ? "galleryInstructionsClickHint"
      : "galleryInstructionsHint";

  const capturesTap = Boolean(onStart) && !hidden;

  return (
    <div
      className={`instructions-overlay ${hidden ? "hidden" : ""}`}
      style={capturesTap ? { pointerEvents: "auto", cursor: "pointer" } : undefined}
      onPointerDown={
        capturesTap
          ? (e) => {
              e.stopPropagation();
              onStart?.();
            }
          : undefined
      }
    >
      <div className="instructions-card">
        <p className="instructions-title">{title}</p>
        <p className="instructions-text">
          <Trans i18nKey={textKey} components={{ strong: <strong /> }} />
        </p>
        {!touchDevice && <p className="instructions-hint">{t("galleryInstructionsModeHint")}</p>}
        <p className="instructions-hint">{t(hintKey)}</p>
      </div>
    </div>
  );
}
