import type { ReactNode } from 'react';
import { LogoutIcon, CloseIcon } from './icons';

export interface PanelNavItem {
  id: string;
  label: string;
  icon: ReactNode;
}

interface SidebarProps {
  items: PanelNavItem[];
  activeId: string;
  onSelect: (id: string) => void;
  railOpen: boolean;
  onRailOpenChange: (open: boolean) => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
  onLogout: () => void;
  logoutLabel: string;
}

// Desktop: a fixed, icon-only rail that expands on hover (overlaying the
// content, not reflowing it) — see PanelLayout's fixed md:pl-16 offset.
// Mobile: a separate right-side slide-in drawer with the same items, opened
// via PanelLayout's hamburger button. No router — active section is plain
// local state (vea-frontend intentionally has no react-router, see
// vea-frontend/CLAUDE.md), so links are buttons, not NavLink.
export default function Sidebar({
  items,
  activeId,
  onSelect,
  railOpen,
  onRailOpenChange,
  mobileOpen,
  onMobileClose,
  onLogout,
  logoutLabel,
}: SidebarProps) {
  return (
    <>
      <aside
        className={`fixed left-0 top-16 bottom-0 z-40 hidden flex-col justify-between overflow-hidden border-r border-brand-200 bg-white transition-[width] duration-200 md:flex ${
          railOpen ? 'w-60 shadow-[2px_0_12px_rgba(0,0,0,0.08)]' : 'w-16'
        }`}
        onMouseEnter={() => onRailOpenChange(true)}
        onMouseLeave={() => onRailOpenChange(false)}
      >
        <nav className="flex flex-col py-3">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(item.id)}
              className={`flex h-12 w-full items-center whitespace-nowrap text-sm font-medium ${
                activeId === item.id
                  ? 'bg-brand-100 text-brand-800'
                  : 'text-brand-600 hover:bg-brand-50 hover:text-brand-900'
              }`}
            >
              <span className="flex w-16 flex-shrink-0 items-center justify-center">{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
        <button
          type="button"
          onClick={onLogout}
          className="mb-3 flex h-12 w-full items-center whitespace-nowrap text-sm font-medium text-red-600 hover:bg-red-50"
        >
          <span className="flex w-16 flex-shrink-0 items-center justify-center">
            <LogoutIcon />
          </span>
          <span>{logoutLabel}</span>
        </button>
      </aside>

      <div
        className={`fixed inset-0 z-[150] bg-black/40 transition-opacity duration-200 md:hidden ${
          mobileOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        onClick={onMobileClose}
        aria-hidden="true"
      />
      {mobileOpen && (
        <div role="dialog" aria-modal="true" className="fixed inset-y-0 right-0 z-[200] flex w-4/5 max-w-[300px] flex-col bg-white shadow-[-2px_0_16px_rgba(0,0,0,0.12)] md:hidden">
          <div className="flex h-16 flex-shrink-0 items-center justify-end border-b border-brand-200 px-4">
            <button type="button" onClick={onMobileClose} className="text-brand-600 hover:text-brand-900" aria-label={logoutLabel}>
              <CloseIcon />
            </button>
          </div>
          <nav className="flex flex-1 flex-col overflow-y-auto py-2">
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  onSelect(item.id);
                  onMobileClose();
                }}
                className={`flex h-11 w-full items-center whitespace-nowrap text-sm font-medium ${
                  activeId === item.id
                    ? 'bg-brand-100 text-brand-800'
                    : 'text-brand-600 hover:bg-brand-50 hover:text-brand-900'
                }`}
              >
                <span className="flex w-16 flex-shrink-0 items-center justify-center">{item.icon}</span>
                <span>{item.label}</span>
              </button>
            ))}
          </nav>
          <button
            type="button"
            onClick={onLogout}
            className="mb-3 flex h-11 w-full flex-shrink-0 items-center whitespace-nowrap text-sm font-medium text-red-600 hover:bg-red-50"
          >
            <span className="flex w-16 flex-shrink-0 items-center justify-center">
              <LogoutIcon />
            </span>
            <span>{logoutLabel}</span>
          </button>
        </div>
      )}
    </>
  );
}
