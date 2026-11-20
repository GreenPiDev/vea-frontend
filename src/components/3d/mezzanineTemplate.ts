// A rectangle template's mezzanine as the panel stores it (MezzanineData: which wall, how deep, how high,
// which end the stair lands at) → the engine's MezzanineSpec (mezzanine.ts), plus the rules the template editor
// and the renderer share: does it fit, which walls get artworks on the mezzanine level (`<wall>@mezz` runs —
// positionData.wallRunId is a free string, so no backend change), and where ground-floor artworks must not go
// (under the slab on the side walls, behind the stair). Pure, tested in mezzanineTemplate.test.ts.

import { WALL_THICKNESS, type WallRunGeometry, type WallSpan } from "./galleryLayout";
import { SLAB_THICKNESS, STAIR_GOING, STAIR_TARGET_RISER, type MezzanineSpec } from "./mezzanine";
import type { MezzanineData, WindowPlacementData } from "../../lib/api/domains/exhibitionTemplates";

export type MezzanineWallId = MezzanineData["wallId"];

/** Fixed stair width (m). */
export const MEZZANINE_STAIR_WIDTH = 1.3;
/** Editor limits (vea-api's MezzanineDto validates a wider envelope). */
export const MEZZANINE_MIN_DEPTH = 2;
export const MEZZANINE_MAX_DEPTH = 8;
export const MEZZANINE_MIN_TOP = 3;
/** Free headroom kept above the slab. */
export const MEZZANINE_MIN_HEADROOM = 2.6;
/** Open hall kept in front of the slab (m, across the room). */
export const MEZZANINE_MIN_HALL = 4;
/** Clear floor kept in front of the stair's foot. */
export const MEZZANINE_STAIR_LANDING = 1.2;
/** Suffix of a mezzanine-level wall run id. */
export const MEZZ_RUN_SUFFIX = "@mezz";

export const DEFAULT_MEZZANINE: Omit<MezzanineData, "wallId"> = { depth: 4, top: 3.6, stairEnd: "end" };

/** Horizontal length of the stair for a slab `top` m up (same step rule as resolveStair). */
export function stairRun(top: number): number {
  return (Math.max(2, Math.round(top / STAIR_TARGET_RISER)) - 1) * STAIR_GOING;
}

const h = WALL_THICKNESS / 2;

/** Inner faces of a W × D rectangle room (walls on the centre lines ±W/2, ±D/2). */
function inner([W, D]: [number, number]) {
  return { minX: -W / 2 + h, maxX: W / 2 - h, minZ: -D / 2 + h, maxZ: D / 2 - h };
}

/** Free room across the slab's wall (inner faces), i.e. the room's other dimension. */
function acrossLength(wallId: MezzanineWallId, [W, D]: [number, number]): number {
  return (wallId === "north" || wallId === "south" ? D : W) - WALL_THICKNESS;
}

export function mezzanineSpecFor(data: MezzanineData, size: [number, number]): MezzanineSpec {
  const r = inner(size);
  const d = data.depth;
  const w = MEZZANINE_STAIR_WIDTH;
  switch (data.wallId) {
    case "north": {
      const edge = r.minZ + d;
      const across: [number, number] = data.stairEnd === "start" ? [r.minX, r.minX + w] : [r.maxX - w, r.maxX];
      return { rect: { ...r, maxZ: edge }, top: data.top, stair: { axis: "z", dir: -1, across, topAt: edge } };
    }
    case "south": {
      const edge = r.maxZ - d;
      const across: [number, number] = data.stairEnd === "start" ? [r.minX, r.minX + w] : [r.maxX - w, r.maxX];
      return { rect: { ...r, minZ: edge }, top: data.top, stair: { axis: "z", dir: 1, across, topAt: edge } };
    }
    case "west": {
      const edge = r.minX + d;
      const across: [number, number] = data.stairEnd === "start" ? [r.minZ, r.minZ + w] : [r.maxZ - w, r.maxZ];
      return { rect: { ...r, maxX: edge }, top: data.top, stair: { axis: "x", dir: -1, across, topAt: edge } };
    }
    case "east": {
      const edge = r.maxX - d;
      const across: [number, number] = data.stairEnd === "start" ? [r.minZ, r.minZ + w] : [r.maxZ - w, r.maxZ];
      return { rect: { ...r, minX: edge }, top: data.top, stair: { axis: "x", dir: 1, across, topAt: edge } };
    }
  }
}

export type MezzanineProblem = "tooShallow" | "tooDeep" | "tooLow" | "tooHigh" | "stairNoRoom";

/** Why a mezzanine can't be built in this room (null = it fits). Shared by the editor and the renderer. */
export function mezzanineProblem(data: MezzanineData, size: [number, number], wallHeight: number): MezzanineProblem | null {
  if (data.depth < MEZZANINE_MIN_DEPTH - 1e-9) return "tooShallow";
  if (data.top < MEZZANINE_MIN_TOP - 1e-9) return "tooLow";
  if (wallHeight - data.top < MEZZANINE_MIN_HEADROOM - 1e-9) return "tooHigh";
  const hall = acrossLength(data.wallId, size) - data.depth;
  if (hall < MEZZANINE_MIN_HALL - 1e-9 || data.depth > MEZZANINE_MAX_DEPTH + 1e-9) return "tooDeep";
  if (stairRun(data.top) + MEZZANINE_STAIR_LANDING > hall + 1e-9) return "stairNoRoom";
  return null;
}

/** The spec to build, or undefined when there's none or it doesn't fit (stale stored data never breaks the scene). */
export function buildableMezzanine(data: MezzanineData | undefined, size: [number, number], wallHeight: number): MezzanineSpec | undefined {
  if (!data || mezzanineProblem(data, size, wallHeight)) return undefined;
  return mezzanineSpecFor(data, size);
}

/** The two walls beside the slab's wall, with the coordinate range (along them) the slab covers. */
function sideWalls(data: MezzanineData, [W, D]: [number, number]): { id: MezzanineWallId; span: WallSpan }[] {
  const d = data.depth;
  switch (data.wallId) {
    case "north":
      return ["west", "east"].map((id) => ({ id: id as MezzanineWallId, span: [-D / 2, -D / 2 + h + d] }));
    case "south":
      return ["west", "east"].map((id) => ({ id: id as MezzanineWallId, span: [D / 2 - h - d, D / 2] }));
    case "west":
      return ["north", "south"].map((id) => ({ id: id as MezzanineWallId, span: [-W / 2, -W / 2 + h + d] }));
    case "east":
      return ["north", "south"].map((id) => ({ id: id as MezzanineWallId, span: [W / 2 - h - d, W / 2] }));
  }
}

/** The side wall the stair runs along (its "start" end is the wall at the run's low coordinate). */
function stairWall(data: MezzanineData): MezzanineWallId {
  const lowFirst = data.stairEnd === "start";
  if (data.wallId === "north" || data.wallId === "south") return lowFirst ? "west" : "east";
  return lowFirst ? "north" : "south";
}

/** Same geometry and ids as backendAdapter's templateWallRuns. */
function roomRun(id: MezzanineWallId, [W, D]: [number, number]): WallRunGeometry {
  switch (id) {
    case "north":
      return { orientation: "horizontal", start: -W / 2, end: W / 2, fixed: -D / 2, outward: -1 };
    case "south":
      return { orientation: "horizontal", start: -W / 2, end: W / 2, fixed: D / 2, outward: 1 };
    case "east":
      return { orientation: "vertical", start: -D / 2, end: D / 2, fixed: W / 2, outward: 1 };
    case "west":
      return { orientation: "vertical", start: -D / 2, end: D / 2, fixed: -W / 2, outward: -1 };
  }
}

/** A wall run on the mezzanine level: the slab's own wall in full, and the stretch of each side wall above the slab. */
export interface MezzanineRun extends WallRunGeometry {
  id: string;
}

export function mezzanineWallRuns(data: MezzanineData, size: [number, number]): MezzanineRun[] {
  const runs: MezzanineRun[] = [{ id: `${data.wallId}${MEZZ_RUN_SUFFIX}`, ...roomRun(data.wallId, size) }];
  for (const { id, span } of sideWalls(data, size)) {
    runs.push({ id: `${id}${MEZZ_RUN_SUFFIX}`, ...roomRun(id, size), start: span[0], end: span[1] });
  }
  return runs;
}

export const isMezzanineRunId = (id: string) => id.endsWith(MEZZ_RUN_SUFFIX);

/** How artworks are hung on one room-floor wall of a room with a mezzanine. */
export interface GroundWallRule {
  /** Lower ceiling (m): the slab's underside, on the wall the slab rests on. */
  ceiling?: number;
  /** Stretches no work may cover: under the slab on the side walls, and behind the stair. */
  blocked: WallSpan[];
}

export function mezzanineGroundRules(data: MezzanineData, size: [number, number]): Map<string, GroundWallRule> {
  const rules = new Map<string, GroundWallRule>();
  rules.set(data.wallId, { ceiling: data.top - SLAB_THICKNESS, blocked: [] });
  const spec = mezzanineSpecFor(data, size);
  const stairSpan: WallSpan = [Math.min(spec.stair.topAt, spec.stair.topAt - spec.stair.dir * stairRun(data.top)), Math.max(spec.stair.topAt, spec.stair.topAt - spec.stair.dir * stairRun(data.top))];
  const onStairWall = stairWall(data);
  for (const { id, span } of sideWalls(data, size)) {
    rules.set(id, { blocked: id === onStairWall ? [span, stairSpan] : [span] });
  }
  return rules;
}

/**
 * True when a window would cut through the slab: on the slab's wall, or on a side wall where the slab meets
 * it, with its glass reaching across the slab's band (underside → top).
 */
export function windowCrossesSlab(w: WindowPlacementData, data: MezzanineData, size: [number, number]): boolean {
  const underside = data.top - SLAB_THICKNESS;
  if (w.sillHeight >= data.top || w.sillHeight + w.height <= underside) return false;
  if (w.wallId === data.wallId) return true;
  const side = sideWalls(data, size).find((s) => s.id === w.wallId);
  if (!side) return false;
  const run = roomRun(side.id, size);
  const c = run.start + w.alongFraction * (run.end - run.start);
  return c + w.width / 2 > side.span[0] && c - w.width / 2 < side.span[1];
}
