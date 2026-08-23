import { useEffect, useState } from 'react';
import { connectSocket } from './socketClient';
import { SOCKET_EVENTS } from './socketEvents';

interface VisitorCountPayload {
  exhibitionId: string;
  count: number;
}

function useExhibitionCountSocket(
  exhibitionId: string | undefined,
  joinEvent: string,
  leaveEvent: string,
): number | null {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    setCount(null);
    if (!exhibitionId) return;

    const socket = connectSocket();

    const handleCount = (payload: VisitorCountPayload) => {
      if (payload.exhibitionId === exhibitionId) setCount(payload.count);
    };
    const handleError = (payload: { message: string }) => {
      console.warn('[exhibition socket]', payload.message);
    };

    socket.on(SOCKET_EVENTS.ExhibitionVisitorCount, handleCount);
    socket.on(SOCKET_EVENTS.ExhibitionError, handleError);
    socket.emit(joinEvent, { exhibitionId });

    return () => {
      socket.emit(leaveEvent, { exhibitionId });
      socket.off(SOCKET_EVENTS.ExhibitionVisitorCount, handleCount);
      socket.off(SOCKET_EVENTS.ExhibitionError, handleError);
    };
  }, [exhibitionId, joinEvent, leaveEvent]);

  return count;
}

/** Live visitor count for one exhibition — joins its room while mounted (counts as a real visitor, records a VisitEvent), leaves on unmount/id change. */
export function useExhibitionVisitorCount(exhibitionId: string | undefined): number | null {
  return useExhibitionCountSocket(exhibitionId, SOCKET_EVENTS.ExhibitionJoin, SOCKET_EVENTS.ExhibitionLeave);
}

/** Same live count, but as a passive "watcher" (e.g. the exhibition selector screen showing a badge per card) — does NOT count as a visitor and never records a VisitEvent. See vea-api's ExhibitionGateway watcher room. */
export function useExhibitionWatcherCount(exhibitionId: string | undefined): number | null {
  return useExhibitionCountSocket(exhibitionId, SOCKET_EVENTS.ExhibitionWatch, SOCKET_EVENTS.ExhibitionUnwatch);
}
