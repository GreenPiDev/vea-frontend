import { useTranslation } from 'react-i18next';
import { useArtworkMutations, useMyArtworks, useSetArtworkStatus, type ApiArtwork } from '../../lib/api/domains/artworks';

const STATUS_KEYS: Record<ApiArtwork['status'], string> = {
  DRAFT: 'statusDraft',
  LISTED: 'statusListed',
  IN_EXHIBITION: 'statusInExhibition',
  SOLD: 'statusSold',
  ARCHIVED: 'statusArchived',
};

interface ArtworkListProps {
  onEdit: (artwork: ApiArtwork) => void;
}

export default function ArtworkList({ onEdit }: ArtworkListProps) {
  const { t } = useTranslation();
  const { data: artworks, isLoading } = useMyArtworks();
  const { remove } = useArtworkMutations();
  const setStatus = useSetArtworkStatus();

  if (isLoading) return null;

  if (!artworks || artworks.length === 0) {
    return <p className="text-sm text-brand-600">{t('artworkEmpty')}</p>;
  }

  return (
    <ul className="flex flex-col gap-2">
      {artworks.map((artwork) => (
        <li
          key={artwork.id}
          className="flex items-center justify-between gap-3 rounded-md bg-brand-50 px-4 py-3 shadow-sm"
        >
          <div className="flex items-center gap-3">
            <img src={artwork.imageUrl} alt={artwork.title} className="h-12 w-12 rounded object-cover" />
            <div>
              <p className="text-sm font-medium text-brand-900">{artwork.title}</p>
              <p className="text-xs text-brand-600">{t(STATUS_KEYS[artwork.status])}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 text-sm">
            {artwork.status === 'DRAFT' && (
              <button
                onClick={() => setStatus.mutate({ id: artwork.id, status: 'LISTED' })}
                className="text-brand-700 underline hover:text-brand-900"
              >
                {t('artworkPublish')}
              </button>
            )}
            {artwork.status === 'LISTED' && (
              <button
                onClick={() => setStatus.mutate({ id: artwork.id, status: 'DRAFT' })}
                className="text-brand-700 underline hover:text-brand-900"
              >
                {t('artworkUnpublish')}
              </button>
            )}
            <button onClick={() => onEdit(artwork)} className="text-brand-700 underline hover:text-brand-900">
              {t('artworkEdit')}
            </button>
            <button onClick={() => remove.mutate(artwork.id)} className="text-red-600 underline hover:text-red-800">
              {t('artworkDelete')}
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}
