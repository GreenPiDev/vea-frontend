import { useTranslation } from 'react-i18next';
import { useMyExhibitionTemplates, type ApiExhibitionTemplate } from '../../lib/api/domains/exhibitionTemplates';
import GenericTable, { type GenericTableColumn } from '../common/GenericTable';
import Tooltip from '../layout/Tooltip';
import { EditIcon, PreviewIcon } from '../layout/icons';
import { roomSizeLabel } from './roomShapeLabel';

interface ExhibitionTemplateListProps {
  onEdit: (templateId: string) => void;
  onPreview: (templateId: string) => void;
}

// Same table/action-button shell as ExhibitionList.tsx's ActionButton — kept
// local for the same reason: a small wrapper, only this table uses it.
function ActionButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <Tooltip label={label} placement="top">
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        className="flex h-8 w-8 items-center justify-center rounded-md border border-brand-300 text-brand-700 transition-colors hover:bg-brand-100 hover:text-brand-900"
      >
        {children}
      </button>
    </Tooltip>
  );
}

export default function ExhibitionTemplateList({ onEdit, onPreview }: ExhibitionTemplateListProps) {
  const { t } = useTranslation();
  const { data: templates, isLoading } = useMyExhibitionTemplates();

  const columns: GenericTableColumn<ApiExhibitionTemplate>[] = [
    {
      key: 'name',
      header: t('exhibitionTemplateColName'),
      render: (template) => <span className="font-medium text-brand-900">{template.name}</span>,
    },
    {
      key: 'roomSize',
      header: t('exhibitionTemplateColRoomSize'),
      render: (template) => <span className="text-brand-700">{roomSizeLabel(template)}</span>,
    },
    {
      key: 'wallHeight',
      header: t('exhibitionTemplateColWallHeight'),
      render: (template) => <span className="text-brand-700">{template.wallHeight} m</span>,
    },
    {
      key: 'usageCount',
      header: t('exhibitionTemplateColUsageCount'),
      render: (template) => <span className="text-brand-700">{template._count?.exhibitions ?? 0}</span>,
    },
    {
      key: 'actions',
      header: t('artworkListColActions'),
      render: (template) => (
        <div className="flex items-center gap-2">
          <ActionButton label={t('exhibitionTemplatePreview')} onClick={() => onPreview(template.id)}>
            <PreviewIcon className="h-4 w-4" />
          </ActionButton>
          <ActionButton label={t('exhibitionTemplateEdit')} onClick={() => onEdit(template.id)}>
            <EditIcon className="h-4 w-4" />
          </ActionButton>
        </div>
      ),
    },
  ];

  return (
    <GenericTable
      columns={columns}
      data={templates}
      getRowKey={(template) => template.id}
      isLoading={isLoading}
      emptyMessage={t('exhibitionTemplateEmpty')}
    />
  );
}
