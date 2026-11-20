import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useWindowEditor } from './useWindowEditor';
import { MAX_WINDOWS_PER_ROOM } from '../3d/windowOpenings';

const wall = { id: 'north', length: 10, height: 4 };

describe('useWindowEditor', () => {
  it('sends nothing for a closed room, and windows + view once a window exists', () => {
    const { result } = renderHook(() => useWindowEditor());
    expect(result.current.payload).toEqual({});
    act(() => {
      result.current.addWindow(wall, 0.5);
    });
    expect(result.current.payload.windows).toHaveLength(1);
    expect(result.current.payload.outdoor?.panoramaId).toBeTruthy();
    expect(result.current.selected?.wallId).toBe('north');
  });

  it('adds the chosen style, refuses an overlapping window and a move onto another one', () => {
    const { result } = renderHook(() => useWindowEditor());
    act(() => result.current.setNewStyle('modern'));
    act(() => {
      expect(result.current.addWindow(wall, 0.25)).toBe(true);
    });
    expect(result.current.windows[0].styleId).toBe('modern');
    act(() => {
      expect(result.current.addWindow(wall, 0.3)).toBe(false);
    });
    act(() => {
      expect(result.current.addWindow(wall, 0.75)).toBe(true);
    });
    const [a, b] = result.current.windows;
    act(() => {
      expect(result.current.updateWindow(b.id, { alongFraction: a.alongFraction + 0.05 }, wall)).toBe(false);
    });
    expect(result.current.windows[1].alongFraction).toBe(b.alongFraction);
  });

  it('clamps sizes into the wall and swaps proportions with the style', () => {
    const { result } = renderHook(() => useWindowEditor());
    act(() => {
      result.current.addWindow(wall, 0.5);
    });
    const id = result.current.windows[0].id;
    act(() => {
      result.current.updateWindow(id, { height: 50 }, wall);
    });
    const w = result.current.windows[0];
    expect(w.sillHeight + w.height).toBeLessThanOrEqual(4);
    act(() => {
      result.current.updateWindow(id, { styleId: 'panorama' }, wall);
    });
    expect(result.current.windows[0].sillHeight).toBe(0);
  });

  it('keeps existing windows, continues their ids and stops at the per-room maximum', () => {
    const initial = [{ id: 'w7', wallId: 'east', alongFraction: 0.5, width: 1, height: 1, sillHeight: 1, styleId: 'classic' as const }];
    const { result } = renderHook(() => useWindowEditor(initial, { panoramaId: 'city' }));
    act(() => {
      result.current.addWindow({ ...wall, length: 60 }, 0.05);
    });
    expect(result.current.windows[1].id).toBe('w8');
    expect(result.current.outdoor.panoramaId).toBe('city');
    for (let i = 0; i < MAX_WINDOWS_PER_ROOM; i++) {
      act(() => {
        result.current.addWindow({ ...wall, length: 60 }, 0.15 + i * 0.1);
      });
    }
    expect(result.current.windows).toHaveLength(MAX_WINDOWS_PER_ROOM);
    expect(result.current.canAddMore).toBe(false);
  });

  it('removes a window and clears the selection', () => {
    const { result } = renderHook(() => useWindowEditor());
    act(() => {
      result.current.addWindow(wall, 0.5);
    });
    act(() => result.current.removeWindow(result.current.windows[0].id));
    expect(result.current.windows).toHaveLength(0);
    expect(result.current.selected).toBeNull();
  });
});
