import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import tr from '../locales/tr/translation.json';
import en from '../locales/en/translation.json';
import { DEFAULT_LANGUAGE, initialLanguage, intlLocale, saveLanguage, type Language } from './language';

// Flat translation.json per language (src/locales/<lang>/translation.json) —
// no nested keys, so a JSON key never doubles as an i18next namespace
// path. keySeparator/nsSeparator are disabled for the same reason: a key
// like "authTitle" must resolve literally, never split on a dot.
void i18n.use(initReactI18next).init({
  resources: {
    tr: { translation: tr },
    en: { translation: en },
  },
  lng: initialLanguage(),
  fallbackLng: DEFAULT_LANGUAGE,
  keySeparator: false,
  nsSeparator: false,
  interpolation: { escapeValue: false },
});

// Keep <html lang> in step with the active UI language — browsers use it to decide whether to offer
// page translation, and screen readers to pick a voice.
const syncHtmlLang = (lng: string) => {
  if (typeof document !== 'undefined') document.documentElement.lang = lng;
};
syncHtmlLang(i18n.language);
i18n.on('languageChanged', syncHtmlLang);

/** Switches the UI language and remembers it for the next visit. Every `useTranslation()` consumer
 * re-renders on its own. */
export function changeLanguage(language: Language): Promise<unknown> {
  saveLanguage(language);
  return i18n.changeLanguage(language);
}

/** Intl locale (number/currency/date formatting) of the active UI language. */
export function currentIntlLocale(): string {
  return intlLocale(i18n.language);
}

export default i18n;
