import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useCreateArtistProfile } from '../../lib/api/domains/artistProfiles';
import { ApiError } from '../../lib/api/client';
import { useAuth } from '../../lib/auth/AuthContext';

export default function ArtistProfileForm() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [error, setError] = useState<string | null>(null);

  const createProfile = useCreateArtistProfile();
  // Not a free-text field the artist fills in — it's the organization that
  // invited them (see vea-api's ArtistProfile.institutionName: it has no
  // real relation to Organization, it's just a plain string, so this is
  // the frontend's job to keep it meaningful instead of letting an artist
  // type an unrelated institution name here).
  const institutionName = user?.organization?.name;

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    createProfile.mutate(
      { displayName, bio: bio || undefined, institutionName },
      { onError: (err) => setError(err instanceof ApiError ? err.message : t('profileCreateError')) },
    );
  }

  return (
    <div className="w-full max-w-4xl">
      <h1 className="mb-1 text-xl font-semibold text-white">{t('profileCreateTitle')}</h1>
      <p className="mb-6 text-sm text-brand-200">{t('profileCreateSubtitle')}</p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm text-brand-100">
          {t('profileDisplayNameLabel')}
          <input
            required
            minLength={2}
            maxLength={120}
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="rounded-md border border-brand-300 bg-white px-3 py-2 text-sm text-brand-900 outline-none focus:border-brand-500"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-brand-100">
          {t('profileBioLabel')}
          <textarea
            maxLength={5000}
            rows={3}
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            className="rounded-md border border-brand-300 bg-white px-3 py-2 text-sm text-brand-900 outline-none focus:border-brand-500"
          />
        </label>
        {institutionName && (
          <label className="flex flex-col gap-1 text-sm text-brand-100">
            {t('profileInstitutionLabel')}
            <input
              readOnly
              value={institutionName}
              className="cursor-not-allowed rounded-md border border-brand-200 bg-brand-100 px-3 py-2 text-sm text-brand-700 outline-none"
            />
          </label>
        )}
        <button
          type="submit"
          disabled={createProfile.isPending}
          className="mt-2 rounded-md bg-brand-700 px-3 py-2 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-50"
        >
          {createProfile.isPending ? t('profileCreating') : t('profileCreateSubmit')}
        </button>
      </form>

      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
    </div>
  );
}
