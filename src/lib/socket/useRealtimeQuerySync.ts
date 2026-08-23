import { useEffect } from 'react';
import { useQueryClient, type QueryKey } from '@tanstack/react-query';
import { connectSocket } from './socketClient';
import { SOCKET_EVENTS } from './socketEvents';
import { Paths } from '../api/paths';

interface RealtimeInvalidation {
  event: string;
  invalidateKeys: QueryKey[];
}

/**
 * Central map: socket event name -> which TanStack Query keys to refetch
 * when it fires. Add an entry here instead of writing an ad hoc `socket.on`
 * next to whatever component happens to need it — mirrors the pattern from
 * another project's socketConstant.ts + useWebSocket.ts (davinci-frontend),
 * scaled down for what vea-api currently emits.
 *
 * `exhibition:visitorCount` isn't here — it's a live value with no backing
 * REST resource to invalidate (see useExhibitionVisitorCount.ts, which
 * handles it directly).
 */
export const REALTIME_INVALIDATION_MAP: RealtimeInvalidation[] = [
  {
    event: SOCKET_EVENTS.NotificationCreated,
    invalidateKeys: [[Paths.Notifications], [Paths.Notifications, 'unread-count']],
  },
];

/**
 * Mount once near the app root. `enabled` should be `isAuthenticated`
 * (App.tsx) — every entry above is personal (notifications), so there's
 * nothing to sync for an anonymous visitor and no point paying the
 * connection cost for them.
 */
export function useRealtimeQuerySync(enabled: boolean): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!enabled || REALTIME_INVALIDATION_MAP.length === 0) return;

    const socket = connectSocket();
    const registered = REALTIME_INVALIDATION_MAP.map(({ event, invalidateKeys }) => {
      const handler = () => {
        invalidateKeys.forEach((queryKey) => {
          void queryClient.invalidateQueries({ queryKey });
        });
      };
      socket.on(event, handler);
      return { event, handler };
    });

    return () => {
      registered.forEach(({ event, handler }) => socket.off(event, handler));
    };
  }, [queryClient, enabled]);
}
