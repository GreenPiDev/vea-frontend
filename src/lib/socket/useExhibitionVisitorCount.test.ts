import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { act } from 'react';
import { useExhibitionVisitorCount } from './useExhibitionVisitorCount';
import { SOCKET_EVENTS } from './socketEvents';

const handlers = new Map<string, (payload: unknown) => void>();
const fakeSocket = {
  connected: false,
  connect: vi.fn(function (this: typeof fakeSocket) {
    this.connected = true;
  }),
  emit: vi.fn(),
  on: vi.fn((event: string, handler: (payload: unknown) => void) => {
    handlers.set(event, handler);
  }),
  off: vi.fn((event: string) => {
    handlers.delete(event);
  }),
};

vi.mock('socket.io-client', () => ({
  io: () => fakeSocket,
}));

describe('useExhibitionVisitorCount', () => {
  beforeEach(() => {
    handlers.clear();
    vi.clearAllMocks();
    fakeSocket.connected = false;
  });

  it('joins the exhibition room on mount and starts at null', () => {
    const { result } = renderHook(() => useExhibitionVisitorCount('exh-1'));

    expect(result.current).toBeNull();
    expect(fakeSocket.emit).toHaveBeenCalledWith(SOCKET_EVENTS.ExhibitionJoin, {
      exhibitionId: 'exh-1',
    });
  });

  it('updates the count when a matching visitorCount event arrives', () => {
    const { result } = renderHook(() => useExhibitionVisitorCount('exh-1'));

    act(() => {
      handlers.get(SOCKET_EVENTS.ExhibitionVisitorCount)?.({ exhibitionId: 'exh-1', count: 3 });
    });

    expect(result.current).toBe(3);
  });

  it('ignores a visitorCount event for a different exhibition', () => {
    const { result } = renderHook(() => useExhibitionVisitorCount('exh-1'));

    act(() => {
      handlers.get(SOCKET_EVENTS.ExhibitionVisitorCount)?.({ exhibitionId: 'exh-other', count: 9 });
    });

    expect(result.current).toBeNull();
  });

  it('leaves the room and cleans up listeners on unmount', () => {
    const { unmount } = renderHook(() => useExhibitionVisitorCount('exh-1'));
    unmount();

    expect(fakeSocket.emit).toHaveBeenCalledWith(SOCKET_EVENTS.ExhibitionLeave);
    expect(fakeSocket.off).toHaveBeenCalledWith(
      SOCKET_EVENTS.ExhibitionVisitorCount,
      expect.any(Function),
    );
  });

  it('does nothing when exhibitionId is undefined', () => {
    renderHook(() => useExhibitionVisitorCount(undefined));
    expect(fakeSocket.emit).not.toHaveBeenCalled();
  });
});
