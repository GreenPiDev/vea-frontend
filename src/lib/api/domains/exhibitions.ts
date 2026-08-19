// Example domain module built on the generic factory (./lib/api/factory.ts).
// This is the reference pattern for wiring up any other resource
// (artworks, offers, artist-profiles): a `Paths` entry + a couple of typed
// hooks. Not a copy of `components/3d/exhibitions.ts` — that file is static
// local 3D-scene demo data with no backend involvement; this one talks to
// vea-api's real /exhibitions REST endpoints.
import { Paths } from '../paths';
import { useApiGet, useApiGetList, useApiMutations } from '../factory';

export interface ApiExhibition {
  id: string;
  ownerProfileId: string;
  title: string;
  description: string | null;
  startDate: string;
  endDate: string;
  status: 'DRAFT' | 'ACTIVE' | 'ENDED';
  sceneConfig: Record<string, unknown> | null;
  createdAt: string;
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

export function useExhibitionMutations() {
  return useApiMutations<ApiExhibition>(Paths.Exhibitions);
}
