import { useState } from 'react';
import type { MezzanineData, WindowPlacementData } from '../../lib/api/domains/exhibitionTemplates';
import {
  DEFAULT_MEZZANINE,
  MEZZANINE_MIN_DEPTH,
  mezzanineProblem,
  windowCrossesSlab,
  type MezzanineProblem,
  type MezzanineWallId,
} from '../3d/mezzanineTemplate';

/** Why a mezzanine change was refused: the geometry rules (mezzanineTemplate.ts), or a window in the slab's way. */
export type MezzanineRefusal = MezzanineProblem | 'windowInWay';

/** The room the mezzanine goes into, as the editor needs it. */
export interface MezzanineRoom {
  size: [number, number];
  wallHeight: number;
  windows: WindowPlacementData[];
}

/** Null when `data` can be built in `room`, else why not. */
export function mezzanineRefusal(data: MezzanineData, room: MezzanineRoom): MezzanineRefusal | null {
  const problem = mezzanineProblem(data, room.size, room.wallHeight);
  if (problem) return problem;
  if (room.windows.some((w) => windowCrossesSlab(w, data, room.size))) return 'windowInWay';
  return null;
}

/**
 * State behind MezzanineEditor.tsx (rectangle templates only): at most one mezzanine, along one whole wall.
 * Every change is checked with the same rules the renderer uses (mezzanineTemplate.ts) and refused — leaving
 * the previous state — when it wouldn't fit; the refusal reason is returned for the editor's notice.
 */
export function useMezzanineEditor(initial?: MezzanineData) {
  const [mezzanine, setMezzanine] = useState<MezzanineData | null>(initial ?? null);

  /** Puts the mezzanine along `wallId` (keeping the current depth/height/stair end, else the defaults, made shallower if needed). */
  function place(wallId: MezzanineWallId, room: MezzanineRoom): MezzanineRefusal | null {
    const base = { ...DEFAULT_MEZZANINE, ...(mezzanine ?? {}), wallId };
    let refusal = mezzanineRefusal(base, room);
    let candidate = base;
    // A room that's a little short for the default depth: try shallower slabs before giving up.
    for (let depth = base.depth - 0.5; refusal && (refusal === 'tooDeep' || refusal === 'stairNoRoom') && depth >= MEZZANINE_MIN_DEPTH; depth -= 0.5) {
      candidate = { ...base, depth };
      refusal = mezzanineRefusal(candidate, room);
    }
    if (refusal) return refusal;
    setMezzanine(candidate);
    return null;
  }

  function update(patch: Partial<Omit<MezzanineData, 'wallId'>>, room: MezzanineRoom): MezzanineRefusal | null {
    if (!mezzanine) return null;
    const next = { ...mezzanine, ...patch };
    const refusal = mezzanineRefusal(next, room);
    if (refusal) return refusal;
    setMezzanine(next);
    return null;
  }

  return {
    mezzanine,
    place,
    update,
    remove: () => setMezzanine(null),
    /** Sent only when there is one, so a single-level template stores exactly what it did before. */
    payload: mezzanine ? { mezzanine } : {},
  };
}

export type MezzanineEditorState = ReturnType<typeof useMezzanineEditor>;
