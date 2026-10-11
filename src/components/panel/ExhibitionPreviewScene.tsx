import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ArtworkIconPosition } from '../3d/ArtworkIconProjector';
import type { Exhibition } from '../3d/exhibitions';
import GallerySceneCanvas from '../common/GallerySceneCanvas';
import FullscreenToggleButton from '../common/FullscreenToggleButton';
import LoadingScreen from '../common/LoadingScreen';

interface ExhibitionPreviewSceneProps {
  exhibition: Exhibition | null;
  showLoadingScreen: boolean;
  badgeKey: string;
  onBack: () => void;
}

// Shared render for /dashboard/organization/exhibitions/preview/:exhibitionId
// and /dashboard/organization/exhibition-templates/preview/:templateId —
// those two pages differ only in which backend resource they fetch/adapt
// (useOwnExhibition+adaptApiExhibition vs
// useOwnExhibitionTemplate+adaptExhibitionTemplate) and in their badge text
// and back-navigation target. Everything else (the 3D canvas, the
// instructions overlay, the HUD) is this one component, so each page
// component is now just data-fetching glue.
export default function ExhibitionPreviewScene({
  exhibition,
  showLoadingScreen,
  badgeKey,
  onBack,
}: ExhibitionPreviewSceneProps) {
  const { t } = useTranslation();
  const [locked, setLocked] = useState(false);
  const [, setIconPositions] = useState<ArtworkIconPosition[]>([]);

  if (showLoadingScreen) {
    return <LoadingScreen />;
  }

  if (!exhibition) {
    return (
      <div className="app-root flex items-center justify-center">
        <div className="instructions-card">
          <p className="instructions-title">{t('exhibitionPreviewUnavailable')}</p>
          <button className="hud-button mt-3" onClick={onBack}>
            {t('exhibitionPreviewBack')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="app-root">
      <GallerySceneCanvas
        exhibition={exhibition}
        overlayHidden={locked}
        onLockChange={setLocked}
        onIconPositionsChange={setIconPositions}
      />

      <div className="fixed right-3 top-3 z-40 rounded-md bg-black/55 px-3 py-1.5 text-sm font-medium text-white backdrop-blur">
        {t(badgeKey)}
      </div>

      <div className="hud-controls">
        <button className="hud-button" onClick={onBack}>
          {t('exhibitionPreviewBack')}
        </button>
        <FullscreenToggleButton />
      </div>
    </div>
  );
}
