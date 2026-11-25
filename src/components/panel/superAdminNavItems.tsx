import { useTranslation } from 'react-i18next';
import type { PanelNavItem } from '../layout/Sidebar';
import { OrganizationIcon } from '../layout/icons';

// Shared by SuperAdminPanel (the organizations list) and
// OrganizationDetailPage so the sidebar is identical on both — same idea as
// curatorNavItems.tsx.
export function useSuperAdminNavItems(): PanelNavItem[] {
  const { t } = useTranslation();
  return [{ id: 'organizations', label: t('orgListTitle'), icon: <OrganizationIcon /> }];
}
