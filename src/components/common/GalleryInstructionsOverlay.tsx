import { Trans, useTranslation } from "react-i18next";

interface GalleryInstructionsOverlayProps {
  title: string;
  hidden: boolean;
}

// The "click to start · WASD to move · ESC to exit" card shown over the
// canvas before the player has clicked in — identical across every
// full-bleed 3D scene screen (App.tsx's gallery route, both preview pages),
// only the title (the exhibition's name) differs per caller.
export default function GalleryInstructionsOverlay({ title, hidden }: GalleryInstructionsOverlayProps) {
  const { t } = useTranslation();

  return (
    <div className={`instructions-overlay ${hidden ? "hidden" : ""}`}>
      <div className="instructions-card">
        <p className="instructions-title">{title}</p>
        <p className="instructions-text">
          <Trans i18nKey="galleryInstructionsText" components={{ strong: <strong /> }} />
        </p>
        <p className="instructions-hint">{t("galleryInstructionsHint")}</p>
      </div>
    </div>
  );
}
