import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import ExhibitionTemplateForm from './ExhibitionTemplateForm';
import PanelLayout from '../layout/PanelLayout';
import { useCuratorNavItems } from './curatorNavItems';

interface NewExhibitionTemplatePageProps {
  onBack: () => void;
}

// /dashboard/organization/exhibition-templates/new — same dedicated-page
// pattern as NewExhibitionPage.tsx (own URL/back-button, not an inline
// toggle inside CuratorPanel's section).
export default function NewExhibitionTemplatePage({ onBack }: NewExhibitionTemplatePageProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const navItems = useCuratorNavItems();

  return (
    <PanelLayout
      title={t('curatorPanelTitle')}
      navItems={navItems}
      activeSectionId="exhibition-templates"
      onSelectSection={(id) => navigate(`/dashboard/organization/${id}`)}
      onBack={onBack}
      fullWidth
    >
      <div className="flex flex-col gap-6">
        <h2 className="text-lg font-semibold text-white">{t('exhibitionTemplateNew')}</h2>
        <ExhibitionTemplateForm onDone={() => navigate('/dashboard/organization/exhibition-templates')} />
      </div>
    </PanelLayout>
  );
}
