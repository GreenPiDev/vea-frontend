import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ListQueryParams } from './api/paged';

export const SEARCH_DEBOUNCE_MS = 300;
export const DEFAULT_LIST_PAGE_SIZE = 20;

export type ListFilters = Record<string, string | undefined>;

export interface PagedListState<F extends ListFilters> {
  /** What's in the search box right now (updates on every keystroke). */
  searchInput: string;
  setSearchInput: (value: string) => void;
  /** Debounced + trimmed — what is actually sent to the server. */
  search: string;
  filters: F;
  setFilter: <K extends keyof F>(key: K, value: F[K]) => void;
  page: number;
  setPage: (page: number) => void;
  pageSize: number;
  /** Ready for useApiGetPaged: page, pageSize, search and the filters. */
  params: ListQueryParams;
  /** A search or any filter is active — lists show "no results" instead of "empty". */
  isFiltered: boolean;
}

// The one place server-side list state (search box, filters, page) lives,
// so every paginated table behaves the same: search is debounced
// (SEARCH_DEBOUNCE_MS) so typing doesn't fire a request per key, and
// changing the search or a filter jumps back to page 1 (page 3 of the old
// result set usually doesn't exist in the new one). Pair with
// useApiGetPaged (data) and <PagedList> (UI).
export function usePagedListState<F extends ListFilters>(
  initialFilters: F,
  pageSize: number = DEFAULT_LIST_PAGE_SIZE,
): PagedListState<F> {
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<F>(initialFilters);
  const [page, setPage] = useState(1);

  useEffect(() => {
    const id = setTimeout(() => setSearch(searchInput.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [searchInput]);

  // A new (debounced) search term is a new result set — start from page 1.
  // Keyed on the trimmed term, so typing a trailing space doesn't reset.
  useEffect(() => {
    setPage(1);
  }, [search]);

  const setFilter = useCallback(<K extends keyof F>(key: K, value: F[K]) => {
    setFilters((current) => ({ ...current, [key]: value || undefined }));
    setPage(1);
  }, []);

  const params = useMemo<ListQueryParams>(
    () => ({ page, pageSize, search: search || undefined, ...filters }),
    [page, pageSize, search, filters],
  );

  const isFiltered = search !== '' || Object.values(filters).some((value) => value !== undefined && value !== '');

  return { searchInput, setSearchInput, search, filters, setFilter, page, setPage, pageSize, params, isFiltered };
}
