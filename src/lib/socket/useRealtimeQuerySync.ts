import { useEffect } from 'react';
import { useQueryClient, type QueryKey } from '@tanstack/react-query';
import { connectSocket } from './socketClient';

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
 * Empty today: vea-api only pushes `exhibition:visitorCount`, a live value
 * with no backing REST resource to invalidate (see
 * useExhibitionVisitorCount.ts, which handles it directly). The first real
 * entry here will likely be something like an "offerChanged" event
 * invalidating an offer's detail query once the frontend has offer UI.
 */
export const REALTIME_INVALIDATION_MAP: RealtimeInvalidation[] = [];

/** Mount once near the app root once real invalidation entries exist above. */
export function useRealtimeQuerySync(): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (REALTIME_INVALIDATION_MAP.length === 0) return;

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
  }, [queryClient]);
}
