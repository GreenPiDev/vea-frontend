import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMyOffersAsSeller, useSetArtistDecision, type ApiOffer, type ArtistDecision } from '../../lib/api/domains/offers';
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

// The artist's own view of offers on their artworks — no buyer identity
// (only the org's admins get that, see OrgOfferTable.tsx). The
// approve/reject action here is a one-time, irreversible, purely informal
// signal (ArtistDecision) that never touches the real Offer.status state
// machine — see vea-api's OffersService.setArtistDecision. Second
// GenericTable consumer after OrgOfferTable.tsx.
export default function ArtistOfferTable() {
  const { t } = useTranslation();
  const { data: offers, isLoading } = useMyOffersAsSeller();
  const setDecision = useSetArtistDecision();
  const [confirming, setConfirming] = useState<{ offerId: string; decision: ArtistDecision } | null>(null);

  const columns: GenericTableColumn<ApiOffer>[] = [
    {
      key: 'artwork',
      header: t('artistOfferArtwork'),
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
      key: 'amount',
      header: t('artistOfferAmount'),
      render: (offer) => <span className="text-brand-900">{formatAmount(offer.amount, offer.currency)}</span>,
    },
    {
      key: 'status',
      header: t('artistOfferStatus'),
      render: (offer) => <span className="text-brand-700">{t(OFFER_STATUS_KEYS[offer.status])}</span>,
    },
    {
      key: 'decision',
      header: t('artistOfferDecisionCol'),
      render: (offer) => {
        const isConfirming = confirming?.offerId === offer.id;
        const canDecide = !offer.artistDecision && offer.status === 'PENDING';

        if (!canDecide) {
          if (offer.artistDecision === 'APPROVED') {
            return (
              <span className="rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-800">
                {t('artistOfferApproved')}
              </span>
            );
          }
          if (offer.artistDecision === 'REJECTED') {
            return (
              <span className="rounded-full bg-red-100 px-2 py-1 text-xs font-medium text-red-800">
                {t('artistOfferRejected')}
              </span>
            );
          }
          return <span className="text-xs text-brand-500">—</span>;
        }

        if (isConfirming) {
          return (
            <div className="flex flex-col gap-1">
              <span className="text-xs text-brand-700">{t('artistOfferConfirmPrompt')}</span>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setDecision.mutate({ offerId: offer.id, decision: confirming.decision });
                    setConfirming(null);
                  }}
                  className="rounded-md bg-brand-700 px-2 py-1 text-xs font-medium text-white hover:bg-brand-800"
                >
                  {t('artistOfferConfirmYes')}
                </button>
                <button
                  onClick={() => setConfirming(null)}
                  className="rounded-md border border-brand-300 px-2 py-1 text-xs text-brand-700 hover:bg-brand-100"
                >
                  {t('artistOfferConfirmCancel')}
                </button>
              </div>
            </div>
          );
        }

        return (
          <div className="flex gap-2">
            <button
              onClick={() => setConfirming({ offerId: offer.id, decision: 'APPROVED' })}
              className="rounded-md bg-brand-700 px-2 py-1 text-xs font-medium text-white hover:bg-brand-800"
            >
              {t('artistOfferApprove')}
            </button>
            <button
              onClick={() => setConfirming({ offerId: offer.id, decision: 'REJECTED' })}
              className="rounded-md border border-red-300 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
            >
              {t('artistOfferReject')}
            </button>
          </div>
        );
      },
    },
  ];

  return (
    <GenericTable
      columns={columns}
      data={offers}
      getRowKey={(offer) => offer.id}
      isLoading={isLoading}
      emptyMessage={t('artistOfferEmpty')}
    />
  );
}
