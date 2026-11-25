import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  useOrganizationOffersOverview,
  type ApiOrgOverviewOfferRow,
  type OrgOfferFilters,
} from '../../lib/api/domains/organizations';
import type { OfferStatus } from '../../lib/api/domains/offers';
import { usePagedListState } from '../../lib/usePagedListState';
import type { GenericTableColumn } from '../common/GenericTable';
import PagedList, { type PagedListFilter } from '../common/PagedList';
import ArtistDecisionBadge from './ArtistDecisionBadge';
import OfferDetailsPanel from './OfferDetailsPanel';
import { OFFER_STATUS_KEYS, formatAmount } from './offerDisplay';

// "Teklifler" tab of OrganizationDetailPage — every offer on any artwork of
// the organization's artists, newest first, searchable (artwork, artist,
// buyer) and filterable (status, artist decision) server-side through the
// shared PagedList. A row expands to the offer's timeline and its money
// side (commission snapshot, payment Transaction) — what support needs to
// answer "what happened to this offer?".
export default function OrgDetailOffersTab({ organizationId }: { organizationId: string }) {
  const { t, i18n } = useTranslation();
  const list = usePagedListState<OrgOfferFilters>({});
  const query = useOrganizationOffersOverview(organizationId, list.params);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const dateTime = (iso: string | null | undefined) =>
    iso ? new Date(iso).toLocaleString(i18n.language, { dateStyle: 'medium', timeStyle: 'short' }) : '—';

  const filters: PagedListFilter<OrgOfferFilters>[] = [
    {
      key: 'status',
      label: t('orgOfferStatus'),
      options: (Object.keys(OFFER_STATUS_KEYS) as OfferStatus[]).map((status) => ({
        value: status,
        label: t(OFFER_STATUS_KEYS[status]),
      })),
    },
    {
      key: 'decision',
      label: t('orgOfferArtistDecision'),
      options: [
        { value: 'APPROVED', label: t('orgOfferDecisionApproved') },
        { value: 'REJECTED', label: t('orgOfferDecisionRejected') },
        { value: 'NONE', label: t('orgDetailOfferDecisionNone') },
      ],
    },
  ];

  const columns: GenericTableColumn<ApiOrgOverviewOfferRow>[] = [
    {
      key: 'date',
      header: t('orgDetailOfferColDate'),
      render: (offer) => <span className="whitespace-nowrap text-brand-700">{dateTime(offer.createdAt)}</span>,
    },
    {
      key: 'artwork',
      header: t('orgOfferArtwork'),
      render: (offer) => (
        <>
          <p className="font-medium text-brand-900">{offer.artwork.title}</p>
          <p className="text-xs text-brand-500">
            {offer.artwork.artistDisplayName || offer.artwork.artistProfile.displayName}
          </p>
        </>
      ),
    },
    {
      key: 'buyer',
      header: t('orgOfferBuyer'),
      render: (offer) => <span className="text-brand-700">{offer.buyer.email}</span>,
    },
    {
      key: 'amount',
      header: t('orgOfferAmount'),
      render: (offer) => (
        <span className="whitespace-nowrap tabular-nums text-brand-900">{formatAmount(offer.amount, offer.currency)}</span>
      ),
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

  return (
    <PagedList
      list={list}
      query={query}
      searchPlaceholder={t('orgDetailOfferSearch')}
      filters={filters}
      columns={columns}
      getRowKey={(offer) => offer.id}
      emptyMessage={t('orgDetailOffersEmpty')}
      expandable={{
        isExpanded: (offer) => expandedId === offer.id,
        onToggle: (offer) => setExpandedId(expandedId === offer.id ? null : offer.id),
        renderExpanded: (offer) => <OfferDetailsPanel offer={offer} />,
      }}
    />
  );
}
