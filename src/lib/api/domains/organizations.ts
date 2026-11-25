// SUPERADMIN-only resource: creating Organizations and assigning ADMIN
// users to them. Same factory pattern as domains/exhibitions.ts for the
// list/create part; the nested /organizations/:id/admins endpoints are
// hand-written mutations (same precedent as useSetArtworkStatus/useCreateOffer)
// since they don't fit the flat-basePath CRUD factory.
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Paths } from '../paths';
import { post, remove } from '../client';
import { useApiGet, useApiGetList, useApiGetPaged, useApiMutations } from '../factory';
import type { ListQueryParams } from '../paged';
import type { ArtistDecision, OfferStatus } from './offers';
import type { ArtworkCategory, ArtworkStatus } from './artworks';
import type { ApiExhibition } from './exhibitions';

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
  return useApiMutations<ApiOrganization>(Paths.Organizations, undefined, {
    create: { successKey: 'toastOrganizationCreateSuccess', errorKey: 'toastOrganizationCreateError' },
    update: { successKey: 'toastOrganizationUpdateSuccess', errorKey: 'toastOrganizationUpdateError' },
    remove: { successKey: 'toastOrganizationDeleteSuccess', errorKey: 'toastOrganizationDeleteError' },
  });
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
    // Prefix match: refreshes the admin list, the detail page's KPI counts
    // and the organizations table's admin-count column together.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [Paths.Organizations] }),
    meta: { successKey: 'toastOrgAdminAddSuccess', errorKey: 'toastOrgAdminAddError' },
  });
}

export function useRemoveOrgAdmin(organizationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) =>
      remove<void>({ path: `${Paths.Organizations}/${organizationId}/admins/${userId}` }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [Paths.Organizations] }),
    meta: { successKey: 'toastOrgAdminRemoveSuccess', errorKey: 'toastOrgAdminRemoveError' },
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
    meta: { successKey: 'toastOrgArtistAddSuccess', errorKey: 'toastOrgArtistAddError' },
  });
}

export function useRemoveMyOrgArtist() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) =>
      remove<void>({ path: `${Paths.Organizations}/mine/artists/${userId}` }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: MINE_ARTISTS_KEY }),
    meta: { successKey: 'toastOrgArtistRemoveSuccess', errorKey: 'toastOrgArtistRemoveError' },
  });
}

// ---- SUPERADMIN organization detail page (read-only) ----------------------
// Mirrors vea-api's OrganizationsService.getOverview /
// listExhibitionsForOverview / listArtistsForOverview. Amounts are minor
// units (the API serializes its BIGINT money columns as plain numbers).

export interface ApiOrganizationOverview {
  id: string;
  name: string;
  createdAt: string;
  /** exhibitions excludes soft-deleted ones; artists = SELLER users of the org. */
  counts: { admins: number; exhibitions: number; artists: number };
}

export interface ApiOrgOverviewExhibition {
  id: string;
  title: string;
  status: ApiExhibition['status'];
  startDate: string;
  endDate: string;
  createdAt: string;
  /** Non-null = soft-deleted by a curator; still listed (flagged) for investigation. */
  deletedAt: string | null;
  curator: { email: string };
  /** Set for a solo show pinned to one artist. */
  artistProfile: { displayName: string } | null;
  /** visitEvents = all-time EXHIBITION_ENTER count, same as the curator's stats screen. */
  _count: { artworkLinks: number; visitEvents: number };
}

export interface ApiOrgOverviewOffer {
  id: string;
  amount: number;
  currency: string;
  status: OfferStatus;
  artistDecision: ArtistDecision | null;
  createdAt: string;
  buyer: { email: string };
}

export interface ApiOrgOverviewArtwork {
  id: string;
  title: string;
  status: ArtworkStatus;
  priceAmount: number;
  currency: string;
  createdAt: string;
  offers: ApiOrgOverviewOffer[];
}

export interface ApiOrgOverviewArtist {
  id: string;
  email: string;
  createdAt: string;
  /** Null until the invited artist creates their profile. */
  artistProfile: { id: string; displayName: string; artworks: ApiOrgOverviewArtwork[] } | null;
}

export function useOrganizationOverview(organizationId: string) {
  return useApiGet<ApiOrganizationOverview>(
    `${Paths.Organizations}/${organizationId}`,
    [Paths.Organizations, organizationId, 'overview'],
    { enabled: !!organizationId },
  );
}

// The three lists below are server-side paginated/searchable: `params`
// comes from usePagedListState (page, pageSize, search + the filters typed
// here, mirroring vea-api's dto/org-overview-query.dto.ts).

export type OrgExhibitionFilters = {
  status?: ApiExhibition['status'];
  /** Omitted = live and soft-deleted together. */
  deleted?: 'exclude' | 'only';
};

export type OrgArtistFilters = {
  show?: 'pending-offers' | 'no-profile';
};

export type OrgOfferFilters = {
  status?: OfferStatus;
  /** NONE = the artist hasn't decided yet. */
  decision?: ArtistDecision | 'NONE';
};

export function useOrganizationExhibitionsOverview(organizationId: string, params: ListQueryParams) {
  return useApiGetPaged<ApiOrgOverviewExhibition>(
    `${Paths.Organizations}/${organizationId}/exhibitions`,
    [Paths.Organizations, organizationId, 'exhibitions'],
    params,
    { enabled: !!organizationId },
  );
}

export function useOrganizationArtistsOverview(organizationId: string, params: ListQueryParams) {
  return useApiGetPaged<ApiOrgOverviewArtist>(
    `${Paths.Organizations}/${organizationId}/artists-overview`,
    [Paths.Organizations, organizationId, 'artists-overview'],
    params,
    { enabled: !!organizationId },
  );
}

export type TransactionStatus = 'PENDING' | 'HELD' | 'RELEASED' | 'REFUNDED' | 'FAILED';

/** One org-wide offer with everything needed to follow it end to end. */
export interface ApiOrgOverviewOfferRow {
  id: string;
  amount: number;
  currency: string;
  status: OfferStatus;
  artistDecision: ArtistDecision | null;
  /** Snapshotted when payment is held; null before that. */
  commissionAmount: number | null;
  commissionTaxAmount: number | null;
  createdAt: string;
  respondedAt: string | null;
  buyer: { email: string };
  artwork: { id: string; title: string; artistDisplayName: string; artistProfile: { displayName: string } };
  /** Payment record; null until the buyer pays. */
  transaction: {
    status: TransactionStatus;
    provider: string;
    providerRef: string | null;
    heldAt: string | null;
    releasedAt: string | null;
  } | null;
}

export function useOrganizationOffersOverview(organizationId: string, params: ListQueryParams) {
  return useApiGetPaged<ApiOrgOverviewOfferRow>(
    `${Paths.Organizations}/${organizationId}/offers`,
    [Paths.Organizations, organizationId, 'offers'],
    params,
    { enabled: !!organizationId },
  );
}

// ---- Curator's artist detail page (/dashboard/organization/artists/:id) ----
// Mirrors vea-api's OrganizationsService.getArtistDetail — one payload
// (profile + every artwork + every offer) the page derives its KPIs and both
// tabs from, so switching tabs never refetches.

export interface ApiArtistDetailOffer {
  id: string;
  amount: number;
  currency: string;
  status: OfferStatus;
  artistDecision: ArtistDecision | null;
  commissionAmount: number | null;
  commissionTaxAmount: number | null;
  createdAt: string;
  respondedAt: string | null;
  buyer: { email: string; name: string | null };
  transaction: ApiOrgOverviewOfferRow['transaction'];
}

export interface ApiArtistDetailArtwork {
  id: string;
  title: string;
  artistDisplayName: string;
  technique: string | null;
  yearCreated: number | null;
  heightCm: number;
  widthCm: number;
  category: ArtworkCategory;
  priceAmount: number;
  maxDiscountPercent: number | null;
  currency: string;
  imageUrl: string;
  status: ArtworkStatus;
  createdAt: string;
  exhibitionLinks: {
    exhibition: { id: string; title: string; status: ApiExhibition['status']; deletedAt: string | null };
  }[];
  /** visitEvents = distinct ARTWORK_VIEW sessions. */
  _count: { visitEvents: number };
  offers: ApiArtistDetailOffer[];
}

export interface ApiArtistDetail {
  id: string;
  email: string;
  name: string | null;
  phone: string | null;
  createdAt: string;
  /** Null until the invited artist creates their profile. */
  artistProfile: {
    id: string;
    displayName: string;
    bio: string | null;
    institutionName: string | null;
    verified: boolean;
    createdAt: string;
    artworks: ApiArtistDetailArtwork[];
  } | null;
}

export function useMyOrgArtist(userId: string) {
  return useApiGet<ApiArtistDetail>(
    `${Paths.Organizations}/mine/artists/${userId}`,
    [...MINE_ARTISTS_KEY, userId],
    { enabled: !!userId },
  );
}
