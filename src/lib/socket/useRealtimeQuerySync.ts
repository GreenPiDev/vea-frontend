import { useEffect } from 'react';
import { useQueryClient, type QueryKey } from '@tanstack/react-query';
import { connectSocket } from './socketClient';
import { SOCKET_EVENTS } from './socketEvents';
import { Paths } from '../api/paths';

interface RealtimeInvalidation {
  event: string;
  /** Refetched on every emission of `event`. */
  invalidateKeys: QueryKey[];
  /**
   * Extra keys refetched only when the payload's `type` matches. Lets one
   * generic event (notification:created carries every notification kind)
   * refresh just the lists that kind actually affects, instead of
   * refetching every panel list on every notification.
   */
  invalidateKeysByType?: Record<string, QueryKey[]>;
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
 *
 * Notification `type` strings mirror vea-api (offers.service.ts's
 * NOTIFICATION_TYPES, artwork removal-request service) and
 * NotificationBell.tsx's renderMessage — keep them in sync by hand.
 */
export const REALTIME_INVALIDATION_MAP: RealtimeInvalidation[] = [
  {
    event: SOCKET_EVENTS.NotificationCreated,
    invalidateKeys: [
      [Paths.Notifications],
      [Paths.Notifications, 'unread-count'],
    ],
    invalidateKeysByType: {
      // New offer -> artist's /dashboard/artist/offers table. The
      // [OffersMineSelling] prefix also covers the admin's org-wide list
      // ([OffersMineSelling, 'organization']), whose admins get the same
      // notification.
      OFFER_CREATED: [[Paths.OffersMineSelling]],
      // Artist decision -> buyer's own offer list + org-wide admin list.
      OFFER_DECISION: [[Paths.OffersMineBuying], [Paths.OffersMineSelling]],
      // Removal requests keep the curator's "Sergiden Kaldırma Talepleri"
      // table and the artist's ArtworkList.tsx pending-badge live.
      ARTWORK_REMOVAL_REQUESTED: [[Paths.ArtworkRemovalRequests, 'organization'], [Paths.ArtworksMine]],
      ARTWORK_REMOVAL_DECIDED: [[Paths.ArtworkRemovalRequests, 'organization'], [Paths.ArtworksMine]],
    },
  },
];

/** Pure: which query keys one emission should invalidate. Exported for tests. */
export function resolveInvalidationKeys(entry: RealtimeInvalidation, payload: unknown): QueryKey[] {
  const type =
    payload && typeof payload === 'object' && 'type' in payload && typeof payload.type === 'string'
      ? payload.type
      : undefined;
  const byType = type ? entry.invalidateKeysByType?.[type] : undefined;
  return byType ? [...entry.invalidateKeys, ...byType] : entry.invalidateKeys;
}

/**
 * Mount once near the app root. `enabled` should be `isAuthenticated`
 * (App.tsx) — every entry above is personal (notifications), so there's
 * nothing to sync for an anonymous visitor and no point paying the
 * connection cost for them.
 *
 * invalidateQueries only refetches *mounted* queries; inactive ones are just
 * marked stale and refetch when their page opens — so an artist who isn't on
 * the offers page pays nothing for an OFFER_CREATED event.
 */
export function useRealtimeQuerySync(enabled: boolean): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!enabled || REALTIME_INVALIDATION_MAP.length === 0) return;

    const socket = connectSocket();
    const registered = REALTIME_INVALIDATION_MAP.map((entry) => {
      const handler = (payload: unknown) => {
        resolveInvalidationKeys(entry, payload).forEach((queryKey) => {
          void queryClient.invalidateQueries({ queryKey });
        });
      };
      socket.on(entry.event, handler);
      return { event: entry.event, handler };
    });

    return () => {
      registered.forEach(({ event, handler }) => socket.off(event, handler));
    };
  }, [queryClient, enabled]);
}
