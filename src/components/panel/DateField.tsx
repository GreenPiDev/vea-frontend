import { useEffect, useLayoutEffect, useRef, useState, type ChangeEvent } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import Calendar from './Calendar';
import { CalendarIcon } from '../layout/icons';

interface DateFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (isoValue: string) => void;
  required?: boolean;
}

function isoToDigits(iso: string): string {
  const [year, month, day] = iso.split('-');
  if (!year || !month || !day) return '';
  return `${day}${month}${year}`;
}

function digitsToFormatted(digits: string): string {
  const day = digits.slice(0, 2);
  const month = digits.slice(2, 4);
  const year = digits.slice(4, 8);
  let formatted = day;
  if (month) formatted += `.${month}`;
  if (year) formatted += `.${year}`;
  return formatted;
}

function digitsToIso(digits: string): string {
  if (digits.length !== 8) return '';
  const day = digits.slice(0, 2);
  const month = digits.slice(2, 4);
  const year = digits.slice(4, 8);
  return `${year}-${month}-${day}`;
}

// Drop-in replacement for the plain <label>+<input type="date"> pair used
// across the panel forms — clicking/focusing anywhere in the input opens
// the custom Calendar popover (not just the tiny native picker icon), and
// typing digits still works as a fast manual-entry path (dd.mm.yyyy mask).
export default function DateField({ id, label, value, onChange, required }: DateFieldProps) {
  const { t } = useTranslation();
  const [digits, setDigits] = useState(() => isoToDigits(value));
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarPosition, setCalendarPosition] = useState({ top: 0, left: 0 });
  const wrapRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setDigits(isoToDigits(value));
  }, [value]);

  useLayoutEffect(() => {
    if (!calendarOpen) return;
    function updatePosition() {
      const rect = wrapRef.current?.getBoundingClientRect();
      if (!rect) return;
      const popoverHeight = popoverRef.current?.offsetHeight ?? 0;
      const spaceBelow = window.innerHeight - rect.bottom;
      const openUpward = popoverHeight > 0 && spaceBelow < popoverHeight + 12 && rect.top > popoverHeight + 12;
      const top = openUpward ? rect.top - popoverHeight - 6 : rect.bottom + 6;
      setCalendarPosition({ top, left: rect.left });
    }
    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [calendarOpen]);

  useEffect(() => {
    if (!calendarOpen) return;
    function handleFocusIn(event: FocusEvent) {
      const target = event.target as Node;
      if (wrapRef.current?.contains(target) || popoverRef.current?.contains(target)) return;
      setCalendarOpen(false);
    }
    document.addEventListener('focusin', handleFocusIn);
    return () => document.removeEventListener('focusin', handleFocusIn);
  }, [calendarOpen]);

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const rawDigits = event.target.value.replace(/\D/g, '').slice(0, 8);
    setDigits(rawDigits);
    onChange(digitsToIso(rawDigits));
  }

  function handleCalendarSelect(isoValue: string) {
    setDigits(isoToDigits(isoValue));
    onChange(isoValue);
    setCalendarOpen(false);
  }

  return (
    <label className="flex flex-col gap-1 text-sm text-brand-800" htmlFor={id}>
      {label}
      <div className="relative" ref={wrapRef}>
        <input
          id={id}
          type="text"
          inputMode="numeric"
          placeholder={t('dateFieldPlaceholder')}
          value={digitsToFormatted(digits)}
          onChange={handleChange}
          onFocus={() => setCalendarOpen(true)}
          maxLength={10}
          required={required}
          autoComplete="off"
          className="w-full rounded-md border border-brand-300 bg-white px-3 py-2 pr-9 text-sm text-brand-900 outline-none focus:border-brand-500"
        />
        <button
          type="button"
          onClick={() => setCalendarOpen((open) => !open)}
          aria-label={t('calendarOpen')}
          tabIndex={-1}
          className="absolute right-1.5 top-1/2 flex h-6 w-6 -translate-y-1/2 cursor-pointer items-center justify-center rounded text-brand-600 hover:bg-brand-100 hover:text-brand-900"
        >
          <CalendarIcon className="h-4 w-4" />
        </button>
        {calendarOpen &&
          createPortal(
            <div
              ref={popoverRef}
              className="fixed z-[300]"
              style={{ top: calendarPosition.top, left: calendarPosition.left }}
            >
              <Calendar value={digitsToIso(digits)} onSelect={handleCalendarSelect} onClose={() => setCalendarOpen(false)} />
            </div>,
            document.body
          )}
      </div>
    </label>
  );
}
