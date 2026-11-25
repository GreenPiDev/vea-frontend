import { describe, expect, it } from 'vitest';
import { REALTIME_INVALIDATION_MAP, resolveInvalidationKeys } from './useRealtimeQuerySync';
import { SOCKET_EVENTS } from './socketEvents';
import { Paths } from '../api/paths';

const notificationEntry = REALTIME_INVALIDATION_MAP.find((e) => e.event === SOCKET_EVENTS.NotificationCreated)!;

describe('resolveInvalidationKeys', () => {
  it('refreshes the seller offer list on OFFER_CREATED', () => {
    const keys = resolveInvalidationKeys(notificationEntry, { id: 'n1', type: 'OFFER_CREATED', payload: {} });
    expect(keys).toContainEqual([Paths.OffersMineSelling]);
    expect(keys).toContainEqual([Paths.Notifications]);
  });

  it('refreshes buyer + seller offer lists on OFFER_DECISION', () => {
    const keys = resolveInvalidationKeys(notificationEntry, { type: 'OFFER_DECISION' });
    expect(keys).toContainEqual([Paths.OffersMineBuying]);
    expect(keys).toContainEqual([Paths.OffersMineSelling]);
  });

  it('does not refetch offer lists for unrelated notification types', () => {
    const keys = resolveInvalidationKeys(notificationEntry, { type: 'ARTWORK_REMOVAL_REQUESTED' });
    expect(keys).not.toContainEqual([Paths.OffersMineSelling]);
    expect(keys).toContainEqual([Paths.ArtworksMine]);
  });

  it('falls back to base keys for unknown or malformed payloads', () => {
    expect(resolveInvalidationKeys(notificationEntry, undefined)).toEqual(notificationEntry.invalidateKeys);
    expect(resolveInvalidationKeys(notificationEntry, { type: 42 })).toEqual(notificationEntry.invalidateKeys);
    expect(resolveInvalidationKeys(notificationEntry, { type: 'SOMETHING_NEW' })).toEqual(notificationEntry.invalidateKeys);
  });
});
