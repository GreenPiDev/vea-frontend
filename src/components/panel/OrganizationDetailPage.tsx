import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import PanelLayout from '../layout/PanelLayout';
import BackLink from '../layout/BackLink';
import KpiCard from '../common/KpiCard';
import Tabs, { TabPanel, type TabItem } from '../common/Tabs';
import { useSuperAdminNavItems } from './superAdminNavItems';
import OrgAdminList from './OrgAdminList';
import OrgDetailExhibitionsTab from './OrgDetailExhibitionsTab';
import OrgDetailArtistsTab from './OrgDetailArtistsTab';
import OrgDetailOffersTab from './OrgDetailOffersTab';
import { formatDate } from './orgDetailFormat';
import { useOrganizationOverview } from '../../lib/api/domains/organizations';
import { ApiError } from '../../lib/api/client';

interface OrganizationDetailPageProps {
  onBack: () => void;
}

type DetailTab = 'admins' | 'exhibitions' | 'artists' | 'offers';
const DETAIL_TABS: DetailTab[] = ['admins', 'exhibitions', 'artists', 'offers'];
const LIST_PATH = '/dashboard/admin/organizations';

function isDetailTab(value: string | null): value is DetailTab {
  return value !== null && (DETAIL_TABS as string[]).includes(value);
}

// /dashboard/admin/organizations/:organizationId — the SUPERADMIN's view of
// one gallery: KPI cards (admins / exhibitions / artists), then tabs:
// "Adminler" (manage the org's admins — the only writable part), and the
// read-only "Sergiler" (+ 3D preview), "Sanatçılar" (artists → artworks →
// offers drill-down) and "Teklifler" (every offer with its timeline and
// payment) for checking what's going on when something goes wrong. The
// lists are server-side searched/filtered/paginated (shared PagedList). The active
// tab lives in the URL (?tab=) so it survives a refresh and can be linked.
// Each tab mounts only while active, so its data is fetched on first open.
export default function OrganizationDetailPage({ onBack }: OrganizationDetailPageProps) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const navItems = useSuperAdminNavItems();
  const { organizationId = '' } = useParams<{ organizationId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: overview, error } = useOrganizationOverview(organizationId);

  const tabParam = searchParams.get('tab');
  const activeTab: DetailTab = isDetailTab(tabParam) ? tabParam : 'admins';
  const setTab = (tab: DetailTab) => setSearchParams(tab === 'admins' ? {} : { tab }, { replace: true });

  const tabs: TabItem<DetailTab>[] = [
    { id: 'admins', label: t('orgDetailTabAdmins') },
    { id: 'exhibitions', label: t('orgDetailTabExhibitions') },
    { id: 'artists', label: t('orgDetailTabArtists') },
    { id: 'offers', label: t('orgDetailTabOffers') },
  ];
  const notFound = error instanceof ApiError && error.status === 404;

  return (
    <PanelLayout
      title={t('orgPanelTitle')}
      navItems={navItems}
      activeSectionId="organizations"
      onSelectSection={() => navigate(LIST_PATH)}
      onBack={onBack}
      fullWidth
    >
      <div className="flex flex-col gap-6">
        <BackLink to={LIST_PATH} />

        {notFound ? (
          <p className="text-sm text-brand-200">{t('orgDetailNotFound')}</p>
        ) : (
          <>
            <div className="flex flex-col gap-1">
              <h2 className="text-xl font-semibold text-white">{overview?.name ?? '…'}</h2>
              {overview && (
                <p className="text-xs text-brand-300">
                  {t('orgDetailCreatedAt', { date: formatDate(overview.createdAt, i18n.language) })}
                </p>
              )}
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <KpiCard label={t('orgDetailKpiAdmins')} value={overview?.counts.admins} />
              <KpiCard label={t('orgDetailKpiExhibitions')} value={overview?.counts.exhibitions} />
              <KpiCard label={t('orgDetailKpiArtists')} value={overview?.counts.artists} />
            </div>

            <div>
              <Tabs tabs={tabs} activeId={activeTab} onChange={setTab} idPrefix="org-detail" />
              <TabPanel idPrefix="org-detail" tabId={activeTab}>
                {activeTab === 'admins' && overview && (
                  <OrgAdminList organizationId={organizationId} organizationName={overview.name} />
                )}
                {activeTab === 'exhibitions' && <OrgDetailExhibitionsTab organizationId={organizationId} />}
                {activeTab === 'artists' && <OrgDetailArtistsTab organizationId={organizationId} />}
                {activeTab === 'offers' && <OrgDetailOffersTab organizationId={organizationId} />}
              </TabPanel>
            </div>
          </>
        )}
      </div>
    </PanelLayout>
  );
}
