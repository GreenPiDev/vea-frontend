import { useTranslation } from 'react-i18next';
import type { PanelNavItem } from '../layout/Sidebar';
import { ArtworkIcon, ChartIcon, GalleryIcon, PeopleIcon } from '../layout/icons';

// Shared between ArtistPanel and any standalone page under its
// /dashboard/artist/* namespace (e.g. NewArtworkPage) so the sidebar stays
// identical whether the seller is on a section tab or a dedicated sub-page.
export function useArtistNavItems(): PanelNavItem[] {
  const { t } = useTranslation();
  return [
    { id: 'profile', label: t('artistProfileSectionTitle'), icon: <PeopleIcon /> },
    { id: 'artworks', label: t('artworkListTitle'), icon: <ArtworkIcon /> },
    { id: 'offers', label: t('artistOffersTitle'), icon: <GalleryIcon /> },
    { id: 'stats', label: t('artistStatsTitle'), icon: <ChartIcon /> },
  ];
}
