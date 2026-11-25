import { useTranslation } from 'react-i18next';
import { changeLanguage } from '../../lib/i18n';
import { DEFAULT_LANGUAGE, isLanguage, nextLanguage, type Language } from '../../lib/language';
import { GlobeIcon } from '../layout/icons';

interface LanguageSwitcherProps {
  /** Header's transparent-at-top state (white text over the hero image). Omitted on the panel's solid bar. */
  atTop?: boolean;
}

const SHORT_LABEL_KEY: Record<Language, string> = { tr: 'languageShortTr', en: 'languageShortEn' };

// One button — globe + the active language's code ("TR"); a click switches to the other language.
// Used in the public Header and in PanelLayout's top bar. The accessible name / tooltip says where
// a click goes ("İngilizceye geç" / "Switch to Turkish").
export default function LanguageSwitcher({ atTop }: LanguageSwitcherProps) {
  const { t, i18n } = useTranslation();
  const resolved = i18n.resolvedLanguage ?? i18n.language;
  const active: Language = isLanguage(resolved) ? resolved : DEFAULT_LANGUAGE;
  const label = t('languageSwitchToOther');

  return (
    <button
      type="button"
      onClick={() => void changeLanguage(nextLanguage(active))}
      aria-label={label}
      title={label}
      className={`flex cursor-pointer items-center gap-1.5 text-sm font-medium transition-colors duration-300 ${
        atTop ? 'text-white hover:text-brand-200' : 'text-brand-900 hover:text-brand-600'
      }`}
    >
      <GlobeIcon className="h-[18px] w-[18px]" />
      <span lang={active} className="tracking-wider">
        {t(SHORT_LABEL_KEY[active])}
      </span>
    </button>
  );
}
