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
}

export interface ApiOrgAdmin {
  id: string;
  email: string;
  name: string | null;
  role: string;
  createdAt: string;
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
