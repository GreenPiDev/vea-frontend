import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useApiGetList, useApiMutations } from './factory';

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

describe('useApiGetList', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches the given path and returns the parsed list', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse([{ id: '1', title: 'A' }])),
    );
    const queryClient = new QueryClient();

    const { result } = renderHook(() => useApiGetList<{ id: string; title: string }>('/exhibitions'), {
      wrapper: wrapper(queryClient),
    });

    await waitFor(() => expect(result.current.data).toEqual([{ id: '1', title: 'A' }]));
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/exhibitions'),
      expect.objectContaining({ method: 'GET' }),
    );
  });
});

describe('useApiMutations', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('POSTs on create and invalidates the list query', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: '1', title: 'New' }));
    vi.stubGlobal('fetch', fetchMock);
    const queryClient = new QueryClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useApiMutations<{ id: string; title: string }>('/exhibitions'), {
      wrapper: wrapper(queryClient),
    });

    result.current.create.mutate({ title: 'New' });

    await waitFor(() => expect(result.current.create.isSuccess).toBe(true));
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/exhibitions'),
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ title: 'New' }) }),
    );
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['/exhibitions'] });
  });

  it('DELETEs the given id on remove', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}));
    vi.stubGlobal('fetch', fetchMock);
    const queryClient = new QueryClient();

    const { result } = renderHook(() => useApiMutations<{ id: string }>('/exhibitions'), {
      wrapper: wrapper(queryClient),
    });

    result.current.remove.mutate('abc');

    await waitFor(() => expect(result.current.remove.isSuccess).toBe(true));
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/exhibitions/abc'),
      expect.objectContaining({ method: 'DELETE' }),
    );
  });
});
