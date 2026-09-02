import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import ExhibitionList from './ExhibitionList';
import ExhibitionTemplateList from './ExhibitionTemplateList';
import OrgArtistList from './OrgArtistList';
import OrgOfferTable from './OrgOfferTable';
import ExhibitionStatsList from './ExhibitionStatsList';
import RemovalRequestTable from './RemovalRequestTable';
import PanelLayout from '../layout/PanelLayout';
import { useCuratorNavItems } from './curatorNavItems';

interface CuratorPanelProps {
  onBack: () => void;
}

type Section = 'exhibitions' | 'exhibition-templates' | 'artists' | 'offers' | 'removal-requests' | 'stats';

const SECTIONS: Section[] = ['exhibitions', 'exhibition-templates', 'artists', 'offers', 'removal-requests', 'stats'];

// Admin/curator screen: exhibition creation + artwork placement, split out
// of ArtistPanel.tsx so artists (who only manage their own artwork/portfolio)
// never see exhibition-hall controls. Unlike ArtistPanel this doesn't need
// an ArtistProfile — access is enforced purely by the backend's
// RolesGuard/@Roles(ADMIN) on the /exhibitions write endpoints. Also owns
// "Sanatçılarım" (OrgArtistList) — inviting artists into this curator's own
// organization, since artist onboarding is no longer self-serve — and
// "Teklifler" (OrgOfferTable), the org-wide read-only offer overview, and
// "İstatistikler" (ExhibitionStatsList) — visitor/view counts.
export default function CuratorPanel({ onBack }: CuratorPanelProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { section: sectionParam } = useParams<{ section: string }>();
  const navItems = useCuratorNavItems();

  if (!sectionParam || !SECTIONS.includes(sectionParam as Section)) {
    return <Navigate to="/dashboard/organization/exhibitions" replace />;
  }
  const section = sectionParam as Section;

  return (
    <PanelLayout
      title={t('curatorPanelTitle')}
      navItems={navItems}
      activeSectionId={section}
      onSelectSection={(id) => navigate(`/dashboard/organization/${id}`)}
      onBack={onBack}
      fullWidth={
        section === 'exhibitions' ||
        section === 'exhibition-templates' ||
        section === 'artists' ||
        section === 'offers' ||
        section === 'removal-requests' ||
        section === 'stats'
      }
    >
      {section === 'exhibitions' && (
        <div className="flex flex-col gap-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">{t('exhibitionListTitle')}</h2>
            <button
              onClick={() => navigate('/dashboard/organization/exhibitions/new-exhibition')}
              className="rounded-md bg-brand-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-800"
            >
              {t('exhibitionNew')}
            </button>
          </div>

          <ExhibitionList
            onPlace={(exhibitionId) =>
              navigate(`/dashboard/organization/exhibitions/add-artwork/${exhibitionId}`)
            }
            onPreview={(exhibitionId) =>
              navigate(`/dashboard/organization/exhibitions/preview/${exhibitionId}`)
            }
          />
        </div>
      )}

      {section === 'exhibition-templates' && (
        <div className="flex flex-col gap-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">{t('exhibitionTemplatesTitle')}</h2>
            <button
              onClick={() => navigate('/dashboard/organization/exhibition-templates/new')}
              className="rounded-md bg-brand-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-800"
            >
              {t('exhibitionTemplateNew')}
            </button>
          </div>

          <ExhibitionTemplateList
            onEdit={(templateId) =>
              navigate(`/dashboard/organization/exhibition-templates/edit/${templateId}`)
            }
            onPreview={(templateId) =>
              navigate(`/dashboard/organization/exhibition-templates/preview/${templateId}`)
            }
          />
        </div>
      )}

      {section === 'artists' && <OrgArtistList />}

      {section === 'offers' && (
        <div className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold text-white">{t('orgOffersTitle')}</h2>
          <OrgOfferTable />
        </div>
      )}

      {section === 'removal-requests' && (
        <div className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold text-white">{t('removalRequestsTitle')}</h2>
          <RemovalRequestTable />
        </div>
      )}

      {section === 'stats' && (
        <div className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold text-white">{t('curatorStatsTitle')}</h2>
          <ExhibitionStatsList />
        </div>
      )}
    </PanelLayout>
  );
}
