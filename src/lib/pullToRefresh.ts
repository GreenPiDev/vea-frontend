// Pure helpers for PullToRefresh.tsx.

/** Finger travel (px) needed to trigger a reload. */
export const PULL_TRIGGER = 140;
/** Finger travel (px) before the indicator starts to appear — keeps ordinary taps/scroll jitter quiet. */
export const PULL_DEADZONE = 12;
/** How far (px) the indicator itself travels at most. */
export const PULL_MAX_OFFSET = 90;

/** Indicator offset for a given finger travel — follows the finger with growing resistance. */
export function pullOffset(distance: number): number {
  if (distance <= PULL_DEADZONE) return 0;
  const d = distance - PULL_DEADZONE;
  return PULL_MAX_OFFSET * (1 - Math.exp(-d / PULL_MAX_OFFSET));
}

/** 0..1 progress toward the reload threshold. */
export function pullProgress(distance: number): number {
  return Math.min(1, Math.max(0, distance / PULL_TRIGGER));
}

/** Minimal shape of an element for the scroll check (keeps this testable without a real layout). */
export interface ScrollableLike {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
  overflowY: string;
}

/** A pull may only start when nothing the finger is on can still scroll up. */
export function canStartPull(ancestors: ScrollableLike[]): boolean {
  return ancestors.every((el) => {
    const scrollable = (el.overflowY === 'auto' || el.overflowY === 'scroll') && el.scrollHeight > el.clientHeight;
    return !scrollable || el.scrollTop <= 0;
  });
}
