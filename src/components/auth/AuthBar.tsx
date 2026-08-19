import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../lib/auth/AuthContext';
import Login from './Login';

interface AuthBarProps {
  onOpenPanel?: () => void;
}

// Fixed top-right auth control, mounted once at the App root. Deliberately
// doesn't gate the rest of the app — exhibition browsing/viewing is public
// (GET /exhibitions has no guard on the backend), so login is opt-in via
// this button, not a full-screen wall. The "Panel" link (artist profile +
// artwork management) lives in the same fixed container instead of a
// second independent fixed element, so the two never overlap.
export default function AuthBar({ onOpenPanel }: AuthBarProps) {
  const { t } = useTranslation();
  const { user, isLoading, isAuthenticated, logout } = useAuth();
  const [showLogin, setShowLogin] = useState(false);

  return (
    <>
      <div className="fixed top-3 right-3 z-50 flex items-center gap-2">
        {isAuthenticated && onOpenPanel && (
          <button
            onClick={onOpenPanel}
            className="rounded-md bg-brand-50/90 px-3 py-1.5 text-sm font-medium text-brand-800 shadow-sm backdrop-blur hover:bg-brand-100"
          >
            {t('panelOpen')}
          </button>
        )}
        {isAuthenticated ? (
          <div className="flex items-center gap-2 rounded-md bg-brand-50/90 px-3 py-1.5 text-sm shadow-sm backdrop-blur">
            <span className="text-brand-800">{isLoading ? '…' : user?.email}</span>
            <button onClick={logout} className="text-brand-600 underline hover:text-brand-900">
              {t('authLogout')}
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowLogin(true)}
            className="rounded-md bg-brand-50/90 px-3 py-1.5 text-sm font-medium text-brand-800 shadow-sm backdrop-blur hover:bg-brand-100"
          >
            {t('authLogin')}
          </button>
        )}
      </div>

      {showLogin && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={() => setShowLogin(false)}
        >
          <div onClick={(e) => e.stopPropagation()}>
            <Login onSuccess={() => setShowLogin(false)} />
          </div>
        </div>
      )}
    </>
  );
}
