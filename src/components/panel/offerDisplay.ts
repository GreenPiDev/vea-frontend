import type { OfferStatus } from '../../lib/api/domains/offers';

// Shared offer presentation for panel tables (OrgOfferTable, the SUPERADMIN
// organization detail page, ...) — one place for the status labels, money
// formatting (and ArtistDecisionBadge.tsx for the badge) so the screens
// can't drift apart.

export const OFFER_STATUS_KEYS: Record<OfferStatus, string> = {
  PENDING: 'offerStatusPending',
  ACCEPTED: 'offerStatusAccepted',
  PAYMENT_HELD: 'offerStatusPaymentHeld',
  DELIVERED: 'offerStatusDelivered',
  RELEASED: 'offerStatusReleased',
  REJECTED: 'offerStatusRejected',
  CANCELLED: 'offerStatusCancelled',
};

/** Amounts are minor units (kuruş/cent) from the API. */
export function formatAmount(amount: number, currency: string): string {
  return new Intl.NumberFormat('tr-TR', { style: 'currency', currency }).format(amount / 100);
}
