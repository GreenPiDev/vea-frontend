import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useAddMyOrgArtist, useMyOrgArtists, useRemoveMyOrgArtist } from '../../lib/api/domains/organizations';
import { ApiError } from '../../lib/api/client';

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
      onError: (err) => setError(err instanceof ApiError ? err.message : t('artistAddError')),
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold text-white">{t('curatorArtistsTitle')}</h2>

      {!isLoading && (!artists || artists.length === 0) && (
        <p className="text-sm text-brand-200">{t('artistEmpty')}</p>
      )}

      <ul className="flex flex-col gap-2">
        {artists?.map((artist) => (
          <li key={artist.id} className="flex items-center justify-between gap-3 rounded-md bg-brand-50 px-4 py-3 shadow-sm">
            <span className="text-sm text-brand-900">{artist.email}</span>
            <button
              onClick={() => removeArtist.mutate(artist.id)}
              className="text-sm text-red-600 underline hover:text-red-800"
            >
              {t('artistRemove')}
            </button>
          </li>
        ))}
      </ul>

      <form onSubmit={handleSubmit} className="flex flex-col gap-2 rounded-md bg-brand-50 p-4 shadow-sm">
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
