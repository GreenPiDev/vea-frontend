import { afterEach, describe, expect, it, vi } from 'vitest';
import { getViewSessionId, randomUuid } from './viewSession';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('viewSession', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
  });

  it('builds a valid v4 UUID without crypto.randomUUID (insecure http context, e.g. LAN dev server)', () => {
    const original = Object.getOwnPropertyDescriptor(crypto, 'randomUUID');
    Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true });
    try {
      const a = randomUuid();
      expect(a).toMatch(UUID_V4);
      expect(randomUuid()).not.toBe(a);
    } finally {
      if (original) Object.defineProperty(crypto, 'randomUUID', original);
      else delete (crypto as { randomUUID?: unknown }).randomUUID;
    }
  });

  it('keeps one id per tab session', () => {
    const id = getViewSessionId();
    expect(getViewSessionId()).toBe(id);
  });

  it('still returns an id when sessionStorage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const id = getViewSessionId();
    expect(id).toMatch(UUID_V4);
    expect(getViewSessionId()).toBe(id);
  });
});
