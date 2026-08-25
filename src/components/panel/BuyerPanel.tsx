import { useTranslation } from 'react-i18next';
import { useMyOffersAsBuyer, type ApiOffer, type OfferStatus } from '../../lib/api/domains/offers';
import PanelLayout from '../layout/PanelLayout';
import { ArtworkIcon } from '../layout/icons';
import GenericTable, { type GenericTableColumn } from '../common/GenericTable';

const STATUS_KEYS: Record<OfferStatus, string> = {
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

interface BuyerPanelProps {
  onBack: () => void;
}

// Landing panel for an authenticated user who is neither SUPERADMIN, ADMIN,
// nor an invited ARTIST — i.e. a plain visitor/buyer. Previously "Panel"
// dumped every such user into ArtistPanel, forcing an unwanted "create an
// artist profile" form on someone who just wants to track their offers.
// Read-only: accept/pay/deliver/release are seller/backend-owned state
// transitions, out of scope here (see offer creation's own scope note in
// ArtworkDetailCard.tsx). Third GenericTable consumer after
// OrgOfferTable.tsx/ArtistOfferTable.tsx — same fullWidth pattern as those
// two panels' offers tab.
export default function BuyerPanel({ onBack }: BuyerPanelProps) {
  const { t } = useTranslation();
  const { data: offers, isLoading } = useMyOffersAsBuyer();

  const navItems = [{ id: 'offers', label: t('buyerPanelTitle'), icon: <ArtworkIcon /> }];

  const columns: GenericTableColumn<ApiOffer>[] = [
    {
      key: 'artwork',
      header: t('buyerOfferArtwork'),
      render: (offer) => <span className="font-medium text-brand-900">{offer.artwork?.title ?? offer.artworkId}</span>,
    },
    {
      key: 'amount',
      header: t('buyerOfferAmount'),
      render: (offer) => <span className="text-brand-900">{formatAmount(offer.amount, offer.currency)}</span>,
    },
    {
      key: 'status',
      header: t('buyerOfferStatus'),
      render: (offer) => <span className="text-brand-700">{t(STATUS_KEYS[offer.status])}</span>,
    },
    {
      key: 'decision',
      header: t('buyerOfferDecisionCol'),
      render: (offer) => {
        if (offer.artistDecision === 'APPROVED') {
          return <span className="text-xs font-medium text-green-700">{t('buyerOfferDecisionApproved')}</span>;
        }
        if (offer.artistDecision === 'REJECTED') {
          return (
            <>
              <p className="text-xs font-medium text-red-700">{t('buyerOfferDecisionRejected')}</p>
              <p className="text-xs text-brand-500">{t('buyerOfferRejectedHint')}</p>
            </>
          );
        }
        return <span className="text-xs text-brand-500">{t('buyerOfferDecisionPending')}</span>;
      },
    },
  ];

  return (
    <PanelLayout
      title={t('buyerPanelHeaderTitle')}
      navItems={navItems}
      activeSectionId="offers"
      onSelectSection={() => {}}
      onBack={onBack}
      fullWidth
    >
      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-white">{t('buyerPanelTitle')}</h2>

        <GenericTable
          columns={columns}
          data={offers}
          getRowKey={(offer) => offer.id}
          isLoading={isLoading}
          emptyMessage={t('buyerOffersEmpty')}
        />
      </div>
    </PanelLayout>
  );
}
