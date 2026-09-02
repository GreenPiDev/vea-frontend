import { Suspense, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Scene from '../3d/Scene';
import type { ArtworkIconPosition } from '../3d/ArtworkIconProjector';
import { adaptExhibitionTemplate } from '../3d/backendAdapter';
import { useOwnExhibitionTemplate } from '../../lib/api/domains/exhibitionTemplates';
import '../../App.css';

// /dashboard/organization/exhibition-templates/preview/:templateId — same
// full-bleed 3D walkthrough as ExhibitionPreviewPage.tsx, but for a bare
// template (no exhibition, no artworks) — lets a curator see what a
// template's empty room looks like before picking it for a real exhibition.
// Trimmed copy of ExhibitionPreviewPage.tsx's structure (HUD/instructions/
// fullscreen), swapping useOwnExhibition+adaptApiExhibition for
// useOwnExhibitionTemplate+adaptExhibitionTemplate.
export default function ExhibitionTemplatePreviewPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { templateId } = useParams<{ templateId: string }>();
  const [locked, setLocked] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [, setIconPositions] = useState<ArtworkIconPosition[]>([]);

  const { data: template, isLoading } = useOwnExhibitionTemplate(templateId ?? '');
  const exhibition = useMemo(() => (template ? adaptExhibitionTemplate(template) : null), [template]);

  useEffect(() => {
    const onChange = () => setIsFullscreen(document.fullscreenElement != null);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  function backToTemplates() {
    setLocked(false);
    navigate('/dashboard/organization/exhibition-templates');
  }

  if (isLoading) {
    return <div className="loading-indicator" />;
  }

  if (!exhibition) {
    return (
      <div className="app-root flex items-center justify-center">
        <div className="instructions-card">
          <p className="instructions-title">{t('exhibitionPreviewUnavailable')}</p>
          <button className="hud-button mt-3" onClick={backToTemplates}>
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
        {t('exhibitionTemplatePreviewBadge')}
      </div>

      <div className="hud-controls">
        <button className="hud-button" onClick={backToTemplates}>
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
