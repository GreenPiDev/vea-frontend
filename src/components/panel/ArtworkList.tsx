import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  useArtworkMutations,
  useMyArtworks,
  useSetArtworkStatus,
  useUnarchiveArtwork,
  type ApiArtwork,
} from '../../lib/api/domains/artworks';
import RemovalRequestModal from './RemovalRequestModal';
import ArchiveConfirmModal from './ArchiveConfirmModal';

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
  const unarchive = useUnarchiveArtwork();
  const [removalRequestFor, setRemovalRequestFor] = useState<ApiArtwork | null>(null);
  const [confirmDeleteFor, setConfirmDeleteFor] = useState<ApiArtwork | null>(null);

  if (isLoading) return null;

  if (!artworks || artworks.length === 0) {
    return <p className="text-sm text-brand-600">{t('artworkEmpty')}</p>;
  }

  return (
    <>
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
              {artwork.exhibitionLinks && artwork.exhibitionLinks.length > 0 && (
                <p className="text-xs text-brand-500">
                  {artwork.exhibitionLinks.map((link, i) => (
                    <span key={link.exhibition.id}>
                      {i > 0 && ', '}
                      {link.exhibition.status === 'DRAFT' ? (
                        t('artworkInDraftExhibition', { title: link.exhibition.title })
                      ) : (
                        <a
                          href={`/?exhibition=${link.exhibition.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline hover:text-brand-700"
                        >
                          {t('artworkInExhibition', { title: link.exhibition.title })}
                        </a>
                      )}
                    </span>
                  ))}
                </p>
              )}
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
            {artwork.status === 'ARCHIVED' ? (
              <button
                onClick={() => unarchive.mutate(artwork.id)}
                className="text-brand-700 underline hover:text-brand-900"
              >
                {t('artworkUnarchive')}
              </button>
            ) : artwork.removalRequests && artwork.removalRequests.length > 0 ? (
              <span className="text-xs text-brand-500">{t('removalRequestPending')}</span>
            ) : artwork.exhibitionLinks && artwork.exhibitionLinks.length > 0 ? (
              <button
                onClick={() => setRemovalRequestFor(artwork)}
                className="text-red-600 underline hover:text-red-800"
              >
                {t('artworkDelete')}
              </button>
            ) : (
              <button
                onClick={() => setConfirmDeleteFor(artwork)}
                className="text-red-600 underline hover:text-red-800"
              >
                {t('artworkDelete')}
              </button>
            )}
          </div>
        </li>
      ))}
    </ul>

      {removalRequestFor && removalRequestFor.exhibitionLinks?.[0] && (
        <RemovalRequestModal
          artworkId={removalRequestFor.id}
          exhibitionId={removalRequestFor.exhibitionLinks[0].exhibition.id}
          exhibitionTitle={removalRequestFor.exhibitionLinks[0].exhibition.title}
          onClose={() => setRemovalRequestFor(null)}
        />
      )}

      {confirmDeleteFor && (
        <ArchiveConfirmModal
          artworkTitle={confirmDeleteFor.title}
          onConfirm={() => {
            remove.mutate(confirmDeleteFor.id);
            setConfirmDeleteFor(null);
          }}
          onCancel={() => setConfirmDeleteFor(null)}
        />
      )}
    </>
  );
}
