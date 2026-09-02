import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  useExhibitionMutations,
  useMyExhibitions,
  useRestoreExhibition,
  useSetExhibitionStatus,
  type ApiExhibition,
} from '../../lib/api/domains/exhibitions';
import GenericTable, { type GenericTableColumn } from '../common/GenericTable';
import Tooltip from '../layout/Tooltip';
import { ArtworkIcon, EyeIcon, EyeOffIcon, GalleryIcon, TrashIcon, UndoIcon } from '../layout/icons';

const STATUS_KEYS: Record<ApiExhibition['status'], string> = {
  DRAFT: 'exhibitionStatusDraft',
  ACTIVE: 'exhibitionStatusActive',
  ENDED: 'exhibitionStatusEnded',
};

interface ExhibitionListProps {
  onPlace: (exhibitionId: string) => void;
  onPreview: (exhibitionId: string) => void;
}

// Icon-only action button, always wrapped in a Tooltip (see icons.tsx) —
// same shell as ArtworkList.tsx's ActionButton, kept local rather than
// shared since it's a two-line wrapper and both call sites already import
// Tooltip/icons themselves.
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

export default function ExhibitionList({ onPlace, onPreview }: ExhibitionListProps) {
  const { t } = useTranslation();
  const [showRemoved, setShowRemoved] = useState(false);
  const { data: exhibitions, isLoading } = useMyExhibitions(showRemoved);
  const { remove } = useExhibitionMutations();
  const setStatus = useSetExhibitionStatus();
  const restore = useRestoreExhibition();

  const columns: GenericTableColumn<ApiExhibition>[] = [
    {
      key: 'exhibition',
      header: t('artistStatsExhibitionCol'),
      render: (exhibition) => <span className="font-medium text-brand-900">{exhibition.title}</span>,
    },
    {
      key: 'status',
      header: t('artworkListColStatus'),
      render: (exhibition) => <span className="text-brand-700">{t(STATUS_KEYS[exhibition.status])}</span>,
    },
    {
      key: 'artist',
      header: t('exhibitionListColArtist'),
      render: (exhibition) => (
        <span className="text-brand-700">
          {exhibition.artistProfile?.displayName ?? t('exhibitionListArtistNone')}
        </span>
      ),
    },
    {
      key: 'artworkCount',
      header: t('exhibitionListColArtworkCount'),
      render: (exhibition) => <span className="text-brand-700">{exhibition._count?.artworkLinks ?? 0}</span>,
    },
    {
      key: 'actions',
      header: t('artworkListColActions'),
      render: (exhibition) =>
        exhibition.deletedAt ? (
          <ActionButton label={t('exhibitionRestore')} onClick={() => restore.mutate(exhibition.id)}>
            <UndoIcon className="h-4 w-4" />
          </ActionButton>
        ) : (
          <div className="flex items-center gap-2">
            <ActionButton label={t('placementTitle')} onClick={() => onPlace(exhibition.id)}>
              <ArtworkIcon className="h-4 w-4" />
            </ActionButton>
            <ActionButton label={t('exhibitionPreview')} onClick={() => onPreview(exhibition.id)}>
              <GalleryIcon className="h-4 w-4" />
            </ActionButton>
            {exhibition.status === 'DRAFT' && (
              <ActionButton
                label={t('exhibitionPublish')}
                onClick={() => setStatus.mutate({ id: exhibition.id, status: 'ACTIVE' })}
              >
                <EyeIcon className="h-4 w-4" />
              </ActionButton>
            )}
            {exhibition.status === 'ACTIVE' && (
              <ActionButton
                label={t('exhibitionUnpublish')}
                onClick={() => setStatus.mutate({ id: exhibition.id, status: 'DRAFT' })}
              >
                <EyeOffIcon className="h-4 w-4" />
              </ActionButton>
            )}
            <ActionButton label={t('exhibitionDelete')} tone="danger" onClick={() => remove.mutate(exhibition.id)}>
              <TrashIcon className="h-4 w-4" />
            </ActionButton>
          </div>
        ),
    },
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setShowRemoved((prev) => !prev)}
          className="rounded-md bg-brand-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-800"
        >
          {showRemoved ? t('exhibitionHideRemoved') : t('exhibitionShowRemoved')}
        </button>
      </div>

      <GenericTable
        columns={columns}
        data={exhibitions}
        getRowKey={(exhibition) => exhibition.id}
        isLoading={isLoading}
        emptyMessage={t('exhibitionEmpty')}
        getRowClassName={(exhibition) => (exhibition.deletedAt ? 'opacity-40' : '')}
      />
    </div>
  );
}
