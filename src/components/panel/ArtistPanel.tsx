import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMyArtistProfile } from '../../lib/api/domains/artistProfiles';
import { ApiError } from '../../lib/api/client';
import ArtistProfileForm from './ArtistProfileForm';
import ArtistProfileView from './ArtistProfileView';
import ArtworkForm from './ArtworkForm';
import ArtworkList from './ArtworkList';
import ArtistOfferTable from './ArtistOfferTable';
import ArtistStatsTable from './ArtistStatsTable';
import type { ApiArtwork } from '../../lib/api/domains/artworks';
import PanelLayout from '../layout/PanelLayout';
import { ArtworkIcon, ChartIcon, GalleryIcon, PeopleIcon } from '../layout/icons';

interface ArtistPanelProps {
  onBack: () => void;
}

type Section = 'profile' | 'artworks' | 'offers' | 'stats';

export default function ArtistPanel({ onBack }: ArtistPanelProps) {
  const { t } = useTranslation();
  const { data: profile, isLoading, error } = useMyArtistProfile();
  const [formMode, setFormMode] = useState<'none' | 'create' | ApiArtwork>('none');
  const [section, setSection] = useState<Section>('artworks');

  const hasNoProfile = error instanceof ApiError && error.status === 404;

  const navItems = [
    { id: 'profile', label: t('artistProfileSectionTitle'), icon: <PeopleIcon /> },
    { id: 'artworks', label: t('artworkListTitle'), icon: <ArtworkIcon /> },
    { id: 'offers', label: t('artistOffersTitle'), icon: <GalleryIcon /> },
    { id: 'stats', label: t('artistStatsTitle'), icon: <ChartIcon /> },
  ];

  return (
    <PanelLayout
      title={t('artistPanelTitle')}
      navItems={navItems}
      activeSectionId={section}
      onSelectSection={(id) => setSection(id as Section)}
      onBack={onBack}
    >
      {isLoading && null}

      {hasNoProfile && <ArtistProfileForm />}

      {profile && section === 'profile' && (
        <div className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold text-white">{t('artistProfileSectionTitle')}</h2>
          <ArtistProfileView profile={profile} />
        </div>
      )}

      {profile && section === 'artworks' && (
        <div className="flex flex-col gap-6">
          <p className="text-brand-100">{t('profileWelcome', { name: profile.displayName })}</p>

          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">{t('artworkListTitle')}</h2>
            {formMode === 'none' && (
              <button
                onClick={() => setFormMode('create')}
                className="rounded-md bg-brand-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-800"
              >
                {t('artworkNew')}
              </button>
            )}
          </div>

          {formMode !== 'none' && (
            <ArtworkForm
              editing={formMode === 'create' ? undefined : formMode}
              onDone={() => setFormMode('none')}
            />
          )}

          <ArtworkList onEdit={(artwork) => setFormMode(artwork)} />
        </div>
      )}

      {profile && section === 'offers' && (
        <div className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold text-white">{t('artistOffersTitle')}</h2>
          <ArtistOfferTable />
        </div>
      )}

      {profile && section === 'stats' && (
        <div className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold text-white">{t('artistStatsTitle')}</h2>
          <ArtistStatsTable />
        </div>
      )}
    </PanelLayout>
  );
}
