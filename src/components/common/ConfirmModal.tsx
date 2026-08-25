import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

interface ConfirmModalResponseField {
  label: string;
  placeholder?: string;
}

interface ConfirmModalProps {
  message: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  /** Confirm button color — 'danger' for destructive/rejecting actions. Default 'primary'. */
  tone?: 'primary' | 'danger';
  isSubmitting?: boolean;
  onConfirm: (responseMessage: string) => void;
  onCancel: () => void;
  /** When set, adds a required textarea and passes its trimmed value to
   * onConfirm — e.g. the curator's mandatory response message when
   * deciding a removal request. Omit for a plain yes/no confirm
   * (onConfirm is called with an empty string). */
  responseField?: ConfirmModalResponseField;
}

// Generic confirmation modal (message + cancel/confirm, optional required
// textarea) — shared shell for this app's various "are you sure" prompts
// (destructive actions, decisions needing a written reason, ...). No native
// confirm(), consistent with the rest of this app's inline-modal
// convention. First consumer: RemovalRequestTable.tsx's approve/reject
// icon actions; ArchiveConfirmModal.tsx/RemovalRequestModal.tsx are
// pre-existing one-off modals with the same shape, left as-is for now —
// migrate them here incrementally rather than in one pass (same approach
// as GenericTable's rollout).
export default function ConfirmModal({
  message,
  confirmLabel,
  cancelLabel,
  tone = 'primary',
  isSubmitting = false,
  onConfirm,
  onCancel,
  responseField,
}: ConfirmModalProps) {
  const { t } = useTranslation();
  const [responseMessage, setResponseMessage] = useState('');

  const canConfirm = !isSubmitting && (!responseField || responseMessage.trim().length > 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onCancel}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-lg bg-white p-5 shadow-lg">
        <p className="text-sm text-brand-900">{message}</p>

        {responseField && (
          <>
            <label className="mt-3 block text-sm font-medium text-brand-900">{responseField.label}</label>
            <textarea
              value={responseMessage}
              onChange={(e) => setResponseMessage(e.target.value)}
              placeholder={responseField.placeholder}
              rows={3}
              className="mt-2 w-full rounded-md border border-brand-300 px-3 py-2 text-sm text-brand-900 focus:border-brand-600 focus:outline-none"
            />
          </>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-md border border-brand-300 px-3 py-1.5 text-sm text-brand-700 hover:bg-brand-100"
          >
            {cancelLabel ?? t('commonCancel')}
          </button>
          <button
            onClick={() => onConfirm(responseMessage.trim())}
            disabled={!canConfirm}
            className={`rounded-md px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50 ${
              tone === 'danger' ? 'bg-red-600 hover:bg-red-700' : 'bg-brand-700 hover:bg-brand-800'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
