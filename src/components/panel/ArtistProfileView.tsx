import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useUpdateArtistProfileBio, type ApiArtistProfile } from '../../lib/api/domains/artistProfiles';
import { ApiError } from '../../lib/api/client';

interface ArtistProfileViewProps {
  profile: ApiArtistProfile;
}

// "Profil" section — displayName/institutionName are read-only here
// (displayName has no editing UI yet; institutionName intentionally never
// does, see ArtistProfileForm.tsx's comment on why it mirrors the inviting
// organization instead of being free text). Only bio is actually editable.
export default function ArtistProfileView({ profile }: ArtistProfileViewProps) {
  const { t } = useTranslation();
  const [bio, setBio] = useState(profile.bio ?? '');
  const [error, setError] = useState<string | null>(null);
  const updateBio = useUpdateArtistProfileBio();

  const dirty = bio !== (profile.bio ?? '');

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    updateBio.mutate(bio, {
      onError: (err) => setError(err instanceof ApiError ? err.message : t('profileUpdateError')),
    });
  }

  return (
    <div className="flex max-w-2xl flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm text-brand-100">
        {t('profileDisplayNameLabel')}
        <input
          readOnly
          value={profile.displayName}
          className="cursor-not-allowed rounded-md border border-brand-200 bg-brand-100 px-3 py-2 text-sm text-brand-700 outline-none"
        />
      </label>

      {profile.institutionName && (
        <label className="flex flex-col gap-1 text-sm text-brand-100">
          {t('profileInstitutionLabel')}
          <input
            readOnly
            value={profile.institutionName}
            className="cursor-not-allowed rounded-md border border-brand-200 bg-brand-100 px-3 py-2 text-sm text-brand-700 outline-none"
          />
        </label>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm text-brand-100">
          {t('profileBioLabel')}
          <textarea
            maxLength={5000}
            rows={5}
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            className="rounded-md border border-brand-300 bg-white px-3 py-2 text-sm text-brand-900 outline-none focus:border-brand-500"
          />
        </label>
        <button
          type="submit"
          disabled={!dirty || updateBio.isPending}
          className="self-start rounded-md bg-brand-700 px-3 py-2 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-50"
        >
          {updateBio.isPending ? t('profileSaving') : t('profileSave')}
        </button>
        {updateBio.isSuccess && !dirty && (
          <p className="text-sm text-green-400">{t('profileSaved')}</p>
        )}
      </form>

      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}
