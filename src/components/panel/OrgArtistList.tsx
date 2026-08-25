import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useAddMyOrgArtist, useMyOrgArtists, useRemoveMyOrgArtist, type ApiOrgArtist } from '../../lib/api/domains/organizations';
import { ApiError } from '../../lib/api/client';
import GenericTable, { type GenericTableColumn } from '../common/GenericTable';
import Tooltip from '../layout/Tooltip';
import { TrashIcon } from '../layout/icons';

// Same list+add+remove shape as OrgAdminList.tsx, but "mine" — the ADMIN's
// own organization, no id prop needed (backend derives it from the JWT).
export default function OrgArtistList() {
  const { t } = useTranslation();
  const { data: artists, isLoading } = useMyOrgArtists();
  const addArtist = useAddMyOrgArtist();
  const removeArtist = useRemoveMyOrgArtist();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    addArtist.mutate(email, {
      onSuccess: () => setEmail(''),
      onError: (err: unknown) => setError(err instanceof ApiError ? err.message : t('artistAddError')),
    });
  }

  const columns: GenericTableColumn<ApiOrgArtist>[] = [
    {
      key: 'email',
      header: t('artistColEmail'),
      render: (artist) => <span className="text-brand-900">{artist.email}</span>,
    },
    {
      key: 'actions',
      header: t('artworkListColActions'),
      render: (artist) => (
        <Tooltip label={t('artistRemove')} placement="top">
          <button
            type="button"
            onClick={() => removeArtist.mutate(artist.id)}
            aria-label={t('artistRemove')}
            className="flex h-8 w-8 items-center justify-center rounded-md border border-red-300 text-red-600 transition-colors hover:bg-red-50 hover:text-red-800"
          >
            <TrashIcon className="h-4 w-4" />
          </button>
        </Tooltip>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold text-white">{t('curatorArtistsTitle')}</h2>

      <GenericTable
        columns={columns}
        data={artists}
        getRowKey={(artist) => artist.id}
        isLoading={isLoading}
        emptyMessage={t('artistEmpty')}
      />

      <form onSubmit={handleSubmit} className="flex max-w-xl flex-col gap-2 rounded-md bg-brand-50 p-4 shadow-sm">
        <label className="flex flex-col gap-1 text-sm text-brand-800">
          {t('artistEmailLabel')}
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
          disabled={addArtist.isPending}
          className="self-start rounded-md bg-brand-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-50"
        >
          {addArtist.isPending ? t('artistAdding') : t('artistAdd')}
        </button>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </form>
    </div>
  );
}
