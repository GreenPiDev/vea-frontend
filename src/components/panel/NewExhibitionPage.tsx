import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import ExhibitionForm from './ExhibitionForm';
import PanelLayout from '../layout/PanelLayout';
import BackLink from '../layout/BackLink';
import { useCuratorNavItems } from './curatorNavItems';

interface NewExhibitionPageProps {
  onBack: () => void;
}

// /dashboard/organization/exhibitions/new-exhibition — dedicated page for
// exhibition creation, split out of CuratorPanel's "exhibitions" section
// (which used to toggle the form inline via local state) so the form has
// its own URL/back-button/refresh behavior instead of vanishing on nav away.
export default function NewExhibitionPage({ onBack }: NewExhibitionPageProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
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
      <div className="flex flex-col gap-6">
        <BackLink to="/dashboard/organization/exhibitions" />
        <h2 className="text-lg font-semibold text-white">{t('exhibitionNew')}</h2>
        <ExhibitionForm onDone={() => navigate('/dashboard/organization/exhibitions')} />
      </div>
    </PanelLayout>
  );
}
