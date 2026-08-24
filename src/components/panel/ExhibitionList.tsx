import { useTranslation } from 'react-i18next';
import { useExhibitionMutations, useMyExhibitions, useSetExhibitionStatus, type ApiExhibition } from '../../lib/api/domains/exhibitions';

const STATUS_KEYS: Record<ApiExhibition['status'], string> = {
  DRAFT: 'exhibitionStatusDraft',
  ACTIVE: 'exhibitionStatusActive',
  ENDED: 'exhibitionStatusEnded',
};

interface ExhibitionListProps {
  onPlace: (exhibitionId: string) => void;
}

export default function ExhibitionList({ onPlace }: ExhibitionListProps) {
  const { t } = useTranslation();
  const { data: exhibitions, isLoading } = useMyExhibitions();
  const { remove } = useExhibitionMutations();
  const setStatus = useSetExhibitionStatus();

  if (isLoading) return null;

  if (!exhibitions || exhibitions.length === 0) {
    return <p className="text-sm text-brand-200">{t('exhibitionEmpty')}</p>;
  }

  return (
    <ul className="flex flex-col gap-2">
      {exhibitions.map((exhibition) => (
        <li key={exhibition.id} className="flex items-center justify-between gap-3 rounded-md bg-brand-50 px-4 py-3 shadow-sm">
          <div>
            <p className="text-sm font-medium text-brand-900">{exhibition.title}</p>
            <p className="text-xs text-brand-600">{t(STATUS_KEYS[exhibition.status])}</p>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <button onClick={() => onPlace(exhibition.id)} className="text-brand-700 underline hover:text-brand-900">
              {t('placementTitle')}
            </button>
            {exhibition.status === 'DRAFT' && (
              <button
                onClick={() => setStatus.mutate({ id: exhibition.id, status: 'ACTIVE' })}
                className="text-brand-700 underline hover:text-brand-900"
              >
                {t('exhibitionPublish')}
              </button>
            )}
            {exhibition.status === 'DRAFT' && (
              <button onClick={() => remove.mutate(exhibition.id)} className="text-red-600 underline hover:text-red-800">
                {t('exhibitionDelete')}
              </button>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
