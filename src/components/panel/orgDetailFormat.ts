import type { ApiExhibition } from '../../lib/api/domains/exhibitions';
import type { ArtworkStatus } from '../../lib/api/domains/artworks';
import type { ApiOrgOverviewArtist } from '../../lib/api/domains/organizations';

// Pure helpers for the SUPERADMIN organization detail page (tested in
// orgDetailFormat.test.ts).

export const EXHIBITION_STATUS_KEYS: Record<ApiExhibition['status'], string> = {
  DRAFT: 'exhibitionStatusDraft',
  ACTIVE: 'exhibitionStatusActive',
  ENDED: 'exhibitionStatusEnded',
};

export const ARTWORK_STATUS_KEYS: Record<ArtworkStatus, string> = {
  DRAFT: 'statusDraft',
  LISTED: 'statusListed',
  IN_EXHIBITION: 'statusInExhibition',
  SOLD: 'statusSold',
  ARCHIVED: 'statusArchived',
};

export function formatDate(iso: string, locale: string): string {
  return new Date(iso).toLocaleDateString(locale);
}

/** Total offers across every artwork of an artist (0 without a profile). */
export function artistOfferCount(artist: ApiOrgOverviewArtist): number {
  return artist.artistProfile?.artworks.reduce((sum, artwork) => sum + artwork.offers.length, 0) ?? 0;
}

/** Offers still waiting on someone — highlighted so a stuck deal stands out. */
export function pendingOfferCount(artist: ApiOrgOverviewArtist): number {
  return (
    artist.artistProfile?.artworks.reduce(
      (sum, artwork) => sum + artwork.offers.filter((offer) => offer.status === 'PENDING').length,
      0,
    ) ?? 0
  );
}
