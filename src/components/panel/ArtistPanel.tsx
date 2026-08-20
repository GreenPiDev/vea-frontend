import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMyArtistProfile } from '../../lib/api/domains/artistProfiles';
import { ApiError } from '../../lib/api/client';
import ArtistProfileForm from './ArtistProfileForm';
import ArtworkForm from './ArtworkForm';
import ArtworkList from './ArtworkList';
import type { ApiArtwork } from '../../lib/api/domains/artworks';

interface ArtistPanelProps {
  onBack: () => void;
}

export default function ArtistPanel({ onBack }: ArtistPanelProps) {
  const { t } = useTranslation();
  const { data: profile, isLoading, error } = useMyArtistProfile();
  const [formMode, setFormMode] = useState<'none' | 'create' | ApiArtwork>('none');

  const hasNoProfile = error instanceof ApiError && error.status === 404;

  return (
    <div className="h-full w-full overflow-y-auto bg-neutral-100 px-6 py-10">
      <div className="mx-auto max-w-3xl">
        <button onClick={onBack} className="mb-6 text-sm text-brand-700 underline hover:text-brand-900">
          {t('panelBackToGallery')}
        </button>

        {isLoading && null}

        {hasNoProfile && <ArtistProfileForm />}

        {profile && (
          <div className="flex flex-col gap-6">
            <p className="text-brand-800">{t('profileWelcome', { name: profile.displayName })}</p>

            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-brand-900">{t('artworkListTitle')}</h2>
              {formMode === 'none' && (
                <button
                  onClick={() => setFormMode('create')}
                  className="rounded-md bg-brand-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-800"
                >
                  {t('artworkNew')}
                </button>
              )}
            </div>

            {formMode !== 'none' && (
              <ArtworkForm
                editing={formMode === 'create' ? undefined : formMode}
                onDone={() => setFormMode('none')}
              />
            )}

            <ArtworkList onEdit={(artwork) => setFormMode(artwork)} />
          </div>
        )}
      </div>
    </div>
  );
}
