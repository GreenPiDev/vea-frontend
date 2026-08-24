import { Fragment, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../lib/auth/AuthContext';
import Login from './Login';
import NotificationBell from '../notifications/NotificationBell';

interface AuthBarProps {
  /** Mirrors Header's transparent-at-top vs. scrolled "milky coffee" state,
   * so the plain-text login link stays readable/consistent with the brand
   * title in both. */
  atTop?: boolean;
}

// Plain-text link matching "Giriş Yap"'s treatment (color mirrors Header's
// transparent-at-top vs. scrolled state, animated left-to-right underline
// on hover) — shared so Panel/Çıkış Yap don't each re-implement the
// underline-span markup.
function HeaderTextLink({
  atTop,
  onClick,
  children,
}: {
  atTop?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group relative cursor-pointer text-sm font-medium transition-colors duration-300 ${
        atTop ? 'text-white hover:text-brand-200' : 'text-brand-900 hover:text-brand-600'
      }`}
    >
      {children}
      <span
        className={`absolute -bottom-0.5 left-0 h-px w-full origin-left scale-x-0 transition-transform duration-150 ease-out group-hover:scale-x-100 ${
          atTop ? 'bg-brand-200' : 'bg-brand-600'
        }`}
      />
    </button>
  );
}

// Auth control, rendered inside Header's fixed bar. Deliberately doesn't
// gate the rest of the app — exhibition browsing/viewing is public (GET
// /exhibitions has no guard on the backend), so login is opt-in via this
// button, not a full-screen wall. The "Panel" link routes to /dashboard,
// which picks the right panel per role itself (see pages/Dashboard.tsx) —
// this component doesn't need to know about roles. Email isn't shown here
// — it's PanelLayout's header that surfaces it, once the user is actually
// inside a panel; this row is just the entry points (bell/Panel/Çıkış Yap).
export default function AuthBar({ atTop }: AuthBarProps) {
  const { t } = useTranslation();
  const { isAuthenticated, logout } = useAuth();
  const [showLogin, setShowLogin] = useState(false);
  const navigate = useNavigate();

  const items: React.ReactNode[] = isAuthenticated
    ? [
        <NotificationBell key="bell" atTop={atTop} />,
        <HeaderTextLink key="panel" atTop={atTop} onClick={() => navigate('/dashboard')}>
          {t('panelOpen')}
        </HeaderTextLink>,
        <HeaderTextLink key="logout" atTop={atTop} onClick={logout}>
          {t('authLogout')}
        </HeaderTextLink>,
      ]
    : [
        <HeaderTextLink key="login" atTop={atTop} onClick={() => setShowLogin(true)}>
          {t('authLogin')}
        </HeaderTextLink>,
      ];

  return (
    <>
      <div className="flex items-center gap-4">
        {items.map((item, i) => (
          <Fragment key={i}>
            {i > 0 && <span className={atTop ? 'text-white/30' : 'text-brand-900/30'}>|</span>}
            {item}
          </Fragment>
        ))}
      </div>

      {showLogin &&
        createPortal(
          // Rendered via a portal (not inline here) because Header — this
          // component's parent — always has an active CSS `transform` (its
          // scroll show/hide animation), which makes it the containing
          // block for any `position: fixed` descendant. Left inline, this
          // overlay would be trapped inside Header's small box instead of
          // covering/centering on the whole viewport.
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
            onClick={() => setShowLogin(false)}
          >
            <div className="w-full max-w-md px-4" onClick={(e) => e.stopPropagation()}>
              <Login
                onSuccess={() => {
                  setShowLogin(false);
                  navigate('/dashboard');
                }}
              />
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
