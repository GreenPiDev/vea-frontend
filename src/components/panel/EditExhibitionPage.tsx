import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import ExhibitionForm from './ExhibitionForm';
import PanelLayout from '../layout/PanelLayout';
import BackLink from '../layout/BackLink';
import { useCuratorNavItems } from './curatorNavItems';
import { useOwnExhibition } from '../../lib/api/domains/exhibitions';

interface EditExhibitionPageProps {
  onBack: () => void;
}

// /dashboard/organization/exhibitions/edit/:exhibitionId — mirrors
// EditExhibitionTemplatePage.tsx's shape. useOwnExhibition (GET
// /exhibitions/mine/:id), not useExhibition, so a DRAFT exhibition can
// still be edited and so artworkLinks/exhibitionTemplate come back fully
// populated for ExhibitionForm's room-lock check.
export default function EditExhibitionPage({ onBack }: EditExhibitionPageProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const navItems = useCuratorNavItems();
  const { exhibitionId } = useParams<{ exhibitionId: string }>();
  const { data: exhibition, isLoading } = useOwnExhibition(exhibitionId ?? '');

  return (
    <PanelLayout
      title={t('curatorPanelTitle')}
      navItems={navItems}
      activeSectionId="exhibitions"
      onSelectSection={(id) => navigate(`/dashboard/organization/${id}`)}
      onBack={onBack}
      fullWidth
    >
      <div className="flex flex-col gap-6">
        <BackLink to="/dashboard/organization/exhibitions" />
        <h2 className="text-lg font-semibold text-white">{t('exhibitionEdit')}</h2>
        {!isLoading && exhibition && (
          <ExhibitionForm editing={exhibition} onDone={() => navigate('/dashboard/organization/exhibitions')} />
        )}
      </div>
    </PanelLayout>
  );
}
