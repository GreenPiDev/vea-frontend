// Auth domain hooks, following the same factory-based pattern as
// domains/exhibitions.ts. Auth doesn't fit the generic CRUD factory
// (request-code/verify-code aren't create/update/remove on a resource),
// so these are hand-written mutations/query on top of the same
// get/post primitives from ../client.
import { Paths } from '../paths';
import { get, post } from '../client';
import { useMutation, useQuery, type UseQueryOptions } from '@tanstack/react-query';

export interface ApiUser {
  id: string;
  email: string;
  phone: string | null;
  role: 'VISITOR' | 'ARTIST' | 'INSTITUTION' | 'ADMIN' | 'SUPERADMIN';
  /** Set for ADMIN (which org's shared exhibition pool they manage) and for
   * ARTIST (which org's curator invited them) — null otherwise. */
  organizationId: string | null;
  /** Same scope as organizationId; the nested object so the org's display
   * name is available without a second request (e.g. auto-filling an
   * invited artist's "Kurum Adı" field). */
  organization: { id: string; name: string } | null;
  createdAt: string;
}

export function useRequestCode() {
  return useMutation({
    mutationFn: (email: string) => post<{ status: string }>({ path: Paths.AuthRequestCode, payload: { email } }),
  });
}

export function useVerifyCode() {
  return useMutation({
    mutationFn: ({ email, code }: { email: string; code: string }) =>
      post<{ accessToken: string }>({ path: Paths.AuthVerifyCode, payload: { email, code } }),
  });
}

export function useCurrentUser(options?: Omit<UseQueryOptions<ApiUser>, 'queryKey' | 'queryFn'>) {
  return useQuery<ApiUser>({
    queryKey: [Paths.AuthMe],
    queryFn: () => get<ApiUser>({ path: Paths.AuthMe }),
    staleTime: 60_000,
    retry: false,
    ...options,
  });
}
