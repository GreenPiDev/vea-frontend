// Shared types/helpers for server-side paginated + searchable lists —
// mirrors vea-api's common/pagination (Paginated<T>, PagedQueryDto).
// Consumed through factory.ts's useApiGetPaged and the shared
// usePagedListState hook + <PagedList> component, so search/filter/paging
// is written once, not per screen.

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

/** page/pageSize/search plus each list's own filters; undefined/'' = not sent. */
export type ListQueryParams = Record<string, string | number | undefined>;

export function withQuery(path: string, params: ListQueryParams): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === '') continue;
    search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `${path}?${query}` : path;
}
