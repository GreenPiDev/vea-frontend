// Artist -> curator "please take my artwork off this exhibition" flow. The
// artist can't archive an artwork directly while it's placed in a show
// (vea-api's ArtworksService.archive 409s) — they send a message here
// instead, an org admin approves/rejects with their own message, and
// approval both removes the ExhibitionArtwork link and archives the
// artwork server-side in one transaction (see ArtworkRemovalRequestsService).
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Paths } from '../paths';
import { patch, post } from '../client';
import { useApiGetList } from '../factory';
import type { ApiArtwork } from './artworks';
import type { ApiExhibition } from './exhibitions';

export type RemovalRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
export type RemovalDecision = 'APPROVED' | 'REJECTED';

export interface ApiArtworkRemovalRequest {
  id: string;
  artworkId: string;
  exhibitionId: string;
  requestedById: string;
  message: string;
  status: RemovalRequestStatus;
  responseMessage: string | null;
  decidedById: string | null;
  createdAt: string;
  respondedAt: string | null;
  /** Only present on GET /artwork-removal-requests/organization (admin, org-wide). */
  artwork?: ApiArtwork;
  exhibition?: ApiExhibition;
  requestedBy?: { id: string; email: string; name: string | null };
}

interface CreateRemovalRequestPayload {
  artworkId: string;
  exhibitionId: string;
  message: string;
}

// Invalidates ArtworksMine too, not just its own resource — GET /artworks/mine
// embeds each artwork's own pending request (see ApiArtwork.removalRequests)
// so ArtworkList.tsx's "request pending" badge shows up immediately.
export function useCreateRemovalRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateRemovalRequestPayload) =>
      post<ApiArtworkRemovalRequest>({ path: Paths.ArtworkRemovalRequests, payload }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [Paths.ArtworksMine] });
    },
  });
}

// Admin's org-wide view (GET /artwork-removal-requests/organization).
export function useOrganizationRemovalRequests() {
  return useApiGetList<ApiArtworkRemovalRequest>(
    `${Paths.ArtworkRemovalRequests}/organization`,
    [Paths.ArtworkRemovalRequests, 'organization'],
  );
}

export function useDecideRemovalRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      decision,
      responseMessage,
    }: {
      id: string;
      decision: RemovalDecision;
      responseMessage: string;
    }) =>
      patch<ApiArtworkRemovalRequest>({
        path: `${Paths.ArtworkRemovalRequests}/${id}/decision`,
        payload: { decision, responseMessage },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [Paths.ArtworkRemovalRequests, 'organization'] });
    },
  });
}
