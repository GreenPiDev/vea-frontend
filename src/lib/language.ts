// UI language choice: which languages exist, which one to start with, and remembering the
// visitor's pick across visits. Pure (no i18next import) so i18n.ts can call it during init.

export const SUPPORTED_LANGUAGES = ['tr', 'en'] as const;
export type Language = (typeof SUPPORTED_LANGUAGES)[number];

export const DEFAULT_LANGUAGE: Language = 'tr';
export const LANGUAGE_STORAGE_KEY = 'vea.language';

export function isLanguage(value: unknown): value is Language {
  return typeof value === 'string' && (SUPPORTED_LANGUAGES as readonly string[]).includes(value);
}

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    // Some privacy modes throw on any localStorage access.
    return null;
  }
}

/** The language a click switches to: the next one in SUPPORTED_LANGUAGES (with two, the other one). */
export function nextLanguage(current: Language): Language {
  const i = SUPPORTED_LANGUAGES.indexOf(current);
  return SUPPORTED_LANGUAGES[(i + 1) % SUPPORTED_LANGUAGES.length];
}

/** The visitor's saved choice, else Turkish. The browser language is deliberately not used: the
 * product is Turkish-first, English is opt-in via the header switch. */
export function initialLanguage(): Language {
  const saved = storage()?.getItem(LANGUAGE_STORAGE_KEY);
  return isLanguage(saved) ? saved : DEFAULT_LANGUAGE;
}

export function saveLanguage(language: Language): void {
  try {
    storage()?.setItem(LANGUAGE_STORAGE_KEY, language);
  } catch {
    // Quota / privacy mode — the choice just won't survive a reload.
  }
}

/** BCP 47 locale for Intl number/date formatting in the given UI language. */
export function intlLocale(language: string): string {
  return language === 'en' ? 'en-US' : 'tr-TR';
}
