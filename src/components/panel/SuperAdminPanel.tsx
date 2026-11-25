import { useTranslation } from 'react-i18next';
import OrganizationList from './OrganizationList';
import PanelLayout from '../layout/PanelLayout';
import { useSuperAdminNavItems } from './superAdminNavItems';

interface SuperAdminPanelProps {
  onBack: () => void;
}

// Platform-vendor screen (SUPERADMIN role only): create Organizations and
// assign/remove their ADMIN users — the thing that lets several ADMIN
// accounts at the same firm share one CuratorPanel exhibition pool (see
// vea-api's Exhibition.organizationId).
// OrganizationList.tsx rows open the organization's detail page
// (OrganizationDetailPage.tsx). Mounted
// at the single fixed route /dashboard/admin/organizations (see
// Dashboard.tsx) since this panel has only one section.
export default function SuperAdminPanel({ onBack }: SuperAdminPanelProps) {
  const { t } = useTranslation();

  const navItems = useSuperAdminNavItems();

  return (
    <PanelLayout
      title={t('orgPanelTitle')}
      navItems={navItems}
      activeSectionId="organizations"
      onSelectSection={() => {}}
      onBack={onBack}
      fullWidth
    >
      <OrganizationList />
    </PanelLayout>
  );
}
