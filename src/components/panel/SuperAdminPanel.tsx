import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import OrganizationList from './OrganizationList';
import OrgAdminList from './OrgAdminList';
import PanelLayout from '../layout/PanelLayout';
import { OrganizationIcon } from '../layout/icons';
import { useOrganizations } from '../../lib/api/domains/organizations';

interface SuperAdminPanelProps {
  onBack: () => void;
}

// Platform-vendor screen (SUPERADMIN role only): create Organizations and
// assign/remove their ADMIN users — the thing that lets several ADMIN
// accounts at the same firm share one CuratorPanel exhibition pool (see
// vea-api's Exhibition.organizationId). Master-detail on one screen, same
// no-router lightweight pattern as CuratorPanel/ArtistPanel.
export default function SuperAdminPanel({ onBack }: SuperAdminPanelProps) {
  const { t } = useTranslation();
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const { data: organizations } = useOrganizations();

  const navItems = [{ id: 'organizations', label: t('orgListTitle'), icon: <OrganizationIcon /> }];
  const selectedOrg = organizations?.find((org) => org.id === selectedOrgId);

  return (
    <PanelLayout
      title={t('orgPanelTitle')}
      navItems={navItems}
      activeSectionId="organizations"
      onSelectSection={() => {}}
      onBack={onBack}
    >
      <div className="flex flex-col gap-6">
        <OrganizationList selectedId={selectedOrgId} onSelect={setSelectedOrgId} />
        {selectedOrg && (
          <OrgAdminList organizationId={selectedOrg.id} organizationName={selectedOrg.name} />
        )}
      </div>
    </PanelLayout>
  );
}
