// Window openings in a room's walls — pure geometry, no rendering (see WindowFixtures.tsx for the frames/glass
// and OutdoorPanorama.tsx for the view outside).
//
// A window is stored the same way a dragged artwork is: the wall it sits in plus a 0..1 fraction along that
// wall (`alongFraction`), so resizing the room doesn't throw it off the wall. resolveWindowOpenings() turns those
// placements into world-space openings, clamped so every opening keeps a solid strip of wall at both ends and
// under the ceiling, and drops one that would overlap a window already on the same wall.
//
// Rendering cuts each wall that has openings into solid pieces around them (splitWallAroundOpenings). The
// player's colliders stay the full, uncut walls on purpose — the glass is there, nobody walks out of a window.

import type { WallSegment } from "./galleryLayout";

/** "balcony" = a floor-level door opening onto a balcony platform outside the wall (balcony.ts). */
export type WindowStyleId = "modern" | "classic" | "panorama" | "balcony";

export const WINDOW_STYLE_IDS: WindowStyleId[] = ["modern", "classic", "panorama", "balcony"];

/** Balcony platform limits (m): along the wall, and out from the wall's outer face. */
export const BALCONY_MIN_WIDTH = 1.2;
export const BALCONY_MIN_DEPTH = 1;
export const BALCONY_MAX_DEPTH = 4;
/** Platform overhang kept on each side of the door. */
export const BALCONY_DOOR_SIDE = 0.2;
export const DEFAULT_BALCONY_WIDTH = 3.2;
export const DEFAULT_BALCONY_DEPTH = 1.8;

/** A curator-placed window, as stored (room-local, relative to its wall). */
export interface WindowPlacement {
  id: string;
  /** WallSegment.id of the wall it's cut into ("north"…"west" in a rectangle room, CustomWallRun ids otherwise). */
  wallId: string;
  /** Opening centre along the wall, 0..1 of its length (from its min-x / min-z end). */
  alongFraction: number;
  /** Opening size in metres. */
  width: number;
  height: number;
  /** Bottom of the opening above the floor; 0 = floor-to-ceiling glazing. */
  sillHeight: number;
  styleId: WindowStyleId;
  /** Balcony door only: platform size along the wall and out from it (m). The door's sill is always 0. */
  balconyWidth?: number;
  balconyDepth?: number;
}

/** A balcony platform, resolved: centred on its door, kept within the wall's length. */
export interface ResolvedBalcony {
  /** Platform centre along the wall's axis (world coordinate). */
  along: number;
  width: number;
  /** Out from the wall's outer face. */
  depth: number;
}

/** A resolved, world-space window opening. */
export interface WindowOpening {
  id: string;
  wallId: string;
  styleId: WindowStyleId;
  /** World axis the wall runs along. */
  axis: "x" | "z";
  /** Centre of the opening on the wall's centre plane. */
  center: [number, number, number];
  width: number;
  height: number;
  /** Bottom edge height (y). */
  sill: number;
  /** Unit (x, z) vector from the wall into the room. */
  inward: [number, number];
  /** Wall thickness (depth of the reveal). */
  depth: number;
  /** Set for a balcony door: the platform outside it. The door is walkable (walls are cut there, balcony.ts). */
  balcony?: ResolvedBalcony;
}

/** Platform span along the wall for a door centred at `doorAlong` (wall from `start` to `end`), clamped into the wall. */
export function balconySpan(doorAlong: number, doorWidth: number, requestedWidth: number | undefined, start: number, end: number): [number, number] {
  const length = end - start;
  const width = Math.min(Math.max(requestedWidth ?? DEFAULT_BALCONY_WIDTH, doorWidth + 2 * BALCONY_DOOR_SIDE, BALCONY_MIN_WIDTH), length);
  const lo = Math.min(Math.max(doorAlong - width / 2, start), end - width);
  return [lo, lo + width];
}

export function clampBalconyDepth(depth: number | undefined): number {
  return Math.min(Math.max(depth ?? DEFAULT_BALCONY_DEPTH, BALCONY_MIN_DEPTH), BALCONY_MAX_DEPTH);
}

/** Solid wall left between an opening and the end of its wall. */
export const WINDOW_EDGE_MARGIN = 0.3;
/** Solid wall left above an opening, under the ceiling. */
export const WINDOW_HEAD_MARGIN = 0.15;
/** Minimum solid pier between two openings on the same wall. */
export const WINDOW_MIN_PIER = 0.2;
export const WINDOW_MIN_SIZE = 0.3;

interface WallInfo {
  axis: "x" | "z";
  start: number;
  end: number;
  bottom: number;
  top: number;
}

function wallInfo(wall: WallSegment & { orientation?: "horizontal" | "vertical" }): WallInfo {
  const axis = wall.orientation ? (wall.orientation === "horizontal" ? "x" : "z") : wall.size[0] >= wall.size[2] ? "x" : "z";
  const i = axis === "x" ? 0 : 2;
  return {
    axis,
    start: wall.position[i] - wall.size[i] / 2,
    end: wall.position[i] + wall.size[i] / 2,
    bottom: wall.position[1] - wall.size[1] / 2,
    top: wall.position[1] + wall.size[1] / 2,
  };
}

function inwardOf(
  wall: WallSegment & { outward?: -1 | 1 },
  axis: "x" | "z",
  roomCenter: [number, number]
): [number, number] {
  if (axis === "x") {
    const s = wall.outward !== undefined ? -wall.outward : Math.sign(roomCenter[1] - wall.position[2]) || 1;
    return [0, s];
  }
  const s = wall.outward !== undefined ? -wall.outward : Math.sign(roomCenter[0] - wall.position[0]) || 1;
  return [s, 0];
}

/**
 * Resolves stored placements against the room's walls. Unknown walls, walls too short for a window and
 * openings overlapping an earlier window on the same wall are skipped; sizes are clamped to fit.
 */
export function resolveWindowOpenings(
  walls: (WallSegment & { orientation?: "horizontal" | "vertical"; outward?: -1 | 1 })[],
  placements: WindowPlacement[] | undefined,
  roomCenter: [number, number]
): WindowOpening[] {
  if (!placements?.length) return [];
  const result: WindowOpening[] = [];
  for (const p of placements) {
    const wall = walls.find((w) => w.id === p.wallId);
    if (!wall) continue;
    const info = wallInfo(wall);
    const length = info.end - info.start;
    const maxWidth = length - 2 * WINDOW_EDGE_MARGIN;
    if (maxWidth < WINDOW_MIN_SIZE) continue;
    const width = Math.min(Math.max(p.width, WINDOW_MIN_SIZE), maxWidth);

    const isBalcony = p.styleId === "balcony";
    const wallHeight = info.top - info.bottom;
    const sill = isBalcony ? 0 : Math.min(Math.max(p.sillHeight, 0), wallHeight - WINDOW_HEAD_MARGIN - WINDOW_MIN_SIZE);
    if (sill < 0) continue;
    const height = Math.min(Math.max(p.height, WINDOW_MIN_SIZE), wallHeight - WINDOW_HEAD_MARGIN - sill);

    const lo = info.start + WINDOW_EDGE_MARGIN + width / 2;
    const hi = info.end - WINDOW_EDGE_MARGIN - width / 2;
    const fraction = Number.isFinite(p.alongFraction) ? p.alongFraction : 0.5;
    const along = Math.min(Math.max(info.start + fraction * length, lo), hi);

    const overlaps = result.some((o) => {
      if (o.wallId !== wall.id) return false;
      const oAlong = info.axis === "x" ? o.center[0] : o.center[2];
      return Math.abs(oAlong - along) < (o.width + width) / 2 + WINDOW_MIN_PIER;
    });
    if (overlaps) continue;

    let balcony: ResolvedBalcony | undefined;
    if (isBalcony) {
      const [b0, b1] = balconySpan(along, width, p.balconyWidth, info.start, info.end);
      // Two platforms on one wall may not overlap (the door gap rule alone allows it).
      const clash = result.some((o) => o.wallId === wall.id && o.balcony && b0 < o.balcony.along + o.balcony.width / 2 && b1 > o.balcony.along - o.balcony.width / 2);
      if (clash) continue;
      balcony = { along: (b0 + b1) / 2, width: b1 - b0, depth: clampBalconyDepth(p.balconyDepth) };
    }

    const y = info.bottom + sill + height / 2;
    const center: [number, number, number] =
      info.axis === "x" ? [along, y, wall.position[2]] : [wall.position[0], y, along];
    result.push({
      id: p.id,
      wallId: wall.id,
      styleId: p.styleId,
      axis: info.axis,
      center,
      width,
      height,
      sill: info.bottom + sill,
      inward: inwardOf(wall, info.axis, roomCenter),
      depth: info.axis === "x" ? wall.size[2] : wall.size[0],
      ...(balcony ? { balcony } : {}),
    });
  }
  return result;
}

const EPS = 1e-4;

/**
 * Cuts a wall into solid box pieces around its openings: full-height piers between them, plus a piece under
 * each sill and one above each head. Returns the wall itself when it has no openings.
 */
export function splitWallAroundOpenings(wall: WallSegment, openings: WindowOpening[]): WallSegment[] {
  const mine = openings.filter((o) => o.wallId === wall.id);
  if (!mine.length) return [wall];
  const info = wallInfo(wall);
  const along = (o: WindowOpening) => (info.axis === "x" ? o.center[0] : o.center[2]);
  mine.sort((a, b) => along(a) - along(b));

  const pieces: WallSegment[] = [];
  const add = (a0: number, a1: number, y0: number, y1: number) => {
    if (a1 - a0 < EPS || y1 - y0 < EPS) return;
    const c = (a0 + a1) / 2;
    const position: [number, number, number] =
      info.axis === "x" ? [c, (y0 + y1) / 2, wall.position[2]] : [wall.position[0], (y0 + y1) / 2, c];
    const size: [number, number, number] =
      info.axis === "x" ? [a1 - a0, y1 - y0, wall.size[2]] : [wall.size[0], y1 - y0, a1 - a0];
    pieces.push({ id: `${wall.id}:${pieces.length}`, position, size });
  };

  let cursor = info.start;
  for (const o of mine) {
    const a0 = along(o) - o.width / 2;
    const a1 = along(o) + o.width / 2;
    add(cursor, a0, info.bottom, info.top);
    add(a0, a1, info.bottom, o.sill);
    add(a0, a1, o.sill + o.height, info.top);
    cursor = a1;
  }
  add(cursor, info.end, info.bottom, info.top);
  return pieces;
}

/** Every wall, cut around the room's openings — what GalleryRoom renders. */
export function splitWallsAroundOpenings(walls: WallSegment[], openings: WindowOpening[]): WallSegment[] {
  if (!openings.length) return walls;
  return walls.flatMap((w) => splitWallAroundOpenings(w, openings));
}

/** Span [from, to] (world coordinate along the wall's axis) each opening blocks on its wall. */
export function openingSpansOnWall(wallId: string, openings: WindowOpening[]): [number, number][] {
  return openings
    .filter((o) => o.wallId === wallId)
    .map((o) => {
      const a = o.axis === "x" ? o.center[0] : o.center[2];
      return [a - o.width / 2, a + o.width / 2] as [number, number];
    })
    .sort((a, b) => a[0] - b[0]);
}

// --- Editor rules (WindowEditor.tsx) ----------------------------------------------------------------------
// The panel keeps stored placements inside the same limits resolveWindowOpenings() clamps to at render time,
// so what the curator sees in the editor is what gets built.

/** Mirrors vea-api's MAX_WINDOWS_PER_ROOM (scene-config.dto.ts) — keep in sync by hand. */
export const MAX_WINDOWS_PER_ROOM = 8;

/** A sensible first window of each style for a wall of `wallHeight`. */
export function defaultWindow(styleId: WindowStyleId, wallHeight: number): Omit<WindowPlacement, "id" | "wallId" | "alongFraction"> {
  const maxTop = wallHeight - WINDOW_HEAD_MARGIN;
  if (styleId === "balcony")
    return { styleId, width: 1.4, sillHeight: 0, height: Math.min(2.6, maxTop), balconyWidth: DEFAULT_BALCONY_WIDTH, balconyDepth: DEFAULT_BALCONY_DEPTH };
  if (styleId === "panorama") return { styleId, width: 3, sillHeight: 0, height: maxTop };
  if (styleId === "modern") return { styleId, width: 1.4, sillHeight: 0.6, height: Math.min(2.8, maxTop - 0.6) };
  return { styleId, width: 1.6, sillHeight: 0.85, height: Math.min(2.4, maxTop - 0.85) };
}

/** Clamps a placement into its wall (length × height): margins at both ends and under the ceiling. */
export function clampWindowPlacement(p: WindowPlacement, wallLength: number, wallHeight: number): WindowPlacement {
  const isBalcony = p.styleId === "balcony";
  const width = Math.min(Math.max(p.width, WINDOW_MIN_SIZE), Math.max(wallLength - 2 * WINDOW_EDGE_MARGIN, WINDOW_MIN_SIZE));
  const sillHeight = isBalcony ? 0 : Math.min(Math.max(p.sillHeight, 0), Math.max(wallHeight - WINDOW_HEAD_MARGIN - WINDOW_MIN_SIZE, 0));
  const height = Math.min(Math.max(p.height, WINDOW_MIN_SIZE), Math.max(wallHeight - WINDOW_HEAD_MARGIN - sillHeight, WINDOW_MIN_SIZE));
  const lo = (WINDOW_EDGE_MARGIN + width / 2) / wallLength;
  const hi = 1 - lo;
  const alongFraction = lo > hi ? 0.5 : Math.min(Math.max(p.alongFraction, lo), hi);
  if (!isBalcony) {
    const { balconyWidth: _w, balconyDepth: _d, ...rest } = p;
    return { ...rest, width, height, sillHeight, alongFraction };
  }
  const [b0, b1] = balconySpan(alongFraction * wallLength, width, p.balconyWidth, 0, wallLength);
  return { ...p, width, height, sillHeight, alongFraction, balconyWidth: b1 - b0, balconyDepth: clampBalconyDepth(p.balconyDepth) };
}

/** Platform span [from, to] (metres from the wall's start) of a stored balcony placement. */
function placementBalconySpan(p: WindowPlacement, wallLength: number): [number, number] {
  return balconySpan(p.alongFraction * wallLength, p.width, p.balconyWidth, 0, wallLength);
}

/**
 * True when `p` would overlap (or come closer than WINDOW_MIN_PIER to) another window on the same wall, or when
 * two balcony platforms on that wall would overlap.
 */
export function windowCollides(p: WindowPlacement, others: WindowPlacement[], wallLength: number): boolean {
  return others.some((o) => {
    if (o.id === p.id || o.wallId !== p.wallId) return false;
    if (Math.abs(o.alongFraction - p.alongFraction) * wallLength < (o.width + p.width) / 2 + WINDOW_MIN_PIER) return true;
    if (o.styleId !== "balcony" || p.styleId !== "balcony") return false;
    const [a0, a1] = placementBalconySpan(o, wallLength);
    const [b0, b1] = placementBalconySpan(p, wallLength);
    return b0 < a1 && b1 > a0;
  });
}
