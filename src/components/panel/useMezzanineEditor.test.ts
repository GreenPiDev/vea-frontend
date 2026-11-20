import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useMezzanineEditor, type MezzanineRefusal, type MezzanineRoom } from './useMezzanineEditor';
import { useWindowEditor } from './useWindowEditor';
import { DEFAULT_MEZZANINE } from '../3d/mezzanineTemplate';

const room: MezzanineRoom = { size: [16, 12], wallHeight: 7, windows: [] };

describe('useMezzanineEditor', () => {
  it('sends nothing without a mezzanine, the stored data once one is placed', () => {
    const { result } = renderHook(() => useMezzanineEditor());
    expect(result.current.payload).toEqual({});
    let refusal: MezzanineRefusal | null = 'tooLow';
    act(() => {
      refusal = result.current.place('north', room);
    });
    expect(refusal).toBeNull();
    expect(result.current.payload).toEqual({ mezzanine: { ...DEFAULT_MEZZANINE, wallId: 'north' } });
  });

  it('moves to another wall keeping its settings, and makes it shallower when a short room needs it', () => {
    const { result } = renderHook(() => useMezzanineEditor({ wallId: 'north', depth: 3, top: 3.6, stairEnd: 'start' }));
    act(() => {
      result.current.place('east', room);
    });
    expect(result.current.mezzanine).toEqual({ wallId: 'east', depth: 3, top: 3.6, stairEnd: 'start' });
    // A 10 m deep room: 4 m of slab leaves no room for the stair, 2.5 m does.
    const short = renderHook(() => useMezzanineEditor());
    act(() => {
      short.result.current.place('north', { ...room, size: [14, 10] });
    });
    expect(short.result.current.mezzanine?.depth).toBeLessThan(DEFAULT_MEZZANINE.depth);
  });

  it('refuses a change that does not fit, keeping the previous state', () => {
    const { result } = renderHook(() => useMezzanineEditor({ wallId: 'north', ...DEFAULT_MEZZANINE }));
    let refusal: MezzanineRefusal | null = null;
    act(() => {
      refusal = result.current.update({ top: 5.5 }, room);
    });
    expect(refusal).toBe('tooHigh');
    expect(result.current.mezzanine?.top).toBe(DEFAULT_MEZZANINE.top);
    act(() => {
      refusal = result.current.update({ depth: 9 }, room);
    });
    expect(refusal).toBe('tooDeep');
    act(() => {
      refusal = result.current.update({ stairEnd: 'start', depth: 3 }, room);
    });
    expect(refusal).toBeNull();
    expect(result.current.mezzanine).toMatchObject({ stairEnd: 'start', depth: 3 });
  });

  it('refuses a mezzanine a window would cut through, and a room too low for one', () => {
    const windows = [{ id: 'w1', wallId: 'north', alongFraction: 0.5, width: 2, height: 3, sillHeight: 2, styleId: 'classic' as const }];
    const { result } = renderHook(() => useMezzanineEditor());
    let refusal: MezzanineRefusal | null = null;
    act(() => {
      refusal = result.current.place('north', { ...room, windows });
    });
    expect(refusal).toBe('windowInWay');
    act(() => {
      refusal = result.current.place('south', { ...room, windows });
    });
    expect(refusal).toBeNull();
    act(() => {
      refusal = result.current.place('south', { ...room, wallHeight: 5 });
    });
    expect(refusal).toBe('tooHigh');
  });

  it('removes it', () => {
    const { result } = renderHook(() => useMezzanineEditor({ wallId: 'west', ...DEFAULT_MEZZANINE }));
    act(() => result.current.remove());
    expect(result.current.mezzanine).toBeNull();
    expect(result.current.payload).toEqual({});
  });
});

describe('useWindowEditor with a mezzanine', () => {
  it('refuses a window through the slab', () => {
    const { result } = renderHook(() => useWindowEditor());
    // Every placement on this wall would cut through the slab.
    const wall = { id: 'north', length: 16, height: 7, clearOfSlab: () => false };
    let ok = true;
    act(() => {
      ok = result.current.addWindow(wall, 0.5);
    });
    expect(ok).toBe(false);
    expect(result.current.windows).toHaveLength(0);
  });
});
