import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../lib/auth/AuthContext';
import Sidebar, { type PanelNavItem } from './Sidebar';
import { ArrowLeftIcon, MenuIcon } from './icons';
import NotificationBell from '../notifications/NotificationBell';
import Tooltip from './Tooltip';

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
      <header className="fixed inset-x-0 top-0 z-50 flex h-16 items-center justify-between border-b border-brand-300 bg-brand-200 pr-4 md:pr-6">
        <div className="flex min-w-0 items-center gap-4">
          {/* w-16 matches Sidebar's rail width so this icon lines up
              directly above the sidebar's icon column below it. */}
          <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center">
            <Tooltip label={t('panelBackToGallery')}>
              <button
                type="button"
                onClick={onBack}
                aria-label={t('panelBackToGallery')}
                className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-brand-300 text-brand-700 transition-colors hover:border-brand-400 hover:bg-brand-100 hover:text-brand-900"
              >
                <ArrowLeftIcon />
              </button>
            </Tooltip>
          </div>
          <h1 className="truncate text-base font-semibold text-brand-900">{title}</h1>
        </div>
        <div className="flex flex-shrink-0 items-center gap-3">
          <NotificationBell />
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

      {/* Darkened sanat-galerisi.jpg backdrop — shared by every role's
          dashboard since they all render through this shell. The overlay is
          baked into the same `backgroundImage` (linear-gradient stacked on
          top of the url()) rather than a separate absolutely-positioned
          layer, so there's no extra element to keep in sync with <main>'s
          scroll/size. */}
      <main
        className="relative h-full overflow-y-auto bg-cover bg-center bg-no-repeat pt-16 md:pl-16"
        style={{
          backgroundImage:
            "linear-gradient(rgba(15, 10, 6, 0.72), rgba(15, 10, 6, 0.72)), url('/sanat-galerisi.jpg')",
        }}
      >
        <div className="max-w-6xl px-6 py-8">{children}</div>
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
