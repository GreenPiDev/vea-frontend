import { useTranslation } from 'react-i18next';

interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}

// "21–40 / 57 · Önceki · Sayfa 2 / 3 · Sonraki" footer for server-side
// paginated lists (rendered by <PagedList>). Renders nothing for a single page.
export default function Pagination({ page, pageSize, total, onPageChange }: PaginationProps) {
  const { t } = useTranslation();
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  if (pageCount <= 1) return null;

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const buttonClass =
    'rounded-md border border-brand-600 px-3 py-1 text-sm text-brand-100 transition-colors hover:bg-brand-800 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent';

  return (
    <nav aria-label={t('paginationLabel')} className="flex flex-wrap items-center justify-between gap-3 text-sm text-brand-200">
      <span className="tabular-nums">{t('paginationRange', { from, to, total })}</span>
      <div className="flex items-center gap-2">
        <button type="button" className={buttonClass} disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
          {t('paginationPrevious')}
        </button>
        <span className="tabular-nums">{t('paginationPage', { page, pageCount })}</span>
        <button type="button" className={buttonClass} disabled={page >= pageCount} onClick={() => onPageChange(page + 1)}>
          {t('paginationNext')}
        </button>
      </div>
    </nav>
  );
}
