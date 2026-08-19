import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useCurrentUser, useRequestCode, useVerifyCode } from './auth';

function wrapper(queryClient: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
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

describe('auth domain hooks', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('useRequestCode POSTs the email to /auth/request-code', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ status: 'sent' }));
    vi.stubGlobal('fetch', fetchMock);
    const queryClient = new QueryClient();

    const { result } = renderHook(() => useRequestCode(), { wrapper: wrapper(queryClient) });
    result.current.mutate('a@b.com');

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/auth/request-code'),
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ email: 'a@b.com' }) }),
    );
  });

  it('useVerifyCode POSTs email+code and resolves the access token', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ accessToken: 'jwt-abc' }));
    vi.stubGlobal('fetch', fetchMock);
    const queryClient = new QueryClient();

    const { result } = renderHook(() => useVerifyCode(), { wrapper: wrapper(queryClient) });
    result.current.mutate({ email: 'a@b.com', code: '123456' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ accessToken: 'jwt-abc' });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/auth/verify-code'),
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ email: 'a@b.com', code: '123456' }) }),
    );
  });

  it('useCurrentUser GETs /auth/me when enabled', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ id: '1', email: 'a@b.com', phone: null, role: 'VISITOR', createdAt: '2026-01-01' }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const queryClient = new QueryClient();

    const { result } = renderHook(() => useCurrentUser({ enabled: true }), { wrapper: wrapper(queryClient) });

    await waitFor(() => expect(result.current.data?.email).toBe('a@b.com'));
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/auth/me'), expect.objectContaining({ method: 'GET' }));
  });

  it('useCurrentUser does not fetch when disabled', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const queryClient = new QueryClient();

    renderHook(() => useCurrentUser({ enabled: false }), { wrapper: wrapper(queryClient) });

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
