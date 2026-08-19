import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useCreateArtistProfile } from '../../lib/api/domains/artistProfiles';
import { ApiError } from '../../lib/api/client';

export default function ArtistProfileForm() {
  const { t } = useTranslation();
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [institutionName, setInstitutionName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const createProfile = useCreateArtistProfile();

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    createProfile.mutate(
      { displayName, bio: bio || undefined, institutionName: institutionName || undefined },
      { onError: (err) => setError(err instanceof ApiError ? err.message : t('profileCreateError')) },
    );
  }

  return (
    <div className="mx-auto w-full max-w-md rounded-lg bg-brand-50 p-8 shadow-sm">
      <h1 className="mb-1 text-xl font-semibold text-brand-900">{t('profileCreateTitle')}</h1>
      <p className="mb-6 text-sm text-brand-600">{t('profileCreateSubtitle')}</p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm text-brand-800">
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
        <label className="flex flex-col gap-1 text-sm text-brand-800">
          {t('profileBioLabel')}
          <textarea
            maxLength={5000}
            rows={3}
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            className="rounded-md border border-brand-300 bg-white px-3 py-2 text-sm text-brand-900 outline-none focus:border-brand-500"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-brand-800">
          {t('profileInstitutionLabel')}
          <input
            maxLength={200}
            value={institutionName}
            onChange={(e) => setInstitutionName(e.target.value)}
            className="rounded-md border border-brand-300 bg-white px-3 py-2 text-sm text-brand-900 outline-none focus:border-brand-500"
          />
        </label>
        <button
          type="submit"
          disabled={createProfile.isPending}
          className="mt-2 rounded-md bg-brand-700 px-3 py-2 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-50"
        >
          {createProfile.isPending ? t('profileCreating') : t('profileCreateSubmit')}
        </button>
      </form>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </div>
  );
}
