import { useState } from 'react';
import { useAuth } from '../../lib/auth/AuthContext';
import Login from './Login';

// Fixed top-right auth control, mounted once at the App root. Deliberately
// doesn't gate the rest of the app — exhibition browsing/viewing is public
// (GET /exhibitions has no guard on the backend), so login is opt-in via
// this button, not a full-screen wall.
export default function AuthBar() {
  const { user, isLoading, isAuthenticated, logout } = useAuth();
  const [showLogin, setShowLogin] = useState(false);

  return (
    <>
      <div className="fixed top-3 right-3 z-50">
        {isAuthenticated ? (
          <div className="flex items-center gap-2 rounded-md bg-white/90 px-3 py-1.5 text-sm shadow-sm backdrop-blur">
            <span className="text-neutral-700">{isLoading ? '…' : user?.email}</span>
            <button onClick={logout} className="text-neutral-500 underline hover:text-neutral-800">
              Çıkış Yap
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowLogin(true)}
            className="rounded-md bg-white/90 px-3 py-1.5 text-sm font-medium text-neutral-800 shadow-sm backdrop-blur hover:bg-white"
          >
            Giriş Yap
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
