import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMyOffersAsSeller, useSetArtistDecision, type ApiOffer, type ArtistDecision } from '../../lib/api/domains/offers';

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
// machine — see vea-api's OffersService.setArtistDecision.
export default function ArtistOfferTable() {
  const { t } = useTranslation();
  const { data: offers, isLoading } = useMyOffersAsSeller();
  const setDecision = useSetArtistDecision();
  const [confirming, setConfirming] = useState<{ offerId: string; decision: ArtistDecision } | null>(null);

  if (isLoading) return null;

  if (!offers || offers.length === 0) {
    return <p className="text-sm text-brand-200">{t('artistOfferEmpty')}</p>;
  }

  return (
    <div className="overflow-x-auto rounded-lg bg-brand-50 shadow-sm">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-brand-200 text-xs uppercase tracking-wide text-brand-600">
            <th className="px-4 py-3 font-medium">{t('artistOfferArtwork')}</th>
            <th className="px-4 py-3 font-medium">{t('artistOfferAmount')}</th>
            <th className="px-4 py-3 font-medium">{t('artistOfferStatus')}</th>
            <th className="px-4 py-3 font-medium">{t('artistOfferDecisionCol')}</th>
          </tr>
        </thead>
        <tbody>
          {offers.map((offer) => {
            const exhibitionTitle = offer.artwork?.exhibitionLinks?.[0]?.exhibition.title;
            const isConfirming = confirming?.offerId === offer.id;
            const canDecide = !offer.artistDecision && offer.status === 'PENDING';

            return (
              <tr key={offer.id} className="border-b border-brand-100 last:border-0">
                <td className="px-4 py-3">
                  <p className="font-medium text-brand-900">{offer.artwork?.title ?? offer.artworkId}</p>
                  {exhibitionTitle && <p className="text-xs text-brand-500">{exhibitionTitle}</p>}
                </td>
                <td className="px-4 py-3 text-brand-900">{formatAmount(offer.amount, offer.currency)}</td>
                <td className="px-4 py-3 text-brand-700">{t(OFFER_STATUS_KEYS[offer.status])}</td>
                <td className="px-4 py-3">
                  {!canDecide && offer.artistDecision === 'APPROVED' && (
                    <span className="rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-800">
                      {t('artistOfferApproved')}
                    </span>
                  )}
                  {!canDecide && offer.artistDecision === 'REJECTED' && (
                    <span className="rounded-full bg-red-100 px-2 py-1 text-xs font-medium text-red-800">
                      {t('artistOfferRejected')}
                    </span>
                  )}
                  {!canDecide && !offer.artistDecision && (
                    <span className="text-xs text-brand-500">—</span>
                  )}

                  {canDecide && !isConfirming && (
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
                  )}

                  {canDecide && isConfirming && (
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
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
