import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMyExhibitions, useExhibitionStats, type ApiExhibition, type ApiExhibitionStats } from '../../lib/api/domains/exhibitions';
import { useOrganizationOffers } from '../../lib/api/domains/offers';
import GenericTable, { type GenericTableColumn } from '../common/GenericTable';

type ExhibitionArtworkStatRow = ApiExhibitionStats['artworks'][number];

// Total-visitors cell: unlike the per-artwork breakdown (only fetched for
// whichever single row is expanded), the visitor count sits in the outer
// table itself, so every row needs its own stats fetch regardless of
// expansion state — one useExhibitionStats call per row (same "N
// independent hook calls via a per-row component" pattern as
// ExhibitionSelectCard.tsx's watcher count). TanStack Query dedupes this
// against the expanded row's own fetch of the same exhibition, so expanding
// a row doesn't trigger a second network call.
function VisitorCountCell({ exhibitionId }: { exhibitionId: string }) {
  const { data: stats, isLoading } = useExhibitionStats(exhibitionId);
  return <span className="text-brand-900">{isLoading || !stats ? '…' : stats.totalVisitors}</span>;
}

// Curator's org-wide analytics: one row per exhibition (title + total
// visitors), expandable in place (GenericTable's `expandable` — a toggle
// column + a full-width sub-row) to that exhibition's per-artwork view
// breakdown, fetched lazily on expand (useExhibitionStats is called once
// here, for whichever single exhibition is currently expanded, not per-row
// — only one open at a time). Row-level expansion is deliberate here
// (unlike ArtistStatsTable's two flat tables): a curator can have many
// exhibitions, each with many artworks, and a single un-nested table mixing
// every exhibition's paintings together would be unreadable.
export default function ExhibitionStatsList() {
  const { t } = useTranslation();
  // Always includeRemoved — a soft-deleted (kaldırılmış) exhibition must
  // never drop out of the curator's own analytics, that's the entire point
  // of soft delete over a hard one (see vea-api's Exhibition.deletedAt).
  const { data: exhibitions, isLoading } = useMyExhibitions(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const { data: stats, isLoading: statsLoading } = useExhibitionStats(expandedId ?? '');
  // Offer counts are derived client-side from the same org-wide offer list
  // OrgOfferTable.tsx already fetches — no dedicated backend aggregate
  // exists (or is needed) for this.
  const { data: offers } = useOrganizationOffers();

  const offerCountsByArtwork = useMemo(() => {
    const map = new Map<string, number>();
    for (const offer of offers ?? []) {
      map.set(offer.artworkId, (map.get(offer.artworkId) ?? 0) + 1);
    }
    return map;
  }, [offers]);

  const offerCountsByExhibition = useMemo(() => {
    const map = new Map<string, number>();
    for (const offer of offers ?? []) {
      for (const link of offer.artwork?.exhibitionLinks ?? []) {
        map.set(link.exhibition.id, (map.get(link.exhibition.id) ?? 0) + 1);
      }
    }
    return map;
  }, [offers]);

  const columns: GenericTableColumn<ApiExhibition>[] = [
    {
      key: 'exhibition',
      header: t('artistStatsExhibitionCol'),
      render: (exhibition) => <span className="font-medium text-brand-900">{exhibition.title}</span>,
    },
    {
      key: 'visitors',
      header: t('artistStatsVisitorsCol'),
      render: (exhibition) => <VisitorCountCell exhibitionId={exhibition.id} />,
    },
    {
      key: 'offers',
      header: t('statsOfferCount'),
      render: (exhibition) => (
        <span className="text-brand-900">{offerCountsByExhibition.get(exhibition.id) ?? 0}</span>
      ),
    },
  ];

  const artworkColumns: GenericTableColumn<ExhibitionArtworkStatRow>[] = [
    {
      key: 'artwork',
      header: t('artistStatsArtwork'),
      render: (artwork) => <span className="text-brand-900">{artwork.title}</span>,
    },
    {
      key: 'views',
      header: t('statsArtworkViews'),
      render: (artwork) => <span className="text-brand-900">{artwork.viewCount}</span>,
    },
    {
      key: 'offers',
      header: t('statsOfferCount'),
      render: (artwork) => (
        <span className="text-brand-900">{offerCountsByArtwork.get(artwork.artworkId) ?? 0}</span>
      ),
    },
  ];

  return (
    <GenericTable
      columns={columns}
      data={exhibitions}
      getRowKey={(exhibition) => exhibition.id}
      isLoading={isLoading}
      emptyMessage={t('statsEmpty')}
      expandable={{
        isExpanded: (exhibition) => expandedId === exhibition.id,
        onToggle: (exhibition) => setExpandedId(expandedId === exhibition.id ? null : exhibition.id),
        renderExpanded: (exhibition) => {
          if (expandedId !== exhibition.id) return null;
          if (statsLoading) return <p className="text-xs text-brand-500">…</p>;
          if (!stats) return null;

          return (
            <GenericTable
              columns={artworkColumns}
              data={stats.artworks}
              getRowKey={(artwork) => artwork.artworkId}
              emptyMessage={t('statsEmpty')}
            />
          );
        },
      }}
    />
  );
}
