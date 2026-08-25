import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { CloseIcon } from '../layout/icons';

interface GenericAddEditPanelProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
}

// Generic add/edit modal shell (dimmed backdrop + centered card + title +
// close) — same backdrop convention as ConfirmModal.tsx, but for a form
// instead of a yes/no prompt. Deliberately owns only the shell: the actual
// form (fields, validation, submit handler) is the caller's `children`, so
// this stays usable for any add/edit flow in the app (e.g. this panel's
// first consumer, OrganizationList.tsx's "+ Yeni Kurum"). Click outside or
// the close icon both call onClose; the form itself decides what submitting
// does (usually calling onClose on success).
export default function GenericAddEditPanel({ title, onClose, children }: GenericAddEditPanelProps) {
  const { t } = useTranslation();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-lg bg-white p-5 shadow-lg">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="text-base font-semibold text-brand-900">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('commonCancel')}
            className="text-brand-500 hover:text-brand-900"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
