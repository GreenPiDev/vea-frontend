// Mirrors vea-api's src/common/currencies.ts. Two separate repos, no shared
// package yet, so keep this list manually in sync with the backend's
// allow-list (same reasoning as src/lib/socket/socketEvents.ts).
export const SUPPORTED_CURRENCIES = ['TRY', 'USD', 'EUR', 'GBP'] as const;
export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];
