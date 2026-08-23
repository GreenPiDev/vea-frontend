// Offer creation + the buyer's own read-only offer list (Teklif -> ...
// state machine lives entirely on the backend, see vea-api/CLAUDE.md's
// "Offer modülü"). Accept/pay/deliver/release management screens (seller
// side) aren't built yet.
import { useMutation } from '@tanstack/react-query';
import { Paths } from '../paths';
import { post } from '../client';
import { useApiGetList } from '../factory';
import type { ApiArtwork } from './artworks';

export type OfferStatus =
  | 'PENDING'
  | 'ACCEPTED'
  | 'PAYMENT_HELD'
  | 'DELIVERED'
  | 'RELEASED'
  | 'REJECTED'
  | 'CANCELLED';

export interface ApiOffer {
  id: string;
  artworkId: string;
  buyerId: string;
  amount: number;
  currency: string;
  status: OfferStatus;
  commissionAmount: number | null;
  commissionTaxAmount: number | null;
  createdAt: string;
  respondedAt: string | null;
  /** Only present on GET /offers/mine/buying — the backend embeds it so the buyer's offer list can show a title/price without a second round-trip per offer. */
  artwork?: ApiArtwork;
}

interface CreateOfferPayload {
  artworkId: string;
  amount: number;
}

// The nested `/artworks/:artworkId/offers` path doesn't fit Paths' flat
// base-path shape (same reasoning as useSetArtworkStatus's inline
// `${Paths.Artworks}/${id}/status` in domains/artworks.ts) — built here
// directly instead of adding a one-off entry to paths.ts.
export function useCreateOffer() {
  return useMutation({
    mutationFn: ({ artworkId, amount }: CreateOfferPayload) =>
      post<ApiOffer>({ path: `/artworks/${artworkId}/offers`, payload: { amount } }),
  });
}

export function useMyOffersAsBuyer() {
  return useApiGetList<ApiOffer>(Paths.OffersMineBuying);
}
