// SUPERADMIN-only resource: creating Organizations and assigning ADMIN
// users to them. Same factory pattern as domains/exhibitions.ts for the
// list/create part; the nested /organizations/:id/admins endpoints are
// hand-written mutations (same precedent as useSetArtworkStatus/useCreateOffer)
// since they don't fit the flat-basePath CRUD factory.
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Paths } from '../paths';
import { post, remove } from '../client';
import { useApiGetList, useApiMutations } from '../factory';

export interface ApiOrganization {
  id: string;
  name: string;
  createdAt: string;
  /** Only present on GET /organizations (findAll's _count include) — admins is
   * filtered to role ADMIN (the relation itself covers ADMIN + ARTIST). */
  _count?: { admins: number; exhibitions: number };
}

export interface ApiOrgAdmin {
  id: string;
  email: string;
  name: string | null;
  role: string;
  createdAt: string;
  /** Only present on GET /organizations/mine/artists (listArtists' select) — null until the invited artist has created their ArtistProfile. Lets ExhibitionForm.tsx offer this artist for the exhibition's optional solo-show pin; artworkCount feeds OrgArtistList.tsx's roster table. */
  artistProfile?: { id: string; displayName: string; _count: { artworks: number } } | null;
}

export function useOrganizations() {
  return useApiGetList<ApiOrganization>(Paths.Organizations);
}

export function useOrganizationMutations() {
  return useApiMutations<ApiOrganization>(Paths.Organizations);
}

export function useOrgAdmins(organizationId: string) {
  return useApiGetList<ApiOrgAdmin>(
    `${Paths.Organizations}/${organizationId}/admins`,
    [Paths.Organizations, organizationId, 'admins'],
    { enabled: !!organizationId },
  );
}

export function useAddOrgAdmin(organizationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (email: string) =>
      post<ApiOrgAdmin>({ path: `${Paths.Organizations}/${organizationId}/admins`, payload: { email } }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: [Paths.Organizations, organizationId, 'admins'] }),
  });
}

export function useRemoveOrgAdmin(organizationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) =>
      remove<void>({ path: `${Paths.Organizations}/${organizationId}/admins/${userId}` }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: [Paths.Organizations, organizationId, 'admins'] }),
  });
}

// The curator's own roster of invited artists — "mine" (no organizationId
// param, backend derives it from the ADMIN's JWT), mirrors the admins
// hooks above but under /organizations/mine/artists.
export type ApiOrgArtist = ApiOrgAdmin;

const MINE_ARTISTS_KEY = [Paths.Organizations, 'mine', 'artists'];

export function useMyOrgArtists() {
  return useApiGetList<ApiOrgArtist>(`${Paths.Organizations}/mine/artists`, MINE_ARTISTS_KEY);
}

export function useAddMyOrgArtist() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (email: string) =>
      post<ApiOrgArtist>({ path: `${Paths.Organizations}/mine/artists`, payload: { email } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: MINE_ARTISTS_KEY }),
  });
}

export function useRemoveMyOrgArtist() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) =>
      remove<void>({ path: `${Paths.Organizations}/mine/artists/${userId}` }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: MINE_ARTISTS_KEY }),
  });
}
