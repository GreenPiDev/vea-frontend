import { createContext, useContext, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getAccessToken, setAccessToken } from '../api/authToken';
import { useCurrentUser, type ApiUser } from '../api/domains/auth';

interface AuthContextValue {
  user: ApiUser | undefined;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (accessToken: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [hasToken, setHasToken] = useState(() => getAccessToken() !== null);
  const queryClient = useQueryClient();

  const { data: user, isLoading, isError } = useCurrentUser({ enabled: hasToken });

  // A stored token can be stale/invalid (expired, revoked) — /auth/me
  // failing is the source of truth, not the mere presence of the token.
  const isAuthenticated = hasToken && !isError && (isLoading || user !== undefined);

  function login(accessToken: string) {
    setAccessToken(accessToken);
    setHasToken(true);
  }

  function logout() {
    setAccessToken(null);
    setHasToken(false);
    queryClient.clear();
  }

  return (
    <AuthContext.Provider value={{ user, isLoading: hasToken && isLoading, isAuthenticated, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
