import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  useOrganizationExhibitionsOverview,
  type ApiOrgOverviewExhibition,
  type OrgExhibitionFilters,
} from '../../lib/api/domains/organizations';
import { usePagedListState } from '../../lib/usePagedListState';
import type { GenericTableColumn } from '../common/GenericTable';
import PagedList, { type PagedListFilter } from '../common/PagedList';
import Tooltip from '../layout/Tooltip';
import { PreviewIcon } from '../layout/icons';
import { EXHIBITION_STATUS_KEYS, formatDate } from './orgDetailFormat';

// "Sergiler" tab of OrganizationDetailPage — every exhibition of the
// organization, curator-deleted ones included (dimmed + "Silindi") so the
// platform owner can see what existed when investigating a problem.
// Server-side search/filter/paging via the shared PagedList; "Görüntüle"
// opens the exhibition in the 3D preview (DRAFT/deleted included).
export default function OrgDetailExhibitionsTab({ organizationId }: { organizationId: string }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const list = usePagedListState<OrgExhibitionFilters>({});
  const query = useOrganizationExhibitionsOverview(organizationId, list.params);

  const filters: PagedListFilter<OrgExhibitionFilters>[] = [
    {
      key: 'status',
      label: t('orgDetailExhColStatus'),
      options: (['DRAFT', 'ACTIVE', 'ENDED'] as const).map((status) => ({
        value: status,
        label: t(EXHIBITION_STATUS_KEYS[status]),
      })),
    },
    {
      key: 'deleted',
      label: t('orgDetailExhFilterDeleted'),
      options: [
        { value: 'exclude', label: t('orgDetailExhFilterDeletedExclude') },
        { value: 'only', label: t('orgDetailExhFilterDeletedOnly') },
      ],
    },
  ];

  const columns: GenericTableColumn<ApiOrgOverviewExhibition>[] = [
    {
      key: 'title',
      header: t('orgDetailExhColTitle'),
      render: (exhibition) => (
        <>
          <p className="font-medium text-brand-900">{exhibition.title}</p>
          {exhibition.artistProfile && (
            <p className="text-xs text-brand-500">
              {t('orgDetailExhSolo', { name: exhibition.artistProfile.displayName })}
            </p>
          )}
        </>
      ),
    },
    {
      key: 'status',
      header: t('orgDetailExhColStatus'),
      render: (exhibition) => (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-brand-700">{t(EXHIBITION_STATUS_KEYS[exhibition.status])}</span>
          {exhibition.deletedAt && (
            <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">
              {t('orgDetailExhDeleted')}
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'dates',
      header: t('orgDetailExhColDates'),
      render: (exhibition) => (
        <span className="whitespace-nowrap text-brand-700">
          {formatDate(exhibition.startDate, i18n.language)} – {formatDate(exhibition.endDate, i18n.language)}
        </span>
      ),
    },
    {
      key: 'artworks',
      header: t('orgDetailExhColArtworks'),
      render: (exhibition) => <span className="tabular-nums text-brand-700">{exhibition._count.artworkLinks}</span>,
    },
    {
      key: 'visitors',
      header: t('orgDetailExhColVisitors'),
      render: (exhibition) => <span className="tabular-nums text-brand-700">{exhibition._count.visitEvents}</span>,
    },
    {
      key: 'curator',
      header: t('orgDetailExhColCurator'),
      render: (exhibition) => <span className="text-brand-700">{exhibition.curator.email}</span>,
    },
    {
      key: 'actions',
      header: t('artworkListColActions'),
      render: (exhibition) => (
        <Tooltip label={t('orgDetailExhView')} placement="top">
          <button
            type="button"
            aria-label={t('orgDetailExhView')}
            onClick={() =>
              navigate(`/dashboard/admin/organizations/${organizationId}/exhibitions/${exhibition.id}/preview`)
            }
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-md border border-brand-300 text-brand-700 transition-colors hover:bg-brand-100 hover:text-brand-900"
          >
            <PreviewIcon className="h-4 w-4" />
          </button>
        </Tooltip>
      ),
    },
  ];

  return (
    <PagedList
      list={list}
      query={query}
      searchPlaceholder={t('orgDetailExhSearch')}
      filters={filters}
      columns={columns}
      getRowKey={(exhibition) => exhibition.id}
      emptyMessage={t('orgDetailExhEmpty')}
      getRowClassName={(exhibition) => (exhibition.deletedAt ? 'opacity-60' : '')}
    />
  );
}
