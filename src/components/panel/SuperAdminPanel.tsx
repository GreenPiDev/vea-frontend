import { useTranslation } from 'react-i18next';
import OrganizationList from './OrganizationList';
import PanelLayout from '../layout/PanelLayout';
import { OrganizationIcon } from '../layout/icons';

interface SuperAdminPanelProps {
  onBack: () => void;
}

// Platform-vendor screen (SUPERADMIN role only): create Organizations and
// assign/remove their ADMIN users — the thing that lets several ADMIN
// accounts at the same firm share one CuratorPanel exhibition pool (see
// vea-api's Exhibition.organizationId). Each organization row expands in
// place to its admin list (OrganizationList.tsx). Mounted
// at the single fixed route /dashboard/admin/organizations (see
// Dashboard.tsx) since this panel has only one section.
export default function SuperAdminPanel({ onBack }: SuperAdminPanelProps) {
  const { t } = useTranslation();

  const navItems = [{ id: 'organizations', label: t('orgListTitle'), icon: <OrganizationIcon /> }];

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
