import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

interface BackLinkProps {
  to: string | (() => void);
}

// Text-style (not button-shaped) "go back to previous page" link, meant to
// sit top-left of a page's content — first user: NewExhibitionPage.tsx /
// AddArtworkPage.tsx, reused wherever a dedicated sub-page needs a way back
// to the list screen it was opened from.
export default function BackLink({ to }: BackLinkProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <button
      type="button"
      onClick={() => (typeof to === 'function' ? to() : navigate(to))}
      className="w-fit cursor-pointer text-sm text-brand-200 hover:text-white hover:underline"
    >
      {t('backToPreviousPage')}
    </button>
  );
}
