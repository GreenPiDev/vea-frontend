// Where the frontend sends REST/Socket.IO traffic.
//
// Dev: everything goes to the Vite dev server itself (same origin), which
// proxies `/api/*` and `/socket.io` to the real backend (see vite.config.ts).
// That way the app works unchanged whether it's opened as localhost or from
// a phone on the same Wi-Fi via the machine's LAN IP (which changes from
// network to network) — no IP in .env, no CORS entry per IP.
//
// Prod: talk to VITE_API_URL directly, as before.
export const BACKEND_URL = (import.meta.env.VITE_API_URL as string).replace(/\/$/, '');
export const DEV_PROXY_PREFIX = '/api';

export const API_URL = import.meta.env.DEV ? DEV_PROXY_PREFIX : BACKEND_URL;
// undefined → socket.io-client connects to window.location (the Vite proxy).
export const WS_URL: string | undefined = import.meta.env.DEV ? undefined : BACKEND_URL;

// The backend bakes its own absolute base URL (http://localhost:3000) into
// stored file links (`/files?key=...`). On a phone `localhost` is the phone
// itself, so in dev those links are rewritten to go through the proxy too.
export function rewriteBackendUrls<T>(value: T, backendUrl = BACKEND_URL, prefix = DEV_PROXY_PREFIX): T {
  if (typeof value === 'string') {
    return (value.startsWith(`${backendUrl}/`) ? prefix + value.slice(backendUrl.length) : value) as T;
  }
  if (Array.isArray(value)) {
    return value.map((item) => rewriteBackendUrls(item, backendUrl, prefix)) as T;
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      out[key] = rewriteBackendUrls(item, backendUrl, prefix);
    }
    return out as T;
  }
  return value;
}
