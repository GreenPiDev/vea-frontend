import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  useDecideRemovalRequest,
  useOrganizationRemovalRequests,
  type ApiArtworkRemovalRequest,
  type RemovalDecision,
} from '../../lib/api/domains/artworkRemovalRequests';
import GenericTable, { type GenericTableColumn } from '../common/GenericTable';
import ConfirmModal from '../common/ConfirmModal';
import Tooltip from '../layout/Tooltip';
import { CheckIcon, CloseIcon } from '../layout/icons';

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
// leaves everything untouched. A response message is required either way
// — the artist sees it via their notification — so the confirmation for
// the icon-only approve/reject actions goes through the shared
// ConfirmModal's `responseField` rather than a plain yes/no.
export default function RemovalRequestTable() {
  const { t } = useTranslation();
  const { data: requests, isLoading } = useOrganizationRemovalRequests();
  const decide = useDecideRemovalRequest();
  const [deciding, setDeciding] = useState<{ id: string; title: string; decision: RemovalDecision } | null>(null);

  const confirmDecision = (responseMessage: string) => {
    if (!deciding) return;
    decide.mutate(
      { id: deciding.id, decision: deciding.decision, responseMessage },
      { onSuccess: () => setDeciding(null) },
    );
  };

  const columns: GenericTableColumn<ApiArtworkRemovalRequest>[] = [
    {
      key: 'artwork',
      header: t('removalRequestArtwork'),
      render: (request) => (
        <span className="font-medium text-brand-900">{request.artwork?.title ?? request.artworkId}</span>
      ),
    },
    {
      key: 'exhibition',
      header: t('artistStatsExhibitionCol'),
      render: (request) => <span className="text-brand-700">{request.exhibition?.title ?? '—'}</span>,
    },
    {
      key: 'message',
      header: t('removalRequestMessageCol'),
      cellClassName: 'max-w-xs',
      render: (request) => <span className="text-brand-700">{request.message}</span>,
    },
    {
      key: 'status',
      header: t('removalRequestStatusCol'),
      render: (request) => <span className="text-brand-700">{t(STATUS_KEYS[request.status])}</span>,
    },
    {
      key: 'action',
      header: t('removalRequestActionCol'),
      render: (request) => {
        if (request.status !== 'PENDING') {
          return request.responseMessage ? (
            <p className="text-xs text-brand-500">{request.responseMessage}</p>
          ) : null;
        }

        return (
          <div className="flex items-center gap-2">
            <Tooltip label={t('removalRequestApprove')} placement="top">
              <button
                type="button"
                onClick={() =>
                  setDeciding({ id: request.id, title: request.artwork?.title ?? request.artworkId, decision: 'APPROVED' })
                }
                aria-label={t('removalRequestApprove')}
                className="flex h-8 w-8 items-center justify-center rounded-md border border-brand-300 text-brand-700 transition-colors hover:bg-brand-100 hover:text-brand-900"
              >
                <CheckIcon className="h-4 w-4" />
              </button>
            </Tooltip>
            <Tooltip label={t('removalRequestReject')} placement="top">
              <button
                type="button"
                onClick={() =>
                  setDeciding({ id: request.id, title: request.artwork?.title ?? request.artworkId, decision: 'REJECTED' })
                }
                aria-label={t('removalRequestReject')}
                className="flex h-8 w-8 items-center justify-center rounded-md border border-red-300 text-red-600 transition-colors hover:bg-red-50 hover:text-red-800"
              >
                <CloseIcon className="h-4 w-4" />
              </button>
            </Tooltip>
          </div>
        );
      },
    },
  ];

  return (
    <>
      <GenericTable
        columns={columns}
        data={requests}
        getRowKey={(request) => request.id}
        isLoading={isLoading}
        emptyMessage={t('removalRequestEmpty')}
      />

      {deciding && (
        <ConfirmModal
          message={t(
            deciding.decision === 'APPROVED'
              ? 'removalRequestDecisionApproveConfirm'
              : 'removalRequestDecisionRejectConfirm',
            { title: deciding.title },
          )}
          confirmLabel={t(deciding.decision === 'APPROVED' ? 'removalRequestApprove' : 'removalRequestReject')}
          tone={deciding.decision === 'APPROVED' ? 'primary' : 'danger'}
          isSubmitting={decide.isPending}
          responseField={{ label: t('removalRequestResponseLabel'), placeholder: t('removalRequestResponsePlaceholder') }}
          onConfirm={confirmDecision}
          onCancel={() => setDeciding(null)}
        />
      )}
    </>
  );
}
