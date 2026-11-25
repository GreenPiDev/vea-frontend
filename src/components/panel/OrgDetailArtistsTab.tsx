import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  useOrganizationArtistsOverview,
  type ApiOrgOverviewArtist,
  type ApiOrgOverviewArtwork,
  type ApiOrgOverviewOffer,
  type OrgArtistFilters,
} from '../../lib/api/domains/organizations';
import { usePagedListState } from '../../lib/usePagedListState';
import GenericTable, { type GenericTableColumn } from '../common/GenericTable';
import PagedList, { type PagedListFilter } from '../common/PagedList';
import ArtistDecisionBadge from './ArtistDecisionBadge';
import { OFFER_STATUS_KEYS, formatAmount } from './offerDisplay';
import { ARTWORK_STATUS_KEYS, artistOfferCount, formatDate, pendingOfferCount } from './orgDetailFormat';

// "Sanatçılar" tab of OrganizationDetailPage — the drill-down for
// investigating a problem: artist → (expand) their artworks with price and
// status → (expand) the offers that artwork received, buyer included.
// One row open per level (single expanded id each), so the page never turns
// into a wall of nested tables. Artists are paginated/searched server-side
// through the shared PagedList; each page carries its artists' artworks and
// offers, so expanding a row doesn't refetch.
export default function OrgDetailArtistsTab({ organizationId }: { organizationId: string }) {
  const { t, i18n } = useTranslation();
  const list = usePagedListState<OrgArtistFilters>({});
  const query = useOrganizationArtistsOverview(organizationId, list.params);
  const [expandedArtistId, setExpandedArtistId] = useState<string | null>(null);
  const [expandedArtworkId, setExpandedArtworkId] = useState<string | null>(null);

  const offerColumns: GenericTableColumn<ApiOrgOverviewOffer>[] = [
    {
      key: 'date',
      header: t('orgDetailOfferColDate'),
      render: (offer) => <span className="whitespace-nowrap text-brand-700">{formatDate(offer.createdAt, i18n.language)}</span>,
    },
    {
      key: 'buyer',
      header: t('orgOfferBuyer'),
      render: (offer) => <span className="text-brand-700">{offer.buyer.email}</span>,
    },
    {
      key: 'amount',
      header: t('orgOfferAmount'),
      render: (offer) => <span className="whitespace-nowrap tabular-nums text-brand-900">{formatAmount(offer.amount, offer.currency)}</span>,
    },
    {
      key: 'status',
      header: t('orgOfferStatus'),
      render: (offer) => <span className="text-brand-700">{t(OFFER_STATUS_KEYS[offer.status])}</span>,
    },
    {
      key: 'decision',
      header: t('orgOfferArtistDecision'),
      render: (offer) => <ArtistDecisionBadge decision={offer.artistDecision} />,
    },
  ];

  const artworkColumns: GenericTableColumn<ApiOrgOverviewArtwork>[] = [
    {
      key: 'title',
      header: t('orgDetailArtworkColTitle'),
      render: (artwork) => <span className="font-medium text-brand-900">{artwork.title}</span>,
    },
    {
      key: 'price',
      header: t('orgDetailArtworkColPrice'),
      render: (artwork) => (
        <span className="whitespace-nowrap tabular-nums text-brand-900">{formatAmount(artwork.priceAmount, artwork.currency)}</span>
      ),
    },
    {
      key: 'status',
      header: t('orgDetailArtworkColStatus'),
      render: (artwork) => <span className="text-brand-700">{t(ARTWORK_STATUS_KEYS[artwork.status])}</span>,
    },
    {
      key: 'offers',
      header: t('orgDetailArtworkColOffers'),
      render: (artwork) => <span className="tabular-nums text-brand-700">{artwork.offers.length}</span>,
    },
    {
      key: 'created',
      header: t('orgDetailArtworkColCreated'),
      render: (artwork) => <span className="whitespace-nowrap text-brand-700">{formatDate(artwork.createdAt, i18n.language)}</span>,
    },
  ];

  const artistColumns: GenericTableColumn<ApiOrgOverviewArtist>[] = [
    {
      key: 'name',
      header: t('orgDetailArtistColName'),
      render: (artist) =>
        artist.artistProfile ? (
          <span className="font-medium text-brand-900">{artist.artistProfile.displayName}</span>
        ) : (
          <span className="text-xs text-brand-500">{t('artistProfilePending')}</span>
        ),
    },
    {
      key: 'email',
      header: t('orgDetailArtistColEmail'),
      render: (artist) => <span className="text-brand-700">{artist.email}</span>,
    },
    {
      key: 'artworks',
      header: t('orgDetailArtistColArtworks'),
      render: (artist) => <span className="tabular-nums text-brand-700">{artist.artistProfile?.artworks.length ?? 0}</span>,
    },
    {
      key: 'offers',
      header: t('orgDetailArtistColOffers'),
      render: (artist) => {
        const pending = pendingOfferCount(artist);
        return (
          <div className="flex items-center gap-2">
            <span className="tabular-nums text-brand-700">{artistOfferCount(artist)}</span>
            {pending > 0 && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                {t('orgDetailArtistPendingOffers', { count: pending })}
              </span>
            )}
          </div>
        );
      },
    },
    {
      key: 'joined',
      header: t('orgDetailArtistColJoined'),
      render: (artist) => <span className="whitespace-nowrap text-brand-700">{formatDate(artist.createdAt, i18n.language)}</span>,
    },
  ];

  const filters: PagedListFilter<OrgArtistFilters>[] = [
    {
      key: 'show',
      label: t('orgDetailArtistFilterShow'),
      options: [
        { value: 'pending-offers', label: t('orgDetailArtistFilterPendingOffers') },
        { value: 'no-profile', label: t('orgDetailArtistFilterNoProfile') },
      ],
    },
  ];

  function renderArtworks(artist: ApiOrgOverviewArtist) {
    if (!artist.artistProfile) {
      return <p className="text-sm text-brand-600">{t('orgDetailArtistNoProfile')}</p>;
    }
    return (
      <GenericTable
        columns={artworkColumns}
        data={artist.artistProfile.artworks}
        getRowKey={(artwork) => artwork.id}
        emptyMessage={t('orgDetailArtistNoArtworks')}
        expandable={{
          isExpanded: (artwork) => expandedArtworkId === artwork.id,
          onToggle: (artwork) => setExpandedArtworkId(expandedArtworkId === artwork.id ? null : artwork.id),
          renderExpanded: (artwork) =>
            artwork.offers.length === 0 ? (
              <p className="text-sm text-brand-600">{t('orgDetailOfferEmpty')}</p>
            ) : (
              <GenericTable
                columns={offerColumns}
                data={artwork.offers}
                getRowKey={(offer) => offer.id}
                emptyMessage={t('orgDetailOfferEmpty')}
              />
            ),
        }}
      />
    );
  }

  return (
    <PagedList
      list={list}
      query={query}
      searchPlaceholder={t('orgDetailArtistSearch')}
      filters={filters}
      columns={artistColumns}
      getRowKey={(artist) => artist.id}
      emptyMessage={t('orgDetailArtistEmpty')}
      expandable={{
        isExpanded: (artist) => expandedArtistId === artist.id,
        onToggle: (artist) => {
          setExpandedArtistId(expandedArtistId === artist.id ? null : artist.id);
          // A different artist's artworks are a different list — don't keep
          // an artwork row "open" that isn't on screen anymore.
          setExpandedArtworkId(null);
        },
        renderExpanded: renderArtworks,
      }}
    />
  );
}
