import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCreateRemovalRequest } from '../../lib/api/domains/artworkRemovalRequests';

interface RemovalRequestModalProps {
  artworkId: string;
  exhibitionId: string;
  exhibitionTitle: string;
  onClose: () => void;
}

// Shown instead of letting the artist directly archive an artwork that's
// currently placed in an exhibition (vea-api's ArtworksService.archive 409s
// in that case). Two steps in one modal: an explanation + "vazgeç"/"başvuru
// gönder" choice, then (only if they choose to proceed) a free-text message
// textarea. No native confirm() — inline modal state, per this app's
// convention (see ArtistOfferTable.tsx's "confirming" pattern).
export default function RemovalRequestModal({
  artworkId,
  exhibitionId,
  exhibitionTitle,
  onClose,
}: RemovalRequestModalProps) {
  const { t } = useTranslation();
  const [showForm, setShowForm] = useState(false);
  const [message, setMessage] = useState('');
  const createRequest = useCreateRemovalRequest();

  const handleSubmit = () => {
    if (!message.trim()) return;
    createRequest.mutate(
      { artworkId, exhibitionId, message: message.trim() },
      { onSuccess: onClose },
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-lg bg-white p-5 shadow-lg"
      >
        {!showForm ? (
          <>
            <p className="text-sm text-brand-900">
              {t('removalBlockedMessage', { exhibitionTitle })}
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={onClose}
                className="rounded-md border border-brand-300 px-3 py-1.5 text-sm text-brand-700 hover:bg-brand-100"
              >
                {t('removalRequestCancel')}
              </button>
              <button
                onClick={() => setShowForm(true)}
                className="rounded-md bg-brand-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-800"
              >
                {t('removalRequestSend')}
              </button>
            </div>
          </>
        ) : (
          <>
            <label className="block text-sm font-medium text-brand-900">
              {t('removalRequestMessageLabel')}
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={t('removalRequestPlaceholder')}
              rows={4}
              className="mt-2 w-full rounded-md border border-brand-300 px-3 py-2 text-sm text-brand-900 focus:border-brand-600 focus:outline-none"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={onClose}
                className="rounded-md border border-brand-300 px-3 py-1.5 text-sm text-brand-700 hover:bg-brand-100"
              >
                {t('removalRequestCancel')}
              </button>
              <button
                onClick={handleSubmit}
                disabled={!message.trim() || createRequest.isPending}
                className="rounded-md bg-brand-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-50"
              >
                {t('removalRequestSend')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
