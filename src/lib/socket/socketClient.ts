import { io, type Socket } from 'socket.io-client';
import { WS_URL } from '../api/apiBase';
import { getAccessToken } from '../api/authToken';

// One socket for the whole app — every hook that needs realtime data
// (useExhibitionVisitorCount, useRealtimeQuerySync consumers like
// NotificationBell, etc.) shares this connection instead of each opening
// its own. Lazily created, not auto-connected: nothing pays the connection
// cost until something actually needs realtime data.
//
// The JWT (if any) is read once, at connect time, and sent as handshake
// auth so the backend's NotificationsGateway can join this socket to the
// user's personal room — see vea-api's notifications.gateway.ts. Not
// dynamically re-authenticated on login/logout: in practice the socket is
// only ever connected anonymously (exhibition visitor count, no auth
// needed) or by an already-authenticated consumer (NotificationBell, only
// mounted when isAuthenticated), so this simplification is safe today.
let socket: Socket | null = null;

function getSocket(): Socket {
  if (!socket) {
    const options = {
      transports: ['websocket'],
      autoConnect: false,
      auth: { token: getAccessToken() },
    };
    // WS_URL undefined in dev → same origin, through the Vite /socket.io proxy.
    socket = WS_URL ? io(WS_URL, options) : io(options);
  }
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
