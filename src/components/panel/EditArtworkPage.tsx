import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMyArtworks } from '../../lib/api/domains/artworks';
import ArtworkForm from './ArtworkForm';
import PanelLayout from '../layout/PanelLayout';
import BackLink from '../layout/BackLink';
import { useArtistNavItems } from './artistNavItems';

interface EditArtworkPageProps {
  onBack: () => void;
}

// /dashboard/artist/artworks/edit/:artworkId — dedicated page for editing an
// existing artwork, split out of ArtistPanel's "artworks" section (which
// used to toggle ArtworkForm inline via local state) so it has its own
// URL/back-button/refresh behavior. Same pattern as NewArtworkPage.tsx.
// There's no GET /artworks/mine/:id endpoint — the artwork is looked up
// client-side out of useMyArtworks()'s list, same data ArtworkList.tsx
// already renders from, so no new backend route was needed.
export default function EditArtworkPage({ onBack }: EditArtworkPageProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { artworkId } = useParams<{ artworkId: string }>();
  const { data: artworks, isLoading } = useMyArtworks();
  const navItems = useArtistNavItems();
  const artwork = artworks?.find((a) => a.id === artworkId);

  return (
    <PanelLayout
      title={t('artistPanelTitle')}
      navItems={navItems}
      activeSectionId="artworks"
      onSelectSection={(id) => navigate(`/dashboard/artist/${id}`)}
      onBack={onBack}
      fullWidth
    >
      <div className="flex flex-col gap-6">
        <BackLink to="/dashboard/artist/artworks" />
        <h2 className="text-lg font-semibold text-white">{t('artworkEdit')}</h2>
        {isLoading && null}
        {!isLoading && !artwork && <p className="text-sm text-brand-200">{t('artworkEditNotFound')}</p>}
        {artwork && (
          <ArtworkForm editing={artwork} onDone={() => navigate('/dashboard/artist/artworks')} />
        )}
      </div>
    </PanelLayout>
  );
}
