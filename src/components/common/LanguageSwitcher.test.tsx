import { afterEach, describe, expect, it } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import i18n, { changeLanguage } from '../../lib/i18n';
import { LANGUAGE_STORAGE_KEY, nextLanguage } from '../../lib/language';
import LanguageSwitcher from './LanguageSwitcher';

afterEach(async () => {
  await act(() => changeLanguage('tr'));
  localStorage.clear();
});

describe('LanguageSwitcher', () => {
  it('toggles between the two languages', () => {
    expect(nextLanguage('tr')).toBe('en');
    expect(nextLanguage('en')).toBe('tr');
  });

  it('one button shows the active language and switches to the other on click', async () => {
    render(<LanguageSwitcher />);
    const button = screen.getByRole('button', { name: 'İngilizceye geç' });
    expect(button).toHaveTextContent('TR');
    expect(screen.getAllByRole('button')).toHaveLength(1);

    await act(async () => {
      fireEvent.click(button);
    });

    expect(i18n.language).toBe('en');
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('en');
    expect(document.documentElement.lang).toBe('en');
    expect(screen.getByRole('button', { name: 'Switch to Turkish' })).toHaveTextContent('EN');

    await act(async () => {
      fireEvent.click(screen.getByRole('button'));
    });
    expect(i18n.language).toBe('tr');
  });
});
