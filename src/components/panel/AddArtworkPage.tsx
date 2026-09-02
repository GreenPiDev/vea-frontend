import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import ExhibitionArtworkPlacement from './ExhibitionArtworkPlacement';
import PanelLayout from '../layout/PanelLayout';
import BackLink from '../layout/BackLink';
import { useCuratorNavItems } from './curatorNavItems';

interface AddArtworkPageProps {
  onBack: () => void;
}

// /dashboard/organization/exhibitions/add-artwork/:exhibitionId — dedicated
// page for the "Eser Yerleştir" flow, split out of CuratorPanel's
// "exhibitions" section (which used to toggle ExhibitionArtworkPlacement
// inline via local state keyed on exhibitionId) so it has its own URL,
// survives a refresh, and is directly linkable. Same pattern as
// NewExhibitionPage.tsx/NewArtworkPage.tsx.
export default function AddArtworkPage({ onBack }: AddArtworkPageProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { exhibitionId } = useParams<{ exhibitionId: string }>();
  const navItems = useCuratorNavItems();

  return (
    <PanelLayout
      title={t('curatorPanelTitle')}
      navItems={navItems}
      activeSectionId="exhibitions"
      onSelectSection={(id) => navigate(`/dashboard/organization/${id}`)}
      onBack={onBack}
      fullWidth
    >
      <div className="flex flex-col gap-4">
        <BackLink to="/dashboard/organization/exhibitions" />
        {exhibitionId && (
          <ExhibitionArtworkPlacement
            exhibitionId={exhibitionId}
            onDone={() => navigate('/dashboard/organization/exhibitions')}
          />
        )}
      </div>
    </PanelLayout>
  );
}
