import { useRef, type KeyboardEvent, type ReactNode } from 'react';

export interface TabItem<Id extends string> {
  id: Id;
  label: string;
}

interface TabsProps<Id extends string> {
  tabs: TabItem<Id>[];
  activeId: Id;
  onChange: (id: Id) => void;
  /** Prefix for the tab/panel element ids, so aria-controls/aria-labelledby pair up. */
  idPrefix: string;
}

// Underline-style tab bar (WAI-ARIA tabs pattern: role="tablist"/"tab",
// roving tabindex, ←/→/Home/End move between tabs). Controlled — the caller
// owns which tab is active (e.g. OrganizationDetailPage keeps it in the URL
// so a tab can be linked/refreshed) and renders the active panel itself,
// wrapped in <TabPanel>.
export default function Tabs<Id extends string>({ tabs, activeId, onChange, idPrefix }: TabsProps<Id>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>, index: number) {
    const last = tabs.length - 1;
    const next =
      e.key === 'ArrowRight' ? (index === last ? 0 : index + 1)
      : e.key === 'ArrowLeft' ? (index === 0 ? last : index - 1)
      : e.key === 'Home' ? 0
      : e.key === 'End' ? last
      : null;
    if (next === null) return;
    e.preventDefault();
    onChange(tabs[next].id);
    refs.current[next]?.focus();
  }

  return (
    <div role="tablist" className="flex gap-1 border-b border-brand-400">
      {tabs.map((tab, index) => {
        const active = tab.id === activeId;
        return (
          <button
            key={tab.id}
            ref={(el) => {
              refs.current[index] = el;
            }}
            type="button"
            role="tab"
            id={`${idPrefix}-tab-${tab.id}`}
            aria-selected={active}
            aria-controls={`${idPrefix}-panel-${tab.id}`}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(tab.id)}
            onKeyDown={(e) => onKeyDown(e, index)}
            className={`-mb-px cursor-pointer border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
              active
                ? 'border-brand-200 text-white'
                : 'border-transparent text-brand-300 hover:border-brand-500 hover:text-brand-100'
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

export function TabPanel({ idPrefix, tabId, children }: { idPrefix: string; tabId: string; children: ReactNode }) {
  return (
    <div role="tabpanel" id={`${idPrefix}-panel-${tabId}`} aria-labelledby={`${idPrefix}-tab-${tabId}`} className="pt-4">
      {children}
    </div>
  );
}
