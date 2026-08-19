// Persists user-drawn exhibitions (created via ExhibitionBuilder) to
// localStorage. Everything on Exhibition is plain JSON-serializable data
// (numbers/strings/arrays), so a straight round-trip is enough.

import type { Exhibition } from "./exhibitions";

const STORAGE_KEY = "sanal-sergi-custom-exhibitions";

export function loadCustomExhibitions(): Exhibition[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Exhibition[]) : [];
  } catch {
    return [];
  }
}

export function saveCustomExhibitions(list: Exhibition[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // Storage full or unavailable (e.g. private browsing) — silently skip persistence.
  }
}
