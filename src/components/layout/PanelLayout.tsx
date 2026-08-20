import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../lib/auth/AuthContext';
import Sidebar, { type PanelNavItem } from './Sidebar';
import { MenuIcon } from './icons';

interface PanelLayoutProps {
  title: string;
  navItems: PanelNavItem[];
  activeSectionId: string;
  onSelectSection: (id: string) => void;
  onBack: () => void;
  children: ReactNode;
}

// Shared dashboard shell (topbar + sidebar + content) for ArtistPanel and
// CuratorPanel — more sections will be added to each panel's navItems over
// time, this is the chrome they'll all sit inside. Root is h-full (not
// min-height) because #root has height:100%/overflow:hidden — only the
// inner <main> scrolls, same fix documented in vea-frontend/CLAUDE.md's
// "known environment quirk" section for other full-height panels.
export default function PanelLayout({ title, navItems, activeSectionId, onSelectSection, onBack, children }: PanelLayoutProps) {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const [railOpen, setRailOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="h-full w-full bg-brand-50">
      <header className="fixed inset-x-0 top-0 z-50 flex h-16 items-center justify-between border-b border-brand-200 bg-white px-4 md:px-6">
        <div className="flex items-center gap-4 min-w-0">
          <button onClick={onBack} className="flex-shrink-0 text-sm text-brand-700 underline hover:text-brand-900">
            {t('panelBackToGallery')}
          </button>
          <h1 className="truncate text-base font-semibold text-brand-900">{title}</h1>
        </div>
        <div className="flex flex-shrink-0 items-center gap-3">
          <span className="hidden text-sm text-brand-700 sm:inline">{user?.email}</span>
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="flex h-9 w-9 items-center justify-center text-brand-700 md:hidden"
            aria-label={title}
          >
            <MenuIcon />
          </button>
        </div>
      </header>

      <Sidebar
        items={navItems}
        activeId={activeSectionId}
        onSelect={onSelectSection}
        railOpen={railOpen}
        onRailOpenChange={setRailOpen}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
        onLogout={logout}
        logoutLabel={t('authLogout')}
      />

      <main className="h-full overflow-y-auto pt-16 md:pl-16">
        <div className="mx-auto max-w-3xl px-6 py-8">{children}</div>
      </main>

      <div
        className={`fixed inset-0 top-16 z-30 hidden bg-black/25 transition-opacity duration-200 md:block ${
          railOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        onClick={() => setRailOpen(false)}
        aria-hidden="true"
      />
    </div>
  );
}
