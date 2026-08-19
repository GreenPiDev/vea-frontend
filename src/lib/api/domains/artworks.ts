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
}

export function useMyArtworks() {
  return useApiGetList<ApiArtwork>(Paths.ArtworksMine);
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
