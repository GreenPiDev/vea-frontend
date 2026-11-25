import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { ApiOrgOverviewOfferRow, TransactionStatus } from '../../lib/api/domains/organizations';
import { formatAmount } from './offerDisplay';

const TRANSACTION_STATUS_KEYS: Record<TransactionStatus, string> = {
  PENDING: 'orgDetailTxStatusPending',
  HELD: 'orgDetailTxStatusHeld',
  RELEASED: 'orgDetailTxStatusReleased',
  REFUNDED: 'orgDetailTxStatusRefunded',
  FAILED: 'orgDetailTxStatusFailed',
};

export type OfferDetailsSource = Pick<
  ApiOrgOverviewOfferRow,
  'currency' | 'createdAt' | 'respondedAt' | 'commissionAmount' | 'commissionTaxAmount' | 'transaction'
>;

// An offer's timeline + money side (commission snapshot, payment
// Transaction) — the expanded row of every "what happened to this offer?"
// table: the SUPERADMIN's OrgDetailOffersTab and the curator's artist
// detail page (OrgArtistDetailPage).
export default function OfferDetailsPanel({ offer }: { offer: OfferDetailsSource }) {
  const { t, i18n } = useTranslation();
  const dateTime = (iso: string | null | undefined) =>
    iso ? new Date(iso).toLocaleString(i18n.language, { dateStyle: 'medium', timeStyle: 'short' }) : '—';
  const money = (amount: number | null) => (amount === null ? '—' : formatAmount(amount, offer.currency));
  const tx = offer.transaction;

  return (
    <div className="grid gap-6 sm:grid-cols-2">
      <DetailSection title={t('orgDetailOfferTimeline')}>
        <DetailRow label={t('orgDetailOfferCreated')} value={dateTime(offer.createdAt)} />
        <DetailRow label={t('orgDetailOfferResponded')} value={dateTime(offer.respondedAt)} />
        <DetailRow label={t('orgDetailOfferHeld')} value={dateTime(tx?.heldAt)} />
        <DetailRow label={t('orgDetailOfferReleased')} value={dateTime(tx?.releasedAt)} />
      </DetailSection>
      <DetailSection title={t('orgDetailOfferPayment')}>
        <DetailRow label={t('orgDetailOfferCommission')} value={money(offer.commissionAmount)} />
        <DetailRow label={t('orgDetailOfferCommissionTax')} value={money(offer.commissionTaxAmount)} />
        {tx ? (
          <>
            <DetailRow label={t('orgDetailOfferTxStatus')} value={t(TRANSACTION_STATUS_KEYS[tx.status])} />
            <DetailRow label={t('orgDetailOfferTxProvider')} value={tx.provider} />
            <DetailRow label={t('orgDetailOfferTxRef')} value={tx.providerRef ?? '—'} mono />
          </>
        ) : (
          <p className="text-xs text-brand-500">{t('orgDetailOfferNoTransaction')}</p>
        )}
      </DetailSection>
    </div>
  );
}

export function DetailSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-1">
      <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-brand-600">{title}</h4>
      <dl className="flex flex-col gap-1">{children}</dl>
    </section>
  );
}

export function DetailRow({ label, value, mono = false }: { label: string; value: ReactNode; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-4 text-sm">
      <dt className="text-brand-600">{label}</dt>
      <dd className={`text-right text-brand-900 ${mono ? 'font-mono text-xs' : ''}`}>{value}</dd>
    </div>
  );
}
