import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import i18n from '../i18n';
import { getAccessToken, setAccessToken } from '../api/authToken';
import { Paths } from '../api/paths';
import { useCurrentUser, type ApiUser } from '../api/domains/auth';

interface AuthContextValue {
  user: ApiUser | undefined;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (accessToken: string, user: ApiUser) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [hasToken, setHasToken] = useState(() => getAccessToken() !== null);
  const queryClient = useQueryClient();

  const { data: user, isLoading, isError } = useCurrentUser({ enabled: hasToken });

  // A stored token can be stale/invalid (expired, revoked) — /auth/me
  // failing is the source of truth, not the mere presence of the token.
  // Deliberately NOT gated on isLoading/user — /auth/verify-code's response
  // now includes the user object (see login() below), which is written
  // straight into the /auth/me cache in the same tick as hasToken flips, so
  // there's no window where hasToken is true but isAuthenticated lags
  // behind a pending refetch (the previous `isLoading || user !== undefined`
  // clause raced TanStack Query's enabled->fetching transition, which only
  // flips on the next effect, not synchronously with this render).
  const isAuthenticated = hasToken && !isError;

  const login = useCallback(
    (accessToken: string, loggedInUser: ApiUser) => {
      setAccessToken(accessToken);
      queryClient.setQueryData([Paths.AuthMe], loggedInUser);
      setHasToken(true);
    },
    [queryClient],
  );

  const logout = useCallback(() => {
    setAccessToken(null);
    setHasToken(false);
    queryClient.clear();
    // Not a mutation (no network call) — the global MutationCache toast
    // in main.tsx can't cover this, so it's shown directly here.
    toast.success(i18n.t('toastLogoutSuccess'));
  }, [queryClient]);

  const value = useMemo(
    () => ({ user, isLoading: hasToken && isLoading, isAuthenticated, login, logout }),
    [user, hasToken, isLoading, isAuthenticated, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
