import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useAddOrgAdmin, useOrgAdmins, useRemoveOrgAdmin } from '../../lib/api/domains/organizations';
import { ApiError } from '../../lib/api/client';

interface OrgAdminListProps {
  organizationId: string;
  organizationName: string;
}

export default function OrgAdminList({ organizationId, organizationName }: OrgAdminListProps) {
  const { t } = useTranslation();
  const { data: admins, isLoading } = useOrgAdmins(organizationId);
  const addAdmin = useAddOrgAdmin(organizationId);
  const removeAdmin = useRemoveOrgAdmin(organizationId);
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    addAdmin.mutate(email, {
      onSuccess: () => setEmail(''),
      onError: (err) => setError(err instanceof ApiError ? err.message : t('orgAdminAddError')),
    });
  }

  return (
    <div className="flex flex-col gap-3 rounded-md bg-brand-50 p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-brand-900">
        {t('orgAdminsTitle', { name: organizationName })}
      </h3>

      {!isLoading && (!admins || admins.length === 0) && (
        <p className="text-sm text-brand-600">{t('orgAdminEmpty')}</p>
      )}

      <ul className="flex flex-col gap-2">
        {admins?.map((admin) => (
          <li key={admin.id} className="flex items-center justify-between gap-3 rounded-md bg-white px-3 py-2 text-sm shadow-sm">
            <span className="text-brand-900">{admin.email}</span>
            <button
              onClick={() => removeAdmin.mutate(admin.id)}
              className="text-red-600 underline hover:text-red-800"
            >
              {t('orgAdminRemove')}
            </button>
          </li>
        ))}
      </ul>

      <form onSubmit={handleSubmit} className="flex flex-col gap-2">
        <label className="flex flex-col gap-1 text-sm text-brand-800">
          {t('orgAdminEmailLabel')}
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-md border border-brand-300 bg-white px-3 py-2 text-sm text-brand-900 outline-none focus:border-brand-500"
          />
        </label>
        <button
          type="submit"
          disabled={addAdmin.isPending}
          className="self-start rounded-md bg-brand-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-50"
        >
          {addAdmin.isPending ? t('orgAdminAdding') : t('orgAdminAdd')}
        </button>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </form>
    </div>
  );
}
