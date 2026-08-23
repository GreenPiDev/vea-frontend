import { useTranslation } from 'react-i18next';
import { useOrganizationOffers, type ApiOffer } from '../../lib/api/domains/offers';

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
// comment in vea-api's OffersService.
export default function OrgOfferTable() {
  const { t } = useTranslation();
  const { data: offers, isLoading } = useOrganizationOffers();

  if (isLoading) return null;

  if (!offers || offers.length === 0) {
    return <p className="text-sm text-brand-600">{t('orgOfferEmpty')}</p>;
  }

  return (
    <div className="overflow-x-auto rounded-lg bg-brand-50 shadow-sm">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-brand-200 text-xs uppercase tracking-wide text-brand-600">
            <th className="px-4 py-3 font-medium">{t('orgOfferArtist')}</th>
            <th className="px-4 py-3 font-medium">{t('orgOfferArtwork')}</th>
            <th className="px-4 py-3 font-medium">{t('orgOfferBuyer')}</th>
            <th className="px-4 py-3 font-medium">{t('orgOfferAmount')}</th>
            <th className="px-4 py-3 font-medium">{t('orgOfferStatus')}</th>
            <th className="px-4 py-3 font-medium">{t('orgOfferArtistDecision')}</th>
          </tr>
        </thead>
        <tbody>
          {offers.map((offer) => {
            const exhibitionTitle = offer.artwork?.exhibitionLinks?.[0]?.exhibition.title;
            return (
              <tr key={offer.id} className="border-b border-brand-100 last:border-0">
                <td className="px-4 py-3 text-brand-900">{offer.artwork?.artistProfile?.displayName ?? '—'}</td>
                <td className="px-4 py-3">
                  <p className="font-medium text-brand-900">{offer.artwork?.title ?? offer.artworkId}</p>
                  {exhibitionTitle && <p className="text-xs text-brand-500">{exhibitionTitle}</p>}
                </td>
                <td className="px-4 py-3 text-brand-700">{offer.buyer?.email ?? '—'}</td>
                <td className="px-4 py-3 text-brand-900">{formatAmount(offer.amount, offer.currency)}</td>
                <td className="px-4 py-3 text-brand-700">{t(OFFER_STATUS_KEYS[offer.status])}</td>
                <td className="px-4 py-3">
                  {offer.artistDecision === 'APPROVED' && (
                    <span className="rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-800">
                      {t('orgOfferDecisionApproved')}
                    </span>
                  )}
                  {offer.artistDecision === 'REJECTED' && (
                    <span className="rounded-full bg-red-100 px-2 py-1 text-xs font-medium text-red-800">
                      {t('orgOfferDecisionRejected')}
                    </span>
                  )}
                  {!offer.artistDecision && <span className="text-xs text-brand-500">—</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
