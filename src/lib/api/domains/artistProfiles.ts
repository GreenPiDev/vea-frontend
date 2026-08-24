// Artist profile is a singleton-per-user resource (create once, then
// GET /me) — doesn't fit the generic list-based CRUD factory, so it's
// hand-written like domains/auth.ts.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Paths } from '../paths';
import { ApiError, get, patch, post } from '../client';

export interface ApiArtistProfile {
  id: string;
  userId: string;
  displayName: string;
  bio: string | null;
  institutionName: string | null;
  createdAt: string;
}

export interface CreateArtistProfilePayload {
  displayName: string;
  bio?: string;
  institutionName?: string;
}

export function useMyArtistProfile(options?: { enabled?: boolean }) {
  return useQuery<ApiArtistProfile>({
    queryKey: [Paths.ArtistProfileMe],
    queryFn: () => get<ApiArtistProfile>({ path: Paths.ArtistProfileMe }),
    retry: (failureCount, error) => error instanceof ApiError && error.status === 404 ? false : failureCount < 2,
    ...options,
  });
}

export function useCreateArtistProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateArtistProfilePayload) =>
      post<ApiArtistProfile>({ path: Paths.ArtistProfiles, payload }),
    onSuccess: (profile) => {
      queryClient.setQueryData([Paths.ArtistProfileMe], profile);
    },
  });
}

// Only `bio` is editable — see vea-api's UpdateArtistProfileDto for why
// displayName/institutionName aren't included here.
export function useUpdateArtistProfileBio() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (bio: string) =>
      patch<ApiArtistProfile>({ path: Paths.ArtistProfileMe, payload: { bio } }),
    onSuccess: (profile) => {
      queryClient.setQueryData([Paths.ArtistProfileMe], profile);
    },
  });
}
