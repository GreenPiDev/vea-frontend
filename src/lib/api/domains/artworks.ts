// Artwork CRUD, built on the generic factory (same shape as
// domains/exhibitions.ts) plus one hand-written mutation for the
// dedicated status endpoint (PATCH /artworks/:id/status), which the
// generic `update` (a full PATCH /artworks/:id) doesn't cover.
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Paths } from '../paths';
import { patch, postFormData } from '../client';
import { useApiGetList, useApiMutations } from '../factory';

export interface ApiArtistArtworkStats {
  artworkId: string;
  title: string;
  viewCount: number;
  /** Null if the artwork isn't currently placed in any exhibition. */
  exhibition: { id: string; title: string; totalVisitors: number } | null;
}

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
  /** Which exhibition(s), if any, this artwork is currently placed in. Present on GET /artworks/mine (with exhibition.status) and GET /artworks/organization (id+title only, no status) — the latter lets ExhibitionArtworkPlacement.tsx's picker gray out an artwork already placed in a *different* exhibition instead of silently omitting it. */
  exhibitionLinks?: { exhibition: { id: string; title: string; status?: 'DRAFT' | 'ACTIVE' | 'ENDED' } }[];
  /** Only present on GET /artworks/mine — the artist's own still-PENDING removal request, if any (at most one per artwork+exhibition, see ArtworkRemovalRequestsService). */
  removalRequests?: { id: string; status: 'PENDING'; exhibitionId: string }[];
  /** Present on GET /artworks/:id and GET /exhibitions/:id's artworkLinks[].artwork — true once the artist has recorded an informal artistDecision: 'APPROVED' on some offer for this artwork (see Offer.artistDecision). Sold in practice even though the real Artwork.status/Offer.status may still say otherwise; the backend also rejects new offers once this is true. */
  hasApprovedOffer?: boolean;
}

export function useMyArtworks() {
  return useApiGetList<ApiArtwork>(Paths.ArtworksMine);
}

// GET /artworks/mine/stats — ArtistPanel's "İstatistikler": per-artwork
// view counts, plus (when placed) that exhibition's all-time visitor total.
export function useArtistStats() {
  return useApiGetList<ApiArtistArtworkStats>(
    `${Paths.ArtworksMine}/stats`,
    [Paths.ArtworksMine, 'stats'],
  );
}

// GET /artworks — fully public list (LISTED/IN_EXHIBITION only), no
// organization scoping. Not currently used by any screen (no general
// "browse all art" page yet) — kept for that future use.
export function usePublicArtworks() {
  return useApiGetList<ApiArtwork>(Paths.Artworks);
}

// GET /artworks/organization — the curator panel's actual artwork picker
// for placement (cross-artist curation *within their own org's roster*
// only, since artists now belong to an Organization via curator invite).
export function useOrganizationArtworks() {
  return useApiGetList<ApiArtwork>(`${Paths.Artworks}/organization`, [Paths.Artworks, 'organization']);
}

export function useArtworkMutations() {
  return useApiMutations<ApiArtwork>(Paths.Artworks, [Paths.ArtworksMine]);
}

// POST /artworks/upload-image (multipart) — uploads to the caller's own
// Cloudinary folder (VEA/<env>/artworks/<slugified-artist-name>) and hands
// back a secure_url the caller submits as ApiArtwork.imageUrl in a normal
// create/update call. Doesn't touch any Artwork row itself, so no cache to
// invalidate here.
export function useUploadArtworkImage() {
  return useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      return postFormData<{ url: string }>(`${Paths.Artworks}/upload-image`, formData);
    },
  });
}

export function useSetArtworkStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: OwnerSettableArtworkStatus }) =>
      patch<ApiArtwork>({ path: `${Paths.Artworks}/${id}/status`, payload: { status } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [Paths.ArtworksMine] }),
  });
}

// PATCH /artworks/:id/unarchive — reactivates an ARCHIVED artwork back to
// LISTED. Never touches exhibition placement (an ARCHIVED artwork can't
// have a live ExhibitionArtwork link, see the backend's comment on
// ArtworksService.unarchive) — the artist has to place it in a show again
// themselves.
export function useUnarchiveArtwork() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => patch<ApiArtwork>({ path: `${Paths.Artworks}/${id}/unarchive` }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [Paths.ArtworksMine] }),
  });
}
