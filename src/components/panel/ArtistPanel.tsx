import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMyArtistProfile } from '../../lib/api/domains/artistProfiles';
import { ApiError } from '../../lib/api/client';
import ArtistProfileForm from './ArtistProfileForm';
import ArtistProfileView from './ArtistProfileView';
import ArtworkList from './ArtworkList';
import ArtistOfferTable from './ArtistOfferTable';
import ArtistStatsTable from './ArtistStatsTable';
import PanelLayout from '../layout/PanelLayout';
import { useArtistNavItems } from './artistNavItems';

interface ArtistPanelProps {
  onBack: () => void;
}

type Section = 'profile' | 'artworks' | 'offers' | 'stats';

const SECTIONS: Section[] = ['profile', 'artworks', 'offers', 'stats'];

export default function ArtistPanel({ onBack }: ArtistPanelProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { section: sectionParam } = useParams<{ section: string }>();
  const { data: profile, isLoading, error } = useMyArtistProfile();
  const navItems = useArtistNavItems();

  const hasNoProfile = error instanceof ApiError && error.status === 404;

  if (!sectionParam || !SECTIONS.includes(sectionParam as Section)) {
    return <Navigate to="/dashboard/artist/artworks" replace />;
  }
  const section = sectionParam as Section;

  return (
    <PanelLayout
      title={t('artistPanelTitle')}
      navItems={navItems}
      activeSectionId={section}
      onSelectSection={(id) => navigate(`/dashboard/artist/${id}`)}
      onBack={onBack}
      fullWidth={section === 'offers' || section === 'artworks' || section === 'stats'}
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
            <button
              onClick={() => navigate('/dashboard/artist/artworks/new-artwork')}
              className="rounded-md bg-brand-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-800"
            >
              {t('artworkNew')}
            </button>
          </div>

          <p className="rounded-md border border-brand-300 bg-brand-100 px-3 py-2 text-sm text-brand-800">
            {t('artworkPublishHint')}
          </p>

          <ArtworkList onEdit={(artwork) => navigate(`/dashboard/artist/artworks/edit/${artwork.id}`)} />
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
