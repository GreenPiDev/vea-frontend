import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  useDecideRemovalRequest,
  useOrganizationRemovalRequests,
  type ApiArtworkRemovalRequest,
  type RemovalDecision,
} from '../../lib/api/domains/artworkRemovalRequests';

const STATUS_KEYS: Record<ApiArtworkRemovalRequest['status'], string> = {
  PENDING: 'removalRequestStatusPending',
  APPROVED: 'removalRequestStatusApproved',
  REJECTED: 'removalRequestStatusRejected',
};

// Curator's inbox for artist-initiated "please take this off the wall"
// requests (see RemovalRequestModal.tsx — an artist can't archive an
// artwork directly while it's placed in an exhibition). Approving here
// removes the ExhibitionArtwork link and archives the artwork server-side
// in one transaction (ArtworkRemovalRequestsService.decide); rejecting
// leaves everything untouched. Unlike the offer decision flow, a response
// message is required either way — the artist sees it via their
// notification.
export default function RemovalRequestTable() {
  const { t } = useTranslation();
  const { data: requests, isLoading } = useOrganizationRemovalRequests();
  const decide = useDecideRemovalRequest();
  const [deciding, setDeciding] = useState<{ id: string; decision: RemovalDecision } | null>(null);
  const [responseMessage, setResponseMessage] = useState('');

  if (isLoading) return null;

  if (!requests || requests.length === 0) {
    return <p className="text-sm text-brand-200">{t('removalRequestEmpty')}</p>;
  }

  const startDeciding = (id: string, decision: RemovalDecision) => {
    setDeciding({ id, decision });
    setResponseMessage('');
  };

  const confirmDecision = () => {
    if (!deciding || !responseMessage.trim()) return;
    decide.mutate(
      { id: deciding.id, decision: deciding.decision, responseMessage: responseMessage.trim() },
      { onSuccess: () => setDeciding(null) },
    );
  };

  return (
    <div className="overflow-x-auto rounded-lg bg-brand-50 shadow-sm">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-brand-200 text-xs uppercase tracking-wide text-brand-600">
            <th className="px-4 py-3 font-medium">{t('removalRequestArtwork')}</th>
            <th className="px-4 py-3 font-medium">{t('removalRequestMessageCol')}</th>
            <th className="px-4 py-3 font-medium">{t('removalRequestStatusCol')}</th>
            <th className="px-4 py-3 font-medium">{t('removalRequestActionCol')}</th>
          </tr>
        </thead>
        <tbody>
          {requests.map((request) => {
            const isDeciding = deciding?.id === request.id;
            const canDecide = request.status === 'PENDING';

            return (
              <tr key={request.id} className="border-b border-brand-100 last:border-0">
                <td className="px-4 py-3">
                  <p className="font-medium text-brand-900">{request.artwork?.title ?? request.artworkId}</p>
                  {request.exhibition && <p className="text-xs text-brand-500">{request.exhibition.title}</p>}
                </td>
                <td className="max-w-xs px-4 py-3 text-brand-700">{request.message}</td>
                <td className="px-4 py-3 text-brand-700">{t(STATUS_KEYS[request.status])}</td>
                <td className="px-4 py-3">
                  {!canDecide && request.responseMessage && (
                    <p className="text-xs text-brand-500">{request.responseMessage}</p>
                  )}

                  {canDecide && !isDeciding && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => startDeciding(request.id, 'APPROVED')}
                        className="rounded-md bg-brand-700 px-2 py-1 text-xs font-medium text-white hover:bg-brand-800"
                      >
                        {t('removalRequestApprove')}
                      </button>
                      <button
                        onClick={() => startDeciding(request.id, 'REJECTED')}
                        className="rounded-md border border-red-300 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
                      >
                        {t('removalRequestReject')}
                      </button>
                    </div>
                  )}

                  {canDecide && isDeciding && (
                    <div className="flex flex-col gap-1">
                      <textarea
                        value={responseMessage}
                        onChange={(e) => setResponseMessage(e.target.value)}
                        placeholder={t('removalRequestResponsePlaceholder')}
                        rows={2}
                        className="w-56 rounded-md border border-brand-300 px-2 py-1 text-xs text-brand-900 focus:border-brand-600 focus:outline-none"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={confirmDecision}
                          disabled={!responseMessage.trim() || decide.isPending}
                          className="rounded-md bg-brand-700 px-2 py-1 text-xs font-medium text-white hover:bg-brand-800 disabled:opacity-50"
                        >
                          {t('artistOfferConfirmYes')}
                        </button>
                        <button
                          onClick={() => setDeciding(null)}
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
