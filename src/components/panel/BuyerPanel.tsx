import { useTranslation } from 'react-i18next';
import { useMyOffersAsBuyer, type OfferStatus } from '../../lib/api/domains/offers';
import PanelLayout from '../layout/PanelLayout';
import { ArtworkIcon } from '../layout/icons';

const STATUS_KEYS: Record<OfferStatus, string> = {
  PENDING: 'offerStatusPending',
  ACCEPTED: 'offerStatusAccepted',
  PAYMENT_HELD: 'offerStatusPaymentHeld',
  DELIVERED: 'offerStatusDelivered',
  RELEASED: 'offerStatusReleased',
  REJECTED: 'offerStatusRejected',
  CANCELLED: 'offerStatusCancelled',
};

interface BuyerPanelProps {
  onBack: () => void;
}

// Landing panel for an authenticated user who is neither SUPERADMIN, ADMIN,
// nor an invited ARTIST — i.e. a plain visitor/buyer. Previously "Panel"
// dumped every such user into ArtistPanel, forcing an unwanted "create an
// artist profile" form on someone who just wants to track their offers.
// Read-only: accept/pay/deliver/release are seller/backend-owned state
// transitions, out of scope here (see offer creation's own scope note in
// ArtworkDetailCard.tsx).
export default function BuyerPanel({ onBack }: BuyerPanelProps) {
  const { t } = useTranslation();
  const { data: offers, isLoading } = useMyOffersAsBuyer();

  const navItems = [{ id: 'offers', label: t('buyerPanelTitle'), icon: <ArtworkIcon /> }];

  return (
    <PanelLayout
      title={t('buyerPanelTitle')}
      navItems={navItems}
      activeSectionId="offers"
      onSelectSection={() => {}}
      onBack={onBack}
    >
      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-brand-900">{t('buyerPanelTitle')}</h2>

        {!isLoading && (!offers || offers.length === 0) && (
          <p className="text-sm text-brand-600">{t('buyerOffersEmpty')}</p>
        )}

        <ul className="flex flex-col gap-2">
          {offers?.map((offer) => (
            <li
              key={offer.id}
              className="flex items-center justify-between gap-3 rounded-md bg-brand-50 px-4 py-3 shadow-sm"
            >
              <div>
                <p className="text-sm font-medium text-brand-900">
                  {offer.artwork?.title ?? offer.artworkId}
                </p>
                <p className="text-xs text-brand-600">{t(STATUS_KEYS[offer.status])}</p>
                {offer.artistDecision === 'APPROVED' && (
                  <p className="text-xs font-medium text-green-700">{t('buyerOfferDecisionApproved')}</p>
                )}
                {offer.artistDecision === 'REJECTED' && (
                  <>
                    <p className="text-xs font-medium text-red-700">{t('buyerOfferDecisionRejected')}</p>
                    <p className="text-xs text-brand-500">{t('buyerOfferRejectedHint')}</p>
                  </>
                )}
                {!offer.artistDecision && (
                  <p className="text-xs text-brand-500">{t('buyerOfferDecisionPending')}</p>
                )}
              </div>
              <p className="text-sm font-medium text-brand-900">
                {new Intl.NumberFormat('tr-TR', { style: 'currency', currency: offer.currency }).format(
                  offer.amount / 100,
                )}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </PanelLayout>
  );
}
