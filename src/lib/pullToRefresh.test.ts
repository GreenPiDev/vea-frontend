import { describe, expect, it } from 'vitest';
import { PULL_DEADZONE, PULL_MAX_OFFSET, PULL_TRIGGER, canStartPull, pullOffset, pullProgress } from './pullToRefresh';

describe('pullToRefresh', () => {
  it('ignores tiny movements', () => {
    expect(pullOffset(PULL_DEADZONE)).toBe(0);
  });

  it('follows the finger with resistance, never past the max', () => {
    expect(pullOffset(60)).toBeGreaterThan(0);
    expect(pullOffset(60)).toBeLessThan(60);
    expect(pullOffset(10_000)).toBeLessThanOrEqual(PULL_MAX_OFFSET);
  });

  it('reaches full progress at the trigger distance', () => {
    expect(pullProgress(PULL_TRIGGER / 2)).toBeCloseTo(0.5);
    expect(pullProgress(PULL_TRIGGER * 3)).toBe(1);
    expect(pullProgress(-20)).toBe(0);
  });

  it('only starts when no scroll container under the finger is scrolled down', () => {
    const top = { scrollTop: 0, scrollHeight: 2000, clientHeight: 800, overflowY: 'auto' };
    const scrolled = { ...top, scrollTop: 300 };
    const hiddenOverflow = { scrollTop: 50, scrollHeight: 2000, clientHeight: 800, overflowY: 'hidden' };
    expect(canStartPull([top])).toBe(true);
    expect(canStartPull([top, scrolled])).toBe(false);
    expect(canStartPull([hiddenOverflow])).toBe(true);
  });
});
