// Offer creation only (Teklif -> ... state machine lives entirely on the
// backend, see vea-api/CLAUDE.md's "Offer modülü"). Accept/pay/deliver/
// release + "my offers" list screens aren't built yet — this is just the
// buyer-side "make an offer" mutation consumed by ArtworkDetailCard.
import { useMutation } from '@tanstack/react-query';
import { post } from '../client';

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
