import { useTranslation } from 'react-i18next';
import type { PanelNavItem } from '../layout/Sidebar';
import { ArtworkIcon, ChartIcon, GalleryIcon, PeopleIcon, RemovalRequestIcon } from '../layout/icons';

// Shared between CuratorPanel and any standalone page under its
// /dashboard/organization/* namespace (e.g. NewExhibitionPage) so the
// sidebar stays identical whether the curator is on a section tab or a
// dedicated sub-page.
export function useCuratorNavItems(): PanelNavItem[] {
  const { t } = useTranslation();
  return [
    { id: 'exhibitions', label: t('exhibitionListTitle'), icon: <GalleryIcon /> },
    { id: 'artists', label: t('curatorArtistsTitle'), icon: <PeopleIcon /> },
    { id: 'offers', label: t('orgOffersTitle'), icon: <ArtworkIcon /> },
    { id: 'removal-requests', label: t('removalRequestsTitle'), icon: <RemovalRequestIcon /> },
    { id: 'stats', label: t('curatorStatsTitle'), icon: <ChartIcon /> },
  ];
}
