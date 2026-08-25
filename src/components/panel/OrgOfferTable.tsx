import { useTranslation } from 'react-i18next';
import { useOrganizationOffers, type ApiOffer } from '../../lib/api/domains/offers';
import GenericTable, { type GenericTableColumn } from '../common/GenericTable';

const OFFER_STATUS_KEYS: Record<ApiOffer['status'], string> = {
  PENDING: 'offerStatusPending',
  ACCEPTED: 'offerStatusAccepted',
  PAYMENT_HELD: 'offerStatusPaymentHeld',
  DELIVERED: 'offerStatusDelivered',
  RELEASED: 'offerStatusReleased',
  REJECTED: 'offerStatusRejected',
  CANCELLED: 'offerStatusCancelled',
};

function formatAmount(amount: number, currency: string): string {
  return new Intl.NumberFormat('tr-TR', { style: 'currency', currency }).format(amount / 100);
}

// Admin's org-wide, read-only view — every offer on any artwork by any
// artist in this admin's organization, buyer identity included (unlike
// ArtistOfferTable.tsx). No accept/reject action here — the admin only
// observes the artist's own (informal) decision, see artistDecision's
// comment in vea-api's OffersService. First consumer of GenericTable — see
// its comment for the plan to migrate the other panel tables.
export default function OrgOfferTable() {
  const { t } = useTranslation();
  const { data: offers, isLoading } = useOrganizationOffers();

  const columns: GenericTableColumn<ApiOffer>[] = [
    {
      key: 'artist',
      header: t('orgOfferArtist'),
      render: (offer) => <span className="text-brand-900">{offer.artwork?.artistProfile?.displayName ?? '—'}</span>,
    },
    {
      key: 'artwork',
      header: t('orgOfferArtwork'),
      render: (offer) => {
        const exhibitionTitle = offer.artwork?.exhibitionLinks?.[0]?.exhibition.title;
        return (
          <>
            <p className="font-medium text-brand-900">{offer.artwork?.title ?? offer.artworkId}</p>
            {exhibitionTitle && <p className="text-xs text-brand-500">{exhibitionTitle}</p>}
          </>
        );
      },
    },
    {
      key: 'buyer',
      header: t('orgOfferBuyer'),
      render: (offer) => <span className="text-brand-700">{offer.buyer?.email ?? '—'}</span>,
    },
    {
      key: 'amount',
      header: t('orgOfferAmount'),
      render: (offer) => <span className="text-brand-900">{formatAmount(offer.amount, offer.currency)}</span>,
    },
    {
      key: 'status',
      header: t('orgOfferStatus'),
      render: (offer) => <span className="text-brand-700">{t(OFFER_STATUS_KEYS[offer.status])}</span>,
    },
    {
      key: 'artistDecision',
      header: t('orgOfferArtistDecision'),
      render: (offer) => {
        if (offer.artistDecision === 'APPROVED') {
          return (
            <span className="rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-800">
              {t('orgOfferDecisionApproved')}
            </span>
          );
        }
        if (offer.artistDecision === 'REJECTED') {
          return (
            <span className="rounded-full bg-red-100 px-2 py-1 text-xs font-medium text-red-800">
              {t('orgOfferDecisionRejected')}
            </span>
          );
        }
        return <span className="text-xs text-brand-500">—</span>;
      },
    },
  ];

  return (
    <GenericTable
      columns={columns}
      data={offers}
      getRowKey={(offer) => offer.id}
      isLoading={isLoading}
      emptyMessage={t('orgOfferEmpty')}
    />
  );
}
