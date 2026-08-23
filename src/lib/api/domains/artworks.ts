// Artwork CRUD, built on the generic factory (same shape as
// domains/exhibitions.ts) plus one hand-written mutation for the
// dedicated status endpoint (PATCH /artworks/:id/status), which the
// generic `update` (a full PATCH /artworks/:id) doesn't cover.
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Paths } from '../paths';
import { patch } from '../client';
import { useApiGetList, useApiMutations } from '../factory';

export type ArtworkCategory = 'PAINTING' | 'SCULPTURE' | 'PHOTOGRAPHY' | 'OTHER';
export type ArtworkOrientation = 'PORTRAIT' | 'LANDSCAPE' | 'SQUARE';
export type ArtworkConditionStatus = 'ORIGINAL' | 'RESTORED' | 'DAMAGED' | 'OTHER';
export type ArtworkStatus = 'DRAFT' | 'LISTED' | 'IN_EXHIBITION' | 'SOLD' | 'ARCHIVED';
export type OwnerSettableArtworkStatus = 'DRAFT' | 'LISTED';

export interface ApiArtwork {
  id: string;
  artistProfileId: string;
  title: string;
  technique: string | null;
  yearCreated: number | null;
  heightCm: number;
  widthCm: number;
  orientation: ArtworkOrientation;
  story: string | null;
  conditionStatus: ArtworkConditionStatus | null;
  conditionNotes: string | null;
  note: string | null;
  category: ArtworkCategory;
  priceAmount: number;
  currency: string;
  imageUrl: string;
  model3dUrl: string | null;
  status: ArtworkStatus;
  createdAt: string;
  /** Only present when the backend embeds it (e.g. GET /exhibitions/:id's artworkLinks[].artwork, or GET /artworks for a curator's cross-artist picker) — not returned by /artworks/mine. Backend includes the full ArtistProfile row; `userId` lets the offer UI tell whether the current viewer owns this artwork. */
  artistProfile?: { displayName: string; userId: string };
  /** Only present on GET /artworks/mine — which exhibition(s), if any, this artwork is currently placed in. */
  exhibitionLinks?: { exhibition: { id: string; title: string; status: 'DRAFT' | 'ACTIVE' | 'ENDED' } }[];
}

export function useMyArtworks() {
  return useApiGetList<ApiArtwork>(Paths.ArtworksMine);
}

// GET /artworks — public list (LISTED/IN_EXHIBITION only), used by the
// curator panel to pick any artist's artwork for placement (cross-artist
// curation), same pattern as usePublicExhibitions.
export function usePublicArtworks() {
  return useApiGetList<ApiArtwork>(Paths.Artworks);
}

export function useArtworkMutations() {
  return useApiMutations<ApiArtwork>(Paths.Artworks, [Paths.ArtworksMine]);
}

export function useSetArtworkStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: OwnerSettableArtworkStatus }) =>
      patch<ApiArtwork>({ path: `${Paths.Artworks}/${id}/status`, payload: { status } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [Paths.ArtworksMine] }),
  });
}
