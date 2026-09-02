import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import ExhibitionTemplateForm from './ExhibitionTemplateForm';
import PanelLayout from '../layout/PanelLayout';
import { useCuratorNavItems } from './curatorNavItems';
import { useOwnExhibitionTemplate } from '../../lib/api/domains/exhibitionTemplates';

interface EditExhibitionTemplatePageProps {
  onBack: () => void;
}

// /dashboard/organization/exhibition-templates/:templateId/edit
export default function EditExhibitionTemplatePage({ onBack }: EditExhibitionTemplatePageProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const navItems = useCuratorNavItems();
  const { templateId } = useParams<{ templateId: string }>();
  const { data: template, isLoading } = useOwnExhibitionTemplate(templateId ?? '');

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
        <h2 className="text-lg font-semibold text-white">{t('exhibitionTemplateEdit')}</h2>
        {!isLoading && template && (
          <ExhibitionTemplateForm
            editing={template}
            onDone={() => navigate('/dashboard/organization/exhibition-templates')}
          />
        )}
      </div>
    </PanelLayout>
  );
}
