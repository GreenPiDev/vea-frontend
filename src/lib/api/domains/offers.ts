// Offer creation + the read-only offer lists (buyer/seller/org-wide). The
// real Teklif -> Kabul -> ödeme state machine lives entirely on the backend
// (see vea-api/CLAUDE.md's "Offer modülü") — accept/pay/deliver/release
// management UI isn't built yet. `artistDecision` below is a separate,
// informal field (see setArtistDecision's comment) that never touches that
// state machine.
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Paths } from '../paths';
import { patch, post } from '../client';
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

export type ArtistDecision = 'APPROVED' | 'REJECTED';

export interface ApiOffer {
  id: string;
  artworkId: string;
  buyerId: string;
  amount: number;
  currency: string;
  status: OfferStatus;
  /** Informal, artist-set signal — independent of `status`. Null = the artist hasn't decided yet. */
  artistDecision: ArtistDecision | null;
  commissionAmount: number | null;
  commissionTaxAmount: number | null;
  createdAt: string;
  respondedAt: string | null;
  /** Present on GET /offers/mine/buying, /offers/mine/selling, and /offers/organization — the backend embeds it so a list can show a title/price without a second round-trip per offer. */
  artwork?: ApiArtwork;
  /** Only present on GET /offers/organization (admin, org-wide) — never on the seller's own /offers/mine/selling, which deliberately omits buyer identity from the artist. */
  buyer?: { id: string; email: string; name: string | null };
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

export function useMyOffersAsSeller() {
  return useApiGetList<ApiOffer>(Paths.OffersMineSelling);
}

// Admin's org-wide view (GET /offers/organization) — every offer on any
// artwork by any artist in the admin's own organization, buyer included.
export function useOrganizationOffers() {
  return useApiGetList<ApiOffer>('/offers/organization', [Paths.OffersMineSelling, 'organization']);
}

// One-time, irreversible per product decision — see vea-api's
// OffersService.setArtistDecision. Invalidates both the seller's own list
// and the org-wide admin list, since the same offer row appears in both.
export function useSetArtistDecision() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ offerId, decision }: { offerId: string; decision: ArtistDecision }) =>
      patch<ApiOffer>({ path: `/offers/${offerId}/artist-decision`, payload: { decision } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [Paths.OffersMineSelling] });
    },
  });
}
