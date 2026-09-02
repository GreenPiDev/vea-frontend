import { Suspense, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Scene from '../3d/Scene';
import type { ArtworkIconPosition } from '../3d/ArtworkIconProjector';
import { adaptApiExhibition } from '../3d/backendAdapter';
import { useOwnExhibition } from '../../lib/api/domains/exhibitions';
import '../../App.css';

// /dashboard/organization/exhibitions/preview/:exhibitionId — lets a curator
// walk through their own exhibition in the real 3D scene before publishing
// it (DRAFT exhibitions 404 on the public GET /exhibitions/:id path, so this
// uses useOwnExhibition/GET /exhibitions/mine/:id instead, same owner-only
// endpoint ExhibitionArtworkPlacement.tsx already relies on — its Prisma
// include already carries artworkLinks, so adaptApiExhibition works
// unmodified). Deliberately a trimmed copy of App.tsx's scene-rendering
// branch: no artwork detail card / offer form (an admin previewing their own
// unpublished show shouldn't see a "make an offer" button), no visitor
// counter (nothing to count pre-publish), just look-around + a way back. No
// `onBack` prop, unlike the panel pages — this renders full-bleed outside
// PanelLayout, so there's no header chrome to wire a back arrow into; the
// HUD button below is the only way out.
export default function ExhibitionPreviewPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { exhibitionId } = useParams<{ exhibitionId: string }>();
  const [locked, setLocked] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [, setIconPositions] = useState<ArtworkIconPosition[]>([]);

  const { data: backendDetail, isLoading } = useOwnExhibition(exhibitionId ?? '');
  const exhibition = useMemo(() => (backendDetail ? adaptApiExhibition(backendDetail) : null), [backendDetail]);

  useEffect(() => {
    const onChange = () => setIsFullscreen(document.fullscreenElement != null);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  function backToExhibitions() {
    setLocked(false);
    navigate('/dashboard/organization/exhibitions');
  }

  if (isLoading) {
    return <div className="loading-indicator" />;
  }

  if (!exhibition) {
    return (
      <div className="app-root flex items-center justify-center">
        <div className="instructions-card">
          <p className="instructions-title">{t('exhibitionPreviewUnavailable')}</p>
          <button className="hud-button mt-3" onClick={backToExhibitions}>
            {t('exhibitionPreviewBack')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="app-root">
      <Suspense fallback={<div className="loading-indicator" />}>
        <Scene key={exhibition.id} exhibition={exhibition} onLockChange={setLocked} onIconPositionsChange={setIconPositions} />
      </Suspense>

      <div className="fixed left-3 top-3 z-40 rounded-md bg-black/55 px-3 py-1.5 text-sm font-medium text-white backdrop-blur">
        {t('exhibitionPreviewBadge')}
      </div>

      <div className="hud-controls">
        <button className="hud-button" onClick={backToExhibitions}>
          {t('exhibitionPreviewBack')}
        </button>
        <button
          className="hud-button"
          onClick={() => {
            if (document.fullscreenElement) {
              document.exitFullscreen();
            } else {
              document.documentElement.requestFullscreen();
            }
          }}
        >
          {isFullscreen ? '⤡ Tam Ekrandan Çık' : '⤢ Tam Ekran'}
        </button>
      </div>

      <div className={`instructions-overlay ${locked ? 'hidden' : ''}`}>
        <div className="instructions-card">
          <p className="instructions-title">{exhibition.name}</p>
          <p className="instructions-text">
            Galeride gezinmek için <strong>WASD</strong> tuşlarını, etrafa bakmak için <strong>mouse</strong>'u kullanın.
          </p>
          <p className="instructions-hint">Başlamak için tıklayın · Çıkmak için ESC</p>
        </div>
      </div>
    </div>
  );
}
