import { useTranslation } from 'react-i18next';
import type { ArtistDecision } from '../../lib/api/domains/offers';

// Artist's informal decision on an offer (see offerDisplay.ts for the other
// shared offer helpers).
export default function ArtistDecisionBadge({ decision }: { decision: ArtistDecision | null }) {
  const { t } = useTranslation();
  if (decision === 'APPROVED') {
    return (
      <span className="rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-800">
        {t('orgOfferDecisionApproved')}
      </span>
    );
  }
  if (decision === 'REJECTED') {
    return (
      <span className="rounded-full bg-red-100 px-2 py-1 text-xs font-medium text-red-800">
        {t('orgOfferDecisionRejected')}
      </span>
    );
  }
  return <span className="text-xs text-brand-500">—</span>;
}
