import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { AuthProvider, useAuth } from './AuthContext';
import { getAccessToken } from '../api/authToken';

function wrapper(queryClient: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  );
}

function jsonResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    headers: { get: () => 'application/json' },
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

describe('AuthContext', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('starts unauthenticated with no stored token', () => {
    const queryClient = new QueryClient();
    const { result } = renderHook(() => useAuth(), { wrapper: wrapper(queryClient) });

    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.user).toBeUndefined();
  });

  it('login() stores the token and fetches the current user', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ id: '1', email: 'a@b.com', phone: null, role: 'VISITOR', createdAt: 'x' }));
    vi.stubGlobal('fetch', fetchMock);
    const queryClient = new QueryClient();

    const { result } = renderHook(() => useAuth(), { wrapper: wrapper(queryClient) });

    act(() => result.current.login('jwt-abc'));

    await waitFor(() => expect(result.current.user?.email).toBe('a@b.com'));
    expect(getAccessToken()).toBe('jwt-abc');
    expect(result.current.isAuthenticated).toBe(true);
  });

  it('logout() clears the token and de-authenticates', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ id: '1', email: 'a@b.com', phone: null, role: 'VISITOR', createdAt: 'x' }));
    vi.stubGlobal('fetch', fetchMock);
    const queryClient = new QueryClient();

    const { result } = renderHook(() => useAuth(), { wrapper: wrapper(queryClient) });
    act(() => result.current.login('jwt-abc'));
    await waitFor(() => expect(result.current.isAuthenticated).toBe(true));

    act(() => result.current.logout());

    expect(getAccessToken()).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
  });
});
