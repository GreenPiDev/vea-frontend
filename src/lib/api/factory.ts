import { useMutation, useQuery, useQueryClient, type QueryKey, type UseQueryOptions } from '@tanstack/react-query';
import { get, patch, post, remove } from './client';

/**
 * Generic REST-over-TanStack-Query wrappers, one factory per resource
 * instead of hand-rolled useQuery/useMutation boilerplate at every call
 * site. Adapted from a pattern used on another project (davinci-frontend's
 * utils/api/factory.ts) — same shape, `id` instead of `_id` since our
 * backend (Prisma cuid) doesn't use Mongo-style ids.
 */

export function useApiGet<T>(
  path: string,
  queryKey: QueryKey = [path],
  options?: Omit<UseQueryOptions<T>, 'queryKey' | 'queryFn'>,
) {
  return useQuery<T>({
    queryKey,
    queryFn: () => get<T>({ path }),
    staleTime: 60_000,
    ...options,
  });
}

export function useApiGetList<T>(
  path: string,
  queryKey: QueryKey = [path],
  options?: Omit<UseQueryOptions<T[]>, 'queryKey' | 'queryFn'>,
) {
  return useApiGet<T[]>(path, queryKey, options);
}

interface UpdatePayload<T> {
  id: string;
  updates: Partial<T>;
}

/**
 * Create/update/delete mutations for a resource, all invalidating the
 * given list queryKey on settle so the UI refetches automatically. No
 * optimistic-update/rollback machinery (unlike the reference project) —
 * add it per-resource later only where the UX actually needs it; most of
 * vea's write flows (offer accept, exhibition status) are state-machine
 * transitions where showing stale optimistic state would be misleading.
 */
export function useApiMutations<T extends { id: string }>(basePath: string, listQueryKey: QueryKey = [basePath]) {
  const queryClient = useQueryClient();

  const invalidate = () => queryClient.invalidateQueries({ queryKey: listQueryKey });

  const create = useMutation({
    mutationFn: (payload: Partial<T>) => post<T>({ path: basePath, payload }),
    onSuccess: invalidate,
  });

  const update = useMutation({
    mutationFn: ({ id, updates }: UpdatePayload<T>) => patch<T>({ path: `${basePath}/${id}`, payload: updates }),
    onSuccess: invalidate,
  });

  const remove_ = useMutation({
    mutationFn: (id: string) => remove<T>({ path: `${basePath}/${id}` }),
    onSuccess: invalidate,
  });

  return { create, update, remove: remove_ };
}
