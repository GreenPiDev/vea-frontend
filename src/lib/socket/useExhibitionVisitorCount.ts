import { useEffect, useState } from 'react';
import { connectSocket } from './socketClient';
import { SOCKET_EVENTS } from './socketEvents';

interface VisitorCountPayload {
  exhibitionId: string;
  count: number;
}

/** Live visitor count for one exhibition — joins its room while mounted, leaves on unmount/id change. */
export function useExhibitionVisitorCount(exhibitionId: string | undefined): number | null {
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
    socket.emit(SOCKET_EVENTS.ExhibitionJoin, { exhibitionId });

    return () => {
      socket.emit(SOCKET_EVENTS.ExhibitionLeave);
      socket.off(SOCKET_EVENTS.ExhibitionVisitorCount, handleCount);
      socket.off(SOCKET_EVENTS.ExhibitionError, handleError);
    };
  }, [exhibitionId]);

  return count;
}
