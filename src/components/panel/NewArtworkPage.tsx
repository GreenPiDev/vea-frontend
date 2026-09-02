import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import ArtworkForm from './ArtworkForm';
import PanelLayout from '../layout/PanelLayout';
import BackLink from '../layout/BackLink';
import { useArtistNavItems } from './artistNavItems';

interface NewArtworkPageProps {
  onBack: () => void;
}

// /dashboard/artist/artworks/new-artwork — dedicated page for artwork
// creation, split out of ArtistPanel's "artworks" section (which used to
// toggle the form inline via local state) so the form has its own
// URL/back-button/refresh behavior instead of vanishing on nav away. Same
// pattern as NewExhibitionPage.tsx. Editing an existing artwork still
// happens inline in ArtistPanel — only creation moved to its own page.
export default function NewArtworkPage({ onBack }: NewArtworkPageProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const navItems = useArtistNavItems();

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
        <h2 className="text-lg font-semibold text-white">{t('artworkNew')}</h2>
        <ArtworkForm onDone={() => navigate('/dashboard/artist/artworks')} />
      </div>
    </PanelLayout>
  );
}
