// A per-tab, anonymous session id — not an identity/auth mechanism, just
// fills vea-api's VisitEvent.sessionId (a required column) for artwork-view
// recording. sessionStorage (not localStorage) so a fresh tab gets a fresh
// id, matching "session" semantics.
const STORAGE_KEY = 'vea_view_session_id';

export function getViewSessionId(): string {
  let id = sessionStorage.getItem(STORAGE_KEY);
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem(STORAGE_KEY, id);
  }
  return id;
}
