import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useOrganizationMutations, useOrganizations } from '../../lib/api/domains/organizations';
import { ApiError } from '../../lib/api/client';

interface OrganizationListProps {
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export default function OrganizationList({ selectedId, onSelect }: OrganizationListProps) {
  const { t } = useTranslation();
  const { data: organizations, isLoading } = useOrganizations();
  const { create } = useOrganizationMutations();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    create.mutate(
      { name },
      {
        onSuccess: (org) => {
          setShowForm(false);
          setName('');
          onSelect(org.id);
        },
        onError: (err) => setError(err instanceof ApiError ? err.message : t('orgFormError')),
      },
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">{t('orgListTitle')}</h2>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="rounded-md bg-brand-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-800"
          >
            {t('orgNew')}
          </button>
        )}
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="flex flex-col gap-2 rounded-md bg-brand-50 p-4 shadow-sm">
          <label className="flex flex-col gap-1 text-sm text-brand-800">
            {t('orgNameLabel')}
            <input
              required
              minLength={2}
              maxLength={200}
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="rounded-md border border-brand-300 bg-white px-3 py-2 text-sm text-brand-900 outline-none focus:border-brand-500"
            />
          </label>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={create.isPending}
              className="rounded-md bg-brand-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-50"
            >
              {create.isPending ? t('orgFormSaving') : t('orgFormSubmit')}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="text-sm text-brand-600 underline hover:text-brand-900"
            >
              {t('artworkFormCancel')}
            </button>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </form>
      )}

      {!isLoading && (!organizations || organizations.length === 0) && (
        <p className="text-sm text-brand-200">{t('orgEmpty')}</p>
      )}

      <ul className="flex flex-col gap-2">
        {organizations?.map((org) => (
          <li key={org.id}>
            <button
              onClick={() => onSelect(org.id)}
              className={`w-full rounded-md px-4 py-3 text-left text-sm shadow-sm ${
                selectedId === org.id
                  ? 'bg-brand-700 font-medium text-white'
                  : 'bg-brand-50 text-brand-900 hover:bg-brand-100'
              }`}
            >
              {org.name}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
