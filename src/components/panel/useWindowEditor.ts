import { useRef, useState } from 'react';
import type { OutdoorView, WindowPlacementData, WindowStyleId } from '../../lib/api/domains/exhibitionTemplates';
import { DEFAULT_OUTDOOR_PANORAMA } from '../3d/outdoorPanoramas';
import { MAX_WINDOWS_PER_ROOM, clampWindowPlacement, defaultWindow, windowCollides } from '../3d/windowOpenings';

/** A wall as the editor needs it: its id, length and the room's wall height. */
export interface EditorWall {
  id: string;
  length: number;
  height: number;
  /** Custom rooms: false when a balcony placed like this would reach into another part of the footprint. */
  balconyFits?: (placement: WindowPlacementData) => boolean;
  /** Rooms with a mezzanine: false when the window would cut through its slab. */
  clearOfSlab?: (placement: WindowPlacementData) => boolean;
}

function fits(p: WindowPlacementData, wall: EditorWall): boolean {
  if (wall.clearOfSlab && !wall.clearOfSlab(p)) return false;
  return p.styleId !== 'balcony' || !wall.balconyFits || wall.balconyFits(p);
}

/**
 * State behind WindowEditor.tsx — shared by ExhibitionTemplateForm.tsx (both room shapes) and ExhibitionForm.tsx's
 * own drawn room, like useCeilingLightEditor/useFurnitureEditor. Every change goes through the same rules the
 * 3D side resolves windows with (windowOpenings.ts: clamped into the wall, no overlapping windows), and a change
 * that would make two windows overlap is refused. Omitted/empty on submit = a closed room, as before.
 */
export function useWindowEditor(initialWindows?: WindowPlacementData[], initialOutdoor?: OutdoorView) {
  const [windows, setWindows] = useState<WindowPlacementData[]>(initialWindows ?? []);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newStyle, setNewStyle] = useState<WindowStyleId>('classic');
  const [outdoor, setOutdoor] = useState<OutdoorView>(
    initialOutdoor ?? { panoramaId: DEFAULT_OUTDOOR_PANORAMA.id, rotationY: 0 }
  );
  const nextId = useRef(
    (initialWindows ?? []).reduce((max, w) => Math.max(max, Number(w.id.replace(/\D/g, '')) || 0), 0) + 1
  );

  /** Adds a window of the current style at `alongFraction` on `wall`. False when it doesn't fit there. */
  function addWindow(wall: EditorWall, alongFraction: number): boolean {
    if (windows.length >= MAX_WINDOWS_PER_ROOM) return false;
    const placement = clampWindowPlacement(
      { ...defaultWindow(newStyle, wall.height), id: `w${nextId.current}`, wallId: wall.id, alongFraction },
      wall.length,
      wall.height
    ) as WindowPlacementData;
    if (windowCollides(placement, windows, wall.length) || !fits(placement, wall)) return false;
    nextId.current++;
    setWindows((prev) => [...prev, placement]);
    setSelectedId(placement.id);
    return true;
  }

  /** Applies a change to one window (clamped into its wall). False — and no change — if it would overlap another. */
  function updateWindow(id: string, patch: Partial<Omit<WindowPlacementData, 'id' | 'wallId'>>, wall: EditorWall): boolean {
    const current = windows.find((w) => w.id === id);
    if (!current) return false;
    let next = { ...current, ...patch };
    // A new style brings its own sensible proportions (a floor-to-ceiling glazing isn't a sash window resized);
    // switching to or from a balcony door takes the new style's width too (a door isn't a window resized).
    if (patch.styleId && patch.styleId !== current.styleId) {
      const keepWidth = patch.styleId !== 'balcony' && current.styleId !== 'balcony';
      next = { ...next, ...defaultWindow(patch.styleId, wall.height), ...(keepWidth ? { width: current.width } : {}) };
    }
    const clamped = clampWindowPlacement(next, wall.length, wall.height) as WindowPlacementData;
    if (windowCollides(clamped, windows, wall.length) || !fits(clamped, wall)) return false;
    setWindows((prev) => prev.map((w) => (w.id === id ? clamped : w)));
    return true;
  }

  function removeWindow(id: string) {
    setWindows((prev) => prev.filter((w) => w.id !== id));
    setSelectedId((sel) => (sel === id ? null : sel));
  }

  return {
    windows,
    selected: windows.find((w) => w.id === selectedId) ?? null,
    select: setSelectedId,
    newStyle,
    setNewStyle,
    outdoor,
    setOutdoor,
    canAddMore: windows.length < MAX_WINDOWS_PER_ROOM,
    addWindow,
    updateWindow,
    removeWindow,
    /** What to send: nothing at all for a closed room, so rooms without windows store exactly what they did before. */
    payload: windows.length ? { windows, outdoor } : {},
  };
}

export type WindowEditorState = ReturnType<typeof useWindowEditor>;
