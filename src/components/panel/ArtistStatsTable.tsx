import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useArtistStats, type ApiArtistArtworkStats } from '../../lib/api/domains/artworks';
import GenericTable, { type GenericTableColumn } from '../common/GenericTable';

type ExhibitionStatRow = NonNullable<ApiArtistArtworkStats['exhibition']>;

// The artist's own view-count analytics, split into two flat tables (no
// collapsible needed — one row per artwork/exhibition, nothing nested to
// hide): per-artwork view counts, and per-exhibition visitor totals
// (deduplicated — several of this artist's artworks can share the same
// exhibition, so the raw /artist-stats rows aren't 1:1 with exhibitions).
// Only ever shows this artist's own numbers, even for an exhibition's total
// visitor count (that's public/aggregate, not another artist's private
// data) — but never another artist's artwork-level view counts, matching
// the same visibility boundary as the offers feature (ArtistOfferTable.tsx).
export default function ArtistStatsTable() {
  const { t } = useTranslation();
  const { data: stats, isLoading } = useArtistStats();

  const exhibitions = useMemo(() => {
    const byId = new Map<string, ExhibitionStatRow>();
    for (const row of stats ?? []) {
      if (row.exhibition) byId.set(row.exhibition.id, row.exhibition);
    }
    return Array.from(byId.values());
  }, [stats]);

  const artworkColumns: GenericTableColumn<ApiArtistArtworkStats>[] = [
    {
      key: 'artwork',
      header: t('artistStatsArtwork'),
      render: (row) => <span className="font-medium text-brand-900">{row.title}</span>,
    },
    {
      key: 'views',
      header: t('artistStatsViews'),
      render: (row) => <span className="text-brand-900">{row.viewCount}</span>,
    },
    {
      key: 'exhibition',
      header: t('artistStatsExhibition'),
      render: (row) =>
        row.exhibition ? (
          <span className="text-brand-700">{row.exhibition.title}</span>
        ) : (
          <span className="text-xs text-brand-500">{t('artistStatsNoExhibition')}</span>
        ),
    },
  ];

  const exhibitionColumns: GenericTableColumn<ExhibitionStatRow>[] = [
    {
      key: 'exhibition',
      header: t('artistStatsExhibitionCol'),
      render: (row) => <span className="font-medium text-brand-900">{row.title}</span>,
    },
    {
      key: 'visitors',
      header: t('artistStatsVisitorsCol'),
      render: (row) => <span className="text-brand-900">{row.totalVisitors}</span>,
    },
  ];

  if (isLoading) return null;

  if (!stats || stats.length === 0) {
    return <p className="text-sm text-brand-200">{t('statsEmpty')}</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold text-white">{t('artistStatsArtworksSectionTitle')}</h3>
        <GenericTable
          columns={artworkColumns}
          data={stats}
          getRowKey={(row) => row.artworkId}
          emptyMessage={t('statsEmpty')}
        />
      </div>

      <div className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold text-white">{t('artistStatsExhibitionsSectionTitle')}</h3>
        <GenericTable
          columns={exhibitionColumns}
          data={exhibitions}
          getRowKey={(row) => row.id}
          emptyMessage={t('artistStatsExhibitionsEmpty')}
        />
      </div>
    </div>
  );
}
