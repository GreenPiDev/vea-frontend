import { useTranslation } from 'react-i18next';

interface ArchiveConfirmModalProps {
  artworkTitle: string;
  onConfirm: () => void;
  onCancel: () => void;
}

// Confirmation for archiving an artwork that isn't placed in any exhibition
// (the exhibition-placed case goes through RemovalRequestModal instead).
// Inline modal, no native confirm() — same convention as the rest of this
// app's destructive-action prompts.
export default function ArchiveConfirmModal({ artworkTitle, onConfirm, onCancel }: ArchiveConfirmModalProps) {
  const { t } = useTranslation();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onCancel}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-lg bg-white p-5 shadow-lg">
        <p className="text-sm text-brand-900">{t('archiveConfirmMessage', { title: artworkTitle })}</p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-md border border-brand-300 px-3 py-1.5 text-sm text-brand-700 hover:bg-brand-100"
          >
            {t('removalRequestCancel')}
          </button>
          <button
            onClick={onConfirm}
            className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
          >
            {t('artworkDelete')}
          </button>
        </div>
      </div>
    </div>
  );
}
