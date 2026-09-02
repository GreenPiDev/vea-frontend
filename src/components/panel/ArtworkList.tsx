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
import GenericTable, { type GenericTableColumn } from '../common/GenericTable';
import Tooltip from '../layout/Tooltip';
import { EditIcon, EyeIcon, EyeOffIcon, TrashIcon, UndoIcon } from '../layout/icons';

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

// Icon-only action button, always wrapped in a Tooltip (see icons.tsx) so
// the hover hint reads the same way as the header's "sergiye dön" control.
function ActionButton({
  label,
  onClick,
  tone = 'default',
  children,
}: {
  label: string;
  onClick: () => void;
  tone?: 'default' | 'danger';
  children: React.ReactNode;
}) {
  return (
    <Tooltip label={label} placement="top">
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        className={`flex h-8 w-8 items-center justify-center rounded-md border transition-colors ${
          tone === 'danger'
            ? 'border-red-300 text-red-600 hover:bg-red-50 hover:text-red-800'
            : 'border-brand-300 text-brand-700 hover:bg-brand-100 hover:text-brand-900'
        }`}
      >
        {children}
      </button>
    </Tooltip>
  );
}

export default function ArtworkList({ onEdit }: ArtworkListProps) {
  const { t } = useTranslation();
  const { data: artworks, isLoading } = useMyArtworks();
  const { remove } = useArtworkMutations();
  const setStatus = useSetArtworkStatus();
  const unarchive = useUnarchiveArtwork();
  const [removalRequestFor, setRemovalRequestFor] = useState<ApiArtwork | null>(null);
  const [confirmDeleteFor, setConfirmDeleteFor] = useState<ApiArtwork | null>(null);

  const columns: GenericTableColumn<ApiArtwork>[] = [
    {
      key: 'artwork',
      header: t('artworkListColArtwork'),
      render: (artwork) => (
        <div className="flex items-center gap-3">
          <img src={artwork.imageUrl} alt={artwork.title} className="h-12 w-12 rounded object-cover" />
          <p className="text-sm font-medium text-brand-900">{artwork.title}</p>
        </div>
      ),
    },
    {
      key: 'exhibition',
      header: t('artworkListColExhibition'),
      render: (artwork) =>
        artwork.exhibitionLinks && artwork.exhibitionLinks.length > 0 ? (
          <div className="flex flex-col gap-1 text-xs text-brand-500">
            {artwork.exhibitionLinks.map((link) => (
              <span key={link.exhibition.id}>
                {link.exhibition.status === 'DRAFT' ? (
                  t('artworkInDraftExhibition', { title: link.exhibition.title })
                ) : (
                  <a
                    href={`/exhibition/${link.exhibition.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline hover:text-brand-700"
                  >
                    {t('artworkInExhibition', { title: link.exhibition.title })}
                  </a>
                )}
              </span>
            ))}
          </div>
        ) : (
          <span className="text-xs text-brand-400">—</span>
        ),
    },
    {
      key: 'status',
      header: t('artworkListColStatus'),
      render: (artwork) => <span className="text-brand-700">{t(STATUS_KEYS[artwork.status])}</span>,
    },
    {
      key: 'actions',
      header: t('artworkListColActions'),
      render: (artwork) => (
        <div className="flex items-center gap-2">
          {artwork.status === 'DRAFT' && (
            <ActionButton label={t('artworkPublish')} onClick={() => setStatus.mutate({ id: artwork.id, status: 'LISTED' })}>
              <EyeIcon className="h-4 w-4" />
            </ActionButton>
          )}
          {artwork.status === 'LISTED' && (
            <ActionButton label={t('artworkUnpublish')} onClick={() => setStatus.mutate({ id: artwork.id, status: 'DRAFT' })}>
              <EyeOffIcon className="h-4 w-4" />
            </ActionButton>
          )}
          <ActionButton label={t('artworkEdit')} onClick={() => onEdit(artwork)}>
            <EditIcon className="h-4 w-4" />
          </ActionButton>
          {artwork.status === 'ARCHIVED' ? (
            <ActionButton label={t('artworkUnarchive')} onClick={() => unarchive.mutate(artwork.id)}>
              <UndoIcon className="h-4 w-4" />
            </ActionButton>
          ) : artwork.removalRequests && artwork.removalRequests.length > 0 ? (
            <span className="text-xs text-brand-500">{t('removalRequestPending')}</span>
          ) : artwork.exhibitionLinks && artwork.exhibitionLinks.length > 0 ? (
            <ActionButton label={t('artworkDelete')} tone="danger" onClick={() => setRemovalRequestFor(artwork)}>
              <TrashIcon className="h-4 w-4" />
            </ActionButton>
          ) : (
            <ActionButton label={t('artworkDelete')} tone="danger" onClick={() => setConfirmDeleteFor(artwork)}>
              <TrashIcon className="h-4 w-4" />
            </ActionButton>
          )}
        </div>
      ),
    },
  ];

  return (
    <>
      <GenericTable
        columns={columns}
        data={artworks}
        getRowKey={(artwork) => artwork.id}
        isLoading={isLoading}
        emptyMessage={t('artworkEmpty')}
      />

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
