import { afterEach, describe, expect, it } from 'vitest';
import tr from '../locales/tr/translation.json';
import en from '../locales/en/translation.json';
import {
  DEFAULT_LANGUAGE,
  LANGUAGE_STORAGE_KEY,
  initialLanguage,
  intlLocale,
  isLanguage,
  saveLanguage,
} from './language';

afterEach(() => localStorage.clear());

describe('language', () => {
  it('starts in Turkish when nothing is saved', () => {
    expect(initialLanguage()).toBe(DEFAULT_LANGUAGE);
    expect(DEFAULT_LANGUAGE).toBe('tr');
  });

  it('remembers the saved choice', () => {
    saveLanguage('en');
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('en');
    expect(initialLanguage()).toBe('en');
  });

  it('ignores an unknown saved value', () => {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, 'de');
    expect(initialLanguage()).toBe('tr');
    expect(isLanguage('de')).toBe(false);
    expect(isLanguage('en')).toBe(true);
  });

  it('maps UI languages to Intl locales', () => {
    expect(intlLocale('en')).toBe('en-US');
    expect(intlLocale('tr')).toBe('tr-TR');
  });
});

// Turkish has no plural forms, so a key can exist in tr as `x` and in en as `x_one`/`x_other`.
const baseKey = (key: string) => key.replace(/_(one|other)$/, '');

describe('translation files', () => {
  it('tr and en cover the same keys', () => {
    const trKeys = new Set(Object.keys(tr).map(baseKey));
    const enKeys = new Set(Object.keys(en).map(baseKey));
    expect([...trKeys].filter((k) => !enKeys.has(k))).toEqual([]);
    expect([...enKeys].filter((k) => !trKeys.has(k))).toEqual([]);
  });

  it('every value is a non-empty string', () => {
    for (const file of [tr, en] as Record<string, unknown>[]) {
      for (const [key, value] of Object.entries(file)) {
        expect(typeof value === 'string' && value.trim() !== '', key).toBe(true);
      }
    }
  });
});
