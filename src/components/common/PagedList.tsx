import { useTranslation } from 'react-i18next';
import GenericTable, { type GenericTableColumn, type GenericTableExpandable } from './GenericTable';
import Pagination from './Pagination';
import type { Paginated } from '../../lib/api/paged';
import type { ListFilters, PagedListState } from '../../lib/usePagedListState';

export interface PagedListFilter<F extends ListFilters> {
  key: keyof F & string;
  label: string;
  /** The "all" choice (no filter) is added automatically as the first option. */
  options: { value: NonNullable<F[keyof F]>; label: string }[];
}

interface PagedListProps<T, F extends ListFilters> {
  list: PagedListState<F>;
  query: { data?: Paginated<T>; isLoading: boolean; isFetching: boolean };
  searchPlaceholder: string;
  filters?: PagedListFilter<F>[];
  columns: GenericTableColumn<T>[];
  getRowKey: (row: T) => string;
  /** Shown when the list is empty without any search/filter. */
  emptyMessage: string;
  expandable?: GenericTableExpandable<T>;
  onRowClick?: (row: T) => void;
  getRowClassName?: (row: T) => string;
}

// The single toolbar + table + pagination shell for server-side paginated
// lists. State comes from usePagedListState, data from useApiGetPaged — a
// screen only declares its columns, search placeholder and filter options,
// so search/filter/paging behaviour is identical everywhere and lives in
// one place.
export default function PagedList<T, F extends ListFilters>({
  list,
  query,
  searchPlaceholder,
  filters = [],
  columns,
  getRowKey,
  emptyMessage,
  expandable,
  onRowClick,
  getRowClassName,
}: PagedListProps<T, F>) {
  const { t } = useTranslation();
  const { data, isLoading, isFetching } = query;
  const fieldClass =
    'rounded-md border border-brand-300 bg-white px-3 py-2 text-sm text-brand-900 outline-none focus:border-brand-500';

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={list.searchInput}
          onChange={(e) => list.setSearchInput(e.target.value)}
          placeholder={searchPlaceholder}
          aria-label={searchPlaceholder}
          className={`${fieldClass} min-w-56 flex-1 sm:max-w-sm`}
        />
        {filters.map((filter) => (
          <select
            key={filter.key}
            aria-label={filter.label}
            value={list.filters[filter.key] ?? ''}
            onChange={(e) => list.setFilter(filter.key, (e.target.value || undefined) as F[typeof filter.key])}
            className={fieldClass}
          >
            <option value="">{t('listFilterAll', { label: filter.label })}</option>
            {filter.options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        ))}
        <span className="ml-auto text-xs text-brand-300" aria-live="polite">
          {isFetching && !isLoading ? t('listLoading') : data ? t('listResultCount', { count: data.total }) : ''}
        </span>
      </div>

      <GenericTable
        columns={columns}
        data={data?.items}
        getRowKey={getRowKey}
        isLoading={isLoading}
        emptyMessage={list.isFiltered ? t('listNoResults') : emptyMessage}
        expandable={expandable}
        onRowClick={onRowClick}
        getRowClassName={getRowClassName}
      />

      {data && (
        <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPageChange={list.setPage} />
      )}
    </div>
  );
}
