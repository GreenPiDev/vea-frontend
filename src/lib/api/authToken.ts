// Minimal token storage — there's no login UI yet (auth backend exists,
// frontend doesn't consume it yet), but the API client needs a single place
// to read/write the JWT once that UI is built, without every call site
// reaching into localStorage directly.
const STORAGE_KEY = 'vea_access_token';

export function getAccessToken(): string | null {
  return localStorage.getItem(STORAGE_KEY);
}

export function setAccessToken(token: string | null): void {
  if (token) {
    localStorage.setItem(STORAGE_KEY, token);
  } else {
    localStorage.removeItem(STORAGE_KEY);
  }
}
