import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useOrganizationMutations, useOrganizations, type ApiOrganization } from '../../lib/api/domains/organizations';
import { ApiError } from '../../lib/api/client';
import GenericTable, { type GenericTableColumn } from '../common/GenericTable';
import GenericAddEditPanel from '../common/GenericAddEditPanel';
import Tooltip from '../layout/Tooltip';
import { EditIcon } from '../layout/icons';

interface OrganizationListProps {
  selectedId: string | null;
  onSelect: (id: string) => void;
}

// 'create' opens the add form empty; an ApiOrganization opens it prefilled
// for editing (same 'none' | 'create' | T formMode shape as ArtworkForm/
// ExhibitionForm elsewhere in this codebase).
type FormMode = 'none' | 'create' | ApiOrganization;

export default function OrganizationList({ selectedId, onSelect }: OrganizationListProps) {
  const { t } = useTranslation();
  const { data: organizations, isLoading } = useOrganizations();
  const { create, update } = useOrganizationMutations();
  const [formMode, setFormMode] = useState<FormMode>('none');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const openCreate = () => {
    setFormMode('create');
    setName('');
    setError(null);
  };

  const openEdit = (org: ApiOrganization) => {
    setFormMode(org);
    setName(org.name);
    setError(null);
  };

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (formMode === 'none') return;
    setError(null);

    if (formMode === 'create') {
      create.mutate(
        { name },
        {
          onSuccess: (org) => {
            setFormMode('none');
            onSelect(org.id);
          },
          onError: (err) => setError(err instanceof ApiError ? err.message : t('orgFormError')),
        },
      );
    } else {
      update.mutate(
        { id: formMode.id, updates: { name } },
        {
          onSuccess: () => setFormMode('none'),
          onError: (err) => setError(err instanceof ApiError ? err.message : t('orgFormError')),
        },
      );
    }
  }

  const columns: GenericTableColumn<ApiOrganization>[] = [
    {
      key: 'name',
      header: t('orgColName'),
      render: (org) => (
        <button
          onClick={() => onSelect(org.id)}
          className={`text-left hover:underline ${
            selectedId === org.id ? 'font-medium text-brand-700' : 'text-brand-900'
          }`}
        >
          {org.name}
        </button>
      ),
    },
    {
      key: 'adminCount',
      header: t('orgColAdminCount'),
      render: (org) => <span className="text-brand-700">{org._count?.admins ?? 0}</span>,
    },
    {
      key: 'exhibitionCount',
      header: t('orgColExhibitionCount'),
      render: (org) => <span className="text-brand-700">{org._count?.exhibitions ?? 0}</span>,
    },
    {
      key: 'actions',
      header: t('artworkListColActions'),
      render: (org) => (
        <Tooltip label={t('artworkEdit')} placement="top">
          <button
            type="button"
            onClick={() => openEdit(org)}
            aria-label={t('artworkEdit')}
            className="flex h-8 w-8 items-center justify-center rounded-md border border-brand-300 text-brand-700 transition-colors hover:bg-brand-100 hover:text-brand-900"
          >
            <EditIcon className="h-4 w-4" />
          </button>
        </Tooltip>
      ),
    },
  ];

  const isEditing = formMode !== 'none' && formMode !== 'create';

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">{t('orgListTitle')}</h2>
        {formMode === 'none' && (
          <button
            onClick={openCreate}
            className="rounded-md bg-brand-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-800"
          >
            {t('orgNew')}
          </button>
        )}
      </div>

      {formMode !== 'none' && (
        <GenericAddEditPanel title={t(isEditing ? 'orgEditTitle' : 'orgAddTitle')} onClose={() => setFormMode('none')}>
          <form onSubmit={handleSubmit} className="flex flex-col gap-2">
            <label className="flex flex-col gap-1 text-sm text-brand-800">
              {t('orgNameLabel')}
              <input
                required
                minLength={2}
                maxLength={200}
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="rounded-md border border-brand-300 bg-white px-3 py-2 text-sm text-brand-900 outline-none focus:border-brand-500"
              />
            </label>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setFormMode('none')}
                className="rounded-md border border-brand-300 px-3 py-1.5 text-sm text-brand-700 hover:bg-brand-100"
              >
                {t('commonCancel')}
              </button>
              <button
                type="submit"
                disabled={create.isPending || update.isPending}
                className="rounded-md bg-brand-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-50"
              >
                {create.isPending || update.isPending
                  ? t('orgFormSaving')
                  : t(isEditing ? 'orgEditSubmit' : 'orgFormSubmit')}
              </button>
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
          </form>
        </GenericAddEditPanel>
      )}

      <GenericTable
        columns={columns}
        data={organizations}
        getRowKey={(org) => org.id}
        isLoading={isLoading}
        emptyMessage={t('orgEmpty')}
      />
    </div>
  );
}
