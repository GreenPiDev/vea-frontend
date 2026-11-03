// A per-tab, anonymous session id — not an identity/auth mechanism, just
// fills vea-api's VisitEvent.sessionId (a required column) for artwork-view
// recording. sessionStorage (not localStorage) so a fresh tab gets a fresh
// id, matching "session" semantics.
const STORAGE_KEY = 'vea_view_session_id';

// In-memory fallback for when sessionStorage is unavailable (blocked/private mode).
let memoryId: string | null = null;

/**
 * RFC 4122 v4 UUID. `crypto.randomUUID` only exists in secure contexts (HTTPS or localhost) — a phone
 * opening the dev server over the LAN (`http://192.168…`) doesn't have it, and calling it crashed the
 * artwork card. `crypto.getRandomValues` is available everywhere, so build the UUID from that instead.
 */
export function randomUuid(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10xx
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function getViewSessionId(): string {
  try {
    let id = sessionStorage.getItem(STORAGE_KEY);
    if (!id) {
      id = randomUuid();
      sessionStorage.setItem(STORAGE_KEY, id);
    }
    return id;
  } catch {
    memoryId ??= randomUuid();
    return memoryId;
  }
}
