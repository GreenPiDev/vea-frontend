import { io, type Socket } from 'socket.io-client';

const WS_URL = import.meta.env.VITE_API_URL as string;

// One socket for the whole app — every hook that needs realtime data
// (useExhibitionVisitorCount, future useRealtimeQuerySync consumers, etc.)
// shares this connection instead of each opening its own. Lazily created,
// not auto-connected: nothing pays the connection cost until something
// actually needs realtime data.
let socket: Socket | null = null;

function getSocket(): Socket {
  socket ??= io(WS_URL, { transports: ['websocket'], autoConnect: false });
  return socket;
}

export function connectSocket(): Socket {
  const s = getSocket();
  if (!s.connected) s.connect();
  return s;
}

export function disconnectSocket(): void {
  socket?.disconnect();
}
