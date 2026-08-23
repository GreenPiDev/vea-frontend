import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import ExhibitionForm from './ExhibitionForm';
import ExhibitionList from './ExhibitionList';
import ExhibitionArtworkPlacement from './ExhibitionArtworkPlacement';
import OrgArtistList from './OrgArtistList';
import OrgOfferTable from './OrgOfferTable';
import PanelLayout from '../layout/PanelLayout';
import { ArtworkIcon, GalleryIcon, PeopleIcon } from '../layout/icons';

interface CuratorPanelProps {
  onBack: () => void;
}

type Section = 'exhibitions' | 'artists' | 'offers';

// Admin/curator screen: exhibition creation + artwork placement, split out
// of ArtistPanel.tsx so artists (who only manage their own artwork/portfolio)
// never see exhibition-hall controls. Unlike ArtistPanel this doesn't need
// an ArtistProfile — access is enforced purely by the backend's
// RolesGuard/@Roles(ADMIN) on the /exhibitions write endpoints. Also owns
// "Sanatçılarım" (OrgArtistList) — inviting artists into this curator's own
// organization, since artist onboarding is no longer self-serve — and
// "Teklifler" (OrgOfferTable), the org-wide read-only offer overview.
export default function CuratorPanel({ onBack }: CuratorPanelProps) {
  const { t } = useTranslation();
  const [section, setSection] = useState<Section>('exhibitions');
  const [showExhibitionForm, setShowExhibitionForm] = useState(false);
  const [placingExhibitionId, setPlacingExhibitionId] = useState<string | null>(null);

  const navItems = [
    { id: 'exhibitions', label: t('exhibitionListTitle'), icon: <GalleryIcon /> },
    { id: 'artists', label: t('curatorArtistsTitle'), icon: <PeopleIcon /> },
    { id: 'offers', label: t('orgOffersTitle'), icon: <ArtworkIcon /> },
  ];

  return (
    <PanelLayout
      title={t('curatorPanelTitle')}
      navItems={navItems}
      activeSectionId={section}
      onSelectSection={(id) => setSection(id as Section)}
      onBack={onBack}
    >
      {section === 'exhibitions' && (
        <div className="flex flex-col gap-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-brand-900">{t('exhibitionListTitle')}</h2>
            {!showExhibitionForm && (
              <button
                onClick={() => setShowExhibitionForm(true)}
                className="rounded-md bg-brand-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-800"
              >
                {t('exhibitionNew')}
              </button>
            )}
          </div>

          {showExhibitionForm && <ExhibitionForm onDone={() => setShowExhibitionForm(false)} />}

          {placingExhibitionId && (
            <ExhibitionArtworkPlacement
              exhibitionId={placingExhibitionId}
              onDone={() => setPlacingExhibitionId(null)}
            />
          )}

          <ExhibitionList onPlace={setPlacingExhibitionId} />
        </div>
      )}

      {section === 'artists' && <OrgArtistList />}

      {section === 'offers' && (
        <div className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold text-brand-900">{t('orgOffersTitle')}</h2>
          <OrgOfferTable />
        </div>
      )}
    </PanelLayout>
  );
}
