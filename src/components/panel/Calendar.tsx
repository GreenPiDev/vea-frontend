import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface CalendarProps {
  value: string;
  onSelect: (isoValue: string) => void;
  onClose: () => void;
}

const YEAR_RANGE_PAST = 10;
const YEAR_RANGE_FUTURE = 15;

function parseIso(iso: string): Date | null {
  const [year, month, day] = iso.split('-').map(Number);
  if (!year || !month || !day) return null;
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toIso(year: number, month: number, day: number): string {
  const y = String(year).padStart(4, '0');
  const m = String(month + 1).padStart(2, '0');
  const d = String(day).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

// Custom popover calendar (mirrors a pattern from another in-house project,
// akya-digital-hr-management's Calendar.tsx) — used instead of the native
// <input type="date"> picker so opening it doesn't require clicking the
// tiny native icon, and so it can be styled with this project's brand
// palette instead of the OS/browser chrome.
export default function Calendar({ value, onSelect, onClose }: CalendarProps) {
  const { i18n, t } = useTranslation();
  const locale = i18n.language === 'en' ? 'en-US' : 'tr-TR';
  const containerRef = useRef<HTMLDivElement>(null);

  const selected = parseIso(value);
  const today = new Date();
  const initial = selected ?? today;
  const [viewYear, setViewYear] = useState(initial.getFullYear());
  const [viewMonth, setViewMonth] = useState(initial.getMonth());

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) onClose();
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  const monthFormatter = new Intl.DateTimeFormat(locale, { month: 'long' });
  const weekdayFormatter = new Intl.DateTimeFormat(locale, { weekday: 'short' });

  const months = Array.from({ length: 12 }, (_, m) => monthFormatter.format(new Date(2000, m, 1)));
  const weekdays = Array.from({ length: 7 }, (_, i) => weekdayFormatter.format(new Date(2000, 0, 3 + i)));

  const currentYear = today.getFullYear();
  const years: number[] = [];
  for (let y = currentYear - YEAR_RANGE_PAST; y <= currentYear + YEAR_RANGE_FUTURE; y++) years.push(y);

  const firstOfMonth = new Date(viewYear, viewMonth, 1);
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstWeekday = (firstOfMonth.getDay() + 6) % 7;
  const daysInPrevMonth = new Date(viewYear, viewMonth, 0).getDate();

  const cells: { day: number; month: number; year: number; outside: boolean }[] = [];
  for (let i = firstWeekday - 1; i >= 0; i--) {
    const month = viewMonth === 0 ? 11 : viewMonth - 1;
    const year = viewMonth === 0 ? viewYear - 1 : viewYear;
    cells.push({ day: daysInPrevMonth - i, month, year, outside: true });
  }
  for (let day = 1; day <= daysInMonth; day++) cells.push({ day, month: viewMonth, year: viewYear, outside: false });
  while (cells.length % 7 !== 0 || cells.length < 42) {
    const last = cells[cells.length - 1];
    const nextDay = last.day + 1;
    const overflowsMonth = new Date(last.year, last.month + 1, 0).getDate();
    if (nextDay > overflowsMonth) {
      const month = last.month === 11 ? 0 : last.month + 1;
      const year = last.month === 11 ? last.year + 1 : last.year;
      cells.push({ day: 1, month, year, outside: true });
    } else {
      cells.push({ day: nextDay, month: last.month, year: last.year, outside: true });
    }
  }

  function goToPrevMonth() {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  }

  function goToNextMonth() {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  }

  function handleSelectDay(cell: { day: number; month: number; year: number }) {
    onSelect(toIso(cell.year, cell.month, cell.day));
  }

  return (
    <div
      ref={containerRef}
      role="dialog"
      className="w-72 rounded-lg border border-brand-300 bg-white p-3 text-brand-900 shadow-lg"
    >
      <div className="mb-2 flex items-center gap-1">
        <button
          type="button"
          onClick={goToPrevMonth}
          aria-label={t('calendarPrevMonth')}
          className="flex h-7 w-7 flex-shrink-0 cursor-pointer items-center justify-center rounded-md text-brand-700 hover:bg-brand-100"
        >
          ‹
        </button>
        <select
          value={viewMonth}
          onChange={(e) => setViewMonth(Number(e.target.value))}
          aria-label={t('calendarMonth')}
          className="flex-1 cursor-pointer rounded-md border border-brand-300 bg-white px-1.5 py-1 text-sm text-brand-900 outline-none focus:border-brand-500"
        >
          {months.map((name, index) => (
            <option key={name} value={index}>
              {name}
            </option>
          ))}
        </select>
        <select
          value={viewYear}
          onChange={(e) => setViewYear(Number(e.target.value))}
          aria-label={t('calendarYear')}
          className="cursor-pointer rounded-md border border-brand-300 bg-white px-1.5 py-1 text-sm text-brand-900 outline-none focus:border-brand-500"
        >
          {years.map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={goToNextMonth}
          aria-label={t('calendarNextMonth')}
          className="flex h-7 w-7 flex-shrink-0 cursor-pointer items-center justify-center rounded-md text-brand-700 hover:bg-brand-100"
        >
          ›
        </button>
      </div>

      <div className="mb-1 grid grid-cols-7">
        {weekdays.map((name) => (
          <span key={name} className="text-center text-[11px] font-medium uppercase text-brand-500">
            {name}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((cell) => {
          const cellDate = new Date(cell.year, cell.month, cell.day);
          const isSelected = selected ? isSameDay(cellDate, selected) : false;
          const isToday = isSameDay(cellDate, today);
          return (
            <button
              type="button"
              key={`${cell.year}-${cell.month}-${cell.day}`}
              onClick={() => handleSelectDay(cell)}
              className={`h-8 w-8 cursor-pointer rounded-md text-sm transition-colors hover:bg-brand-100 ${
                cell.outside ? 'text-brand-400' : 'text-brand-900'
              } ${isToday && !isSelected ? 'border border-brand-500' : ''} ${
                isSelected ? 'bg-brand-700 text-white hover:bg-brand-800' : ''
              }`}
            >
              {cell.day}
            </button>
          );
        })}
      </div>

      <div className="mt-2 flex justify-center border-t border-brand-100 pt-2">
        <button
          type="button"
          onClick={() => handleSelectDay({ day: today.getDate(), month: today.getMonth(), year: today.getFullYear() })}
          className="cursor-pointer text-xs font-medium text-brand-700 hover:underline"
        >
          {t('calendarToday')}
        </button>
      </div>
    </div>
  );
}
