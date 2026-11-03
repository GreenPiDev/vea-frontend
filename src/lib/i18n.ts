import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import tr from '../locales/tr/translation.json';
import en from '../locales/en/translation.json';

// Flat translation.json per language (src/locales/<lang>/translation.json) —
// no nested keys, so a JSON key never doubles as an i18next namespace
// path. keySeparator/nsSeparator are disabled for the same reason: a key
// like "authTitle" must resolve literally, never split on a dot.
void i18n.use(initReactI18next).init({
  resources: {
    tr: { translation: tr },
    en: { translation: en },
  },
  lng: 'tr',
  fallbackLng: 'tr',
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

export default i18n;
