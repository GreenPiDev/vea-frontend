// Highest maxDiscountPercent an artist may set on an artwork. Mirrors
// vea-api's src/common/discount.ts by hand (separate repos, same caveat as
// currencies.ts) — the backend DTO rejects anything above it, this copy only
// lets the form refuse it before the request.
export const MAX_DISCOUNT_PERCENT = 30;

/** Form input value → whether it can be saved. Empty means "no floor". */
export function isValidDiscountInput(raw: string): boolean {
  const value = raw.trim();
  if (value === '') return true;
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 && n <= MAX_DISCOUNT_PERCENT;
}
