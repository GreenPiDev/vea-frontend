// Example domain module built on the generic factory (./lib/api/factory.ts).
// This is the reference pattern for wiring up any other resource
// (artworks, offers, artist-profiles): a `Paths` entry + a couple of typed
// hooks. Not a copy of `components/3d/exhibitions.ts` — that file is static
// local 3D-scene demo data with no backend involvement; this one talks to
// vea-api's real /exhibitions REST endpoints.
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Paths } from '../paths';
import { useApiGet, useApiGetList, useApiMutations } from '../factory';
import { patch, post, remove } from '../client';
import type { ApiArtwork } from './artworks';

// Mirrors vea-api's src/exhibitions/dto/scene-config.dto.ts discriminated
// union (keep the two in sync by hand, same cross-repo caveat as
// SOCKET_EVENTS). "template" points at one of components/3d/exhibitions.ts's
// EXHIBITIONS presets by id; "custom" is a user-drawn room.
export interface TemplateSceneConfig {
  kind: 'template';
  templateId: string;
}

export interface CustomSceneConfig {
  kind: 'custom';
  cells: { x: number; z: number }[];
  wallHeight: number;
  wallColor: string;
  floorColor: string;
  ceilingColor: string;
  textureIds?: { floor?: string; wall?: string; ceiling?: string };
  spawn: { x: number; z: number; yaw: number };
}

export type ApiSceneConfig = TemplateSceneConfig | CustomSceneConfig;

// Mirrors vea-api's src/exhibitions/dto/position-data.dto.ts. `order`
// deliberately isn't in here — it's ExhibitionArtwork's own top-level
// column/field, see ApiExhibitionArtwork below.
export interface ArtworkPositionData {
  wallRunId: string;
  /** Curator-set hang-center height override, in meters from the floor. Falls back to placeArtworksAlongWall()'s fixed floor-clearance formula when unset. */
  heightY?: number;
}

export interface ApiExhibitionArtwork {
  id: string;
  exhibitionId: string;
  artworkId: string;
  positionData: ArtworkPositionData | null;
  order: number | null;
  artwork: ApiArtwork;
}

export interface ApiExhibition {
  id: string;
  ownerProfileId: string;
  title: string;
  description: string | null;
  startDate: string;
  endDate: string;
  status: 'DRAFT' | 'ACTIVE' | 'ENDED';
  sceneConfig: ApiSceneConfig | null;
  createdAt: string;
  /** Only present on GET /exhibitions/:id (findOneForView) — list endpoints (usePublicExhibitions/useMyExhibitions) don't include it. */
  artworkLinks?: ApiExhibitionArtwork[];
}

export function usePublicExhibitions() {
  return useApiGetList<ApiExhibition>(Paths.Exhibitions);
}

export function useExhibition(id: string) {
  return useApiGet<ApiExhibition>(`${Paths.Exhibitions}/${id}`, [Paths.Exhibitions, id], {
    enabled: Boolean(id),
  });
}

export function useMyExhibitions() {
  return useApiGetList<ApiExhibition>(Paths.ExhibitionsMine);
}

// GET /exhibitions/mine/:id — owner-only full detail (any status, including
// DRAFT — unlike useExhibition/findOneForView, which 404s a DRAFT even for
// its owner). Needed so an artist can place artworks before ever
// publishing, see vea-api/CLAUDE.md's Faz 3d note.
export function useOwnExhibition(id: string) {
  return useApiGet<ApiExhibition>(`${Paths.ExhibitionsMine}/${id}`, [Paths.ExhibitionsMine, id], {
    enabled: Boolean(id),
  });
}

export function useExhibitionMutations() {
  return useApiMutations<ApiExhibition>(Paths.Exhibitions, [Paths.ExhibitionsMine]);
}

// Dedicated PATCH /exhibitions/:id/status endpoint (forward-only state
// machine on the backend: DRAFT->ACTIVE->ENDED) — not covered by the
// generic `update` mutation above, same pattern as artworks.ts's
// useSetArtworkStatus.
export function useSetExhibitionStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'ACTIVE' | 'ENDED' }) =>
      patch<ApiExhibition>({ path: `${Paths.Exhibitions}/${id}/status`, payload: { status } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [Paths.ExhibitionsMine] });
      // DRAFT->ACTIVE/ACTIVE->ENDED both change what the public list (GET
      // /exhibitions) returns — without this the gallery selector can keep
      // showing stale visibility for up to its 60s staleTime after a
      // publish, in the same browser tab that just published it.
      queryClient.invalidateQueries({ queryKey: [Paths.Exhibitions] });
    },
  });
}

// POST/DELETE /exhibitions/:id/artworks(/:artworkId) — wall placement
// mutations for Faz 3d's panel screen. All three invalidate both the
// owner-detail query (useOwnExhibition, so the panel's wall list refetches)
// and the public view-detail query (useExhibition — an artist previewing
// their own live gallery in the same tab right after editing placement
// would otherwise see stale positions for up to that query's staleTime,
// same class of bug as the earlier useSetExhibitionStatus staleness fix).
function invalidateExhibitionQueries(queryClient: ReturnType<typeof useQueryClient>, exhibitionId: string) {
  queryClient.invalidateQueries({ queryKey: [Paths.ExhibitionsMine, exhibitionId] });
  queryClient.invalidateQueries({ queryKey: [Paths.Exhibitions, exhibitionId] });
}

export function useAddExhibitionArtwork(exhibitionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: { artworkId: string; positionData: ArtworkPositionData; order: number }) =>
      post<ApiExhibitionArtwork>({ path: `${Paths.Exhibitions}/${exhibitionId}/artworks`, payload }),
    onSuccess: () => invalidateExhibitionQueries(queryClient, exhibitionId),
  });
}

// PATCH /exhibitions/:id/artworks/:artworkId — used to let the curator
// adjust an already-placed artwork's positionData (currently: heightY hang
// override) without removing and re-adding it.
export function useUpdateExhibitionArtworkLink(exhibitionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ artworkId, positionData }: { artworkId: string; positionData: ArtworkPositionData }) =>
      patch<ApiExhibitionArtwork>({
        path: `${Paths.Exhibitions}/${exhibitionId}/artworks/${artworkId}`,
        payload: { positionData },
      }),
    onSuccess: () => invalidateExhibitionQueries(queryClient, exhibitionId),
  });
}

export function useRemoveExhibitionArtwork(exhibitionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (artworkId: string) =>
      remove<void>({ path: `${Paths.Exhibitions}/${exhibitionId}/artworks/${artworkId}` }),
    onSuccess: () => invalidateExhibitionQueries(queryClient, exhibitionId),
  });
}
