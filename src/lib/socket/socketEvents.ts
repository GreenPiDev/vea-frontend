// Mirrors vea-api/src/realtime/socket-events.ts — same names, same values.
// Two separate repos, no shared package (yet), so this must be updated
// by hand whenever the backend's SOCKET_EVENTS changes. If a shared
// event-name package ever gets introduced, this file and the backend one
// both get replaced by an import from it.
export const SOCKET_EVENTS = {
  // Client -> Server
  ExhibitionJoin: 'exhibition:join',
  ExhibitionLeave: 'exhibition:leave',
  ExhibitionWatch: 'exhibition:watch',
  ExhibitionUnwatch: 'exhibition:unwatch',
  // Server -> Client
  ExhibitionVisitorCount: 'exhibition:visitorCount',
  ExhibitionError: 'exhibition:error',
  NotificationCreated: 'notification:created',
} as const;
