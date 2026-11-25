// Museum wall labels ("cartel") next to each painting — the pure part: content, typesetting, placement.
// WallLabel.tsx draws the result into a canvas texture on a thin printed board.
//
// Replaces the first-version label (a white card centred under the frame, with two lines of unlit troika
// text that glowed in dark rooms and loaded its font from a CDN). A museum label is:
// - small (17 cm × LABEL_SCALE wide), printed on a few-mm board, left-aligned;
// - beside the work at reading height (the right side, centred ~1.4 m), not under it;
// - artist (bold) / *title* (italic), year / medium / dimensions;
// - printed ink, lit by the room like the wall it hangs on.

import type { Artwork } from "./artworks";
import { ARTWORK_WALL_GAP, FRAME_BORDER } from "./artworkShadow";
import type { LabelRect } from "./clickNavigationGeometry";
import type { WallSegment } from "./galleryLayout";
import type { WindowOpening } from "./windowOpenings";

/**
 * Overall label size: board, padding and type all scale together (the one knob to make labels bigger or
 * smaller). 1 = a 17 cm board with ~7 mm type, a typical printed museum label — read too small on screen; 1.4 still needed walking right up to it, so 1.8 (~31 cm).
 */
export const LABEL_SCALE = 2.0;

/** Board size and finish (m). */
export const LABEL_WIDTH = 0.17 * LABEL_SCALE;
export const LABEL_THICKNESS = 0.003;
/** The board's back, in the painting's local z: flat on the wall face (the painting's origin is ARTWORK_WALL_GAP off it). */
export const LABEL_WALL_Z = -ARTWORK_WALL_GAP + 0.0005;
export const LABEL_PADDING = 0.012 * LABEL_SCALE;
export const LABEL_MIN_HEIGHT = 0.07 * LABEL_SCALE;
/** Gap between the frame's edge and the label (m). */
export const LABEL_GAP = 0.15;
/** Label centre height when the painting allows it — a comfortable reading height (m). */
export const LABEL_CENTER_Y = 1.4;
/** Minimum free wall left beyond the label before a corner/neighbour (m). */
export const LABEL_CLEARANCE = 0.1;
/** Below-the-frame fallback: gap between frame bottom and label top (m). */
export const LABEL_BELOW_GAP = 0.06;

/** Texture density: ~3 px/mm on the board whatever its size (512 px across 17 cm) — sharp at reading distance. */
export const LABEL_TEXTURE_WIDTH = Math.round((512 * LABEL_SCALE) / 32) * 32;
export const LABEL_PX_PER_M = LABEL_TEXTURE_WIDTH / LABEL_WIDTH;

export const LABEL_FONT_FAMILY = '"Helvetica Neue", Helvetica, Arial, sans-serif';
export const LABEL_PAPER = "#f3f1ec";
export const LABEL_INK = "#1f1d1a";
export const LABEL_INK_MUTED = "#6a655e";
/** Thin black frame around the board (m) — a white label on a white wall disappeared (user request 2026-11-25). */
export const LABEL_BORDER = 0.004;
export const LABEL_BORDER_COLOR = "#141414";
/** Type size multiplier on top of LABEL_SCALE — bigger type in the same board (user request 2026-11-25). */
const TYPE_SCALE = 1.25;

export type LabelStyle = "artist" | "title" | "year" | "meta";

/** Cap-height-ish type sizes (m) and the CSS font for each style. */
export const LABEL_TYPE: Record<LabelStyle, { size: number; weight: number; italic: boolean; muted: boolean }> = {
  artist: { size: 0.0074 * LABEL_SCALE * TYPE_SCALE, weight: 600, italic: false, muted: false },
  title: { size: 0.0068 * LABEL_SCALE * TYPE_SCALE, weight: 400, italic: true, muted: false },
  year: { size: 0.0068 * LABEL_SCALE * TYPE_SCALE, weight: 400, italic: false, muted: false },
  meta: { size: 0.0052 * LABEL_SCALE * TYPE_SCALE, weight: 400, italic: false, muted: true },
};
const LINE_HEIGHT = 1.32;
/** Extra space after the artist line and before the meta block (m). */
const BLOCK_GAP = 0.0035 * LABEL_SCALE;

export function labelFont(style: LabelStyle): string {
  const t = LABEL_TYPE[style];
  return `${t.italic ? "italic " : ""}${t.weight} ${Math.round(t.size * LABEL_PX_PER_M)}px ${LABEL_FONT_FAMILY}`;
}

/** Measures a string's width in texture pixels for a CSS font (canvas `measureText` in the browser). */
export type MeasureText = (text: string, font: string) => number;

let measureContext: CanvasRenderingContext2D | null | undefined;

/** Browser canvas measurement for layoutLabel (one shared 2D context); a rough estimate where there's no canvas. */
export const measureLabelText: MeasureText = (text, font) => {
  if (measureContext === undefined) measureContext = document.createElement("canvas").getContext("2d");
  if (!measureContext) return text.length * Number(/(\d+)px/.exec(font)?.[1] ?? 16) * 0.55;
  measureContext.font = font;
  return measureContext.measureText(text).width;
};

export interface LabelRun {
  text: string;
  style: LabelStyle;
  /** Left edge in texture px. */
  x: number;
}
export interface LabelLine {
  runs: LabelRun[];
  /** Baseline in texture px from the top. */
  baseline: number;
}
export interface LabelLayout {
  lines: LabelLine[];
  /** Board height (m) and texture height (px). */
  height: number;
  textureHeight: number;
}

/** Greedy word wrap. A single word wider than the line is kept whole (the board's padding absorbs it). */
export function wrapText(text: string, maxWidth: number, font: string, measure: MeasureText): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (!line || measure(candidate, font) <= maxWidth) line = candidate;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** "73,7 × 92,1 cm" in the visitor's locale (decimal comma in Turkish). */
export function formatDimensions(heightCm: number, widthCm: number, locale: string): string {
  const f = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  return `${f.format(heightCm)} × ${f.format(widthCm)} cm`;
}

/** What a label says — shared by the printed board (layoutLabel) and the label modal (ArtworkLabelModal.tsx). */
export interface LabelContent {
  artist: string;
  title: string;
  year: string;
  /** Medium, then dimensions — whichever the artwork has. */
  meta: string[];
}

export function labelContent(data: Artwork, locale: string): LabelContent {
  const meta: string[] = [];
  if (data.technique?.trim()) meta.push(data.technique.trim());
  if (data.heightCm && data.widthCm) meta.push(formatDimensions(data.heightCm, data.widthCm, locale));
  return { artist: data.artist?.trim() ?? "", title: data.title.trim(), year: data.year?.trim() ?? "", meta };
}

/** Typesets a label: artist / title (italic), year / medium / dimensions. */
export function layoutLabel(data: Artwork, locale: string, measure: MeasureText): LabelLayout {
  const content = labelContent(data, locale);
  const px = (m: number) => m * LABEL_PX_PER_M;
  const left = px(LABEL_PADDING);
  const maxWidth = px(LABEL_WIDTH - 2 * LABEL_PADDING);
  const lines: LabelLine[] = [];
  let y = px(LABEL_PADDING);

  const pushLine = (runs: LabelRun[], style: LabelStyle) => {
    const size = px(LABEL_TYPE[style].size);
    // Baseline sits ~0.8 em below the line top.
    lines.push({ runs, baseline: y + size * 0.95 });
    y += size * LINE_HEIGHT;
  };

  if (content.artist) {
    for (const t of wrapText(content.artist, maxWidth, labelFont("artist"), measure)) pushLine([{ text: t, style: "artist", x: left }], "artist");
    y += px(BLOCK_GAP);
  }

  const titleLines = wrapText(content.title, maxWidth, labelFont("title"), measure);
  const year = content.year;
  titleLines.forEach((t, i) => {
    const runs: LabelRun[] = [{ text: t, style: "title", x: left }];
    if (year && i === titleLines.length - 1) {
      const suffix = `, ${year}`;
      const titleWidth = measure(t, labelFont("title"));
      if (titleWidth + measure(suffix, labelFont("year")) <= maxWidth) {
        runs.push({ text: suffix, style: "year", x: left + titleWidth });
        pushLine(runs, "title");
        return;
      }
      pushLine(runs, "title");
      pushLine([{ text: year, style: "year", x: left }], "year");
      return;
    }
    pushLine(runs, "title");
  });
  if (!titleLines.length && year) pushLine([{ text: year, style: "year", x: left }], "year");

  if (content.meta.length) y += px(BLOCK_GAP);
  for (const m of content.meta) {
    for (const t of wrapText(m, maxWidth, labelFont("meta"), measure)) pushLine([{ text: t, style: "meta", x: left }], "meta");
  }

  y += px(LABEL_PADDING);
  const height = Math.max(y / LABEL_PX_PER_M, LABEL_MIN_HEIGHT);
  return { lines, height, textureHeight: Math.round(height * LABEL_PX_PER_M) };
}

// --- Placement ---------------------------------------------------------------------------------------

export type LabelSide = "right" | "left" | "below";
export interface LabelPlacement {
  side: LabelSide;
  /** Label centre in the painting's local frame (x to the visitor's right, y up; m). */
  x: number;
  y: number;
}

const frameHalfWidth = (a: Artwork) => (a.height * a.aspect) / 2 + (a.frame ? FRAME_BORDER : 0);
const frameHalfHeight = (a: Artwork) => a.height / 2 + (a.frame ? FRAME_BORDER : 0);

/** World direction of a painting's local +X (the visitor's right when facing it) and +Z (its normal). */
function axes(a: Artwork) {
  const s = Math.sin(a.rotationY);
  const c = Math.cos(a.rotationY);
  return { right: [c, -s] as const, normal: [s, c] as const };
}

/** Distance along a 2D ray (xz) to the first wall box it enters, or Infinity. */
function rayToWalls(ox: number, oz: number, dx: number, dz: number, walls: WallSegment[]): number {
  let best = Infinity;
  for (const w of walls) {
    const minX = w.position[0] - w.size[0] / 2;
    const maxX = w.position[0] + w.size[0] / 2;
    const minZ = w.position[2] - w.size[2] / 2;
    const maxZ = w.position[2] + w.size[2] / 2;
    let t0 = 0;
    let t1 = Infinity;
    let hit = true;
    for (const [o, d, lo, hi] of [
      [ox, dx, minX, maxX],
      [oz, dz, minZ, maxZ],
    ] as const) {
      if (Math.abs(d) < 1e-9) {
        if (o < lo || o > hi) hit = false;
        continue;
      }
      const a = (lo - o) / d;
      const b = (hi - o) / d;
      t0 = Math.max(t0, Math.min(a, b));
      t1 = Math.min(t1, Math.max(a, b));
    }
    if (hit && t0 <= t1 && t0 < best) best = t0;
  }
  return best;
}

/** Other works hung on the same wall plane, with their signed offset along this one's right axis. */
function sameWallNeighbours(a: Artwork, all: Artwork[]) {
  const { right, normal } = axes(a);
  return all
    .filter((b) => b !== a && Math.abs(Math.cos(b.rotationY - a.rotationY) - 1) < 1e-6)
    .map((b) => {
      const dx = b.position[0] - a.position[0];
      const dz = b.position[2] - a.position[2];
      return { b, along: dx * right[0] + dz * right[1], depth: dx * normal[0] + dz * normal[1] };
    })
    // Same wall plane and overlapping in height — a work hung above another (a mezzanine) is no neighbour.
    .filter((n) => Math.abs(n.depth) < 0.05 && Math.abs(n.b.position[1] - a.position[1]) < frameHalfHeight(a) + frameHalfHeight(n.b));
}

/** Free wall beside the frame on one side (m), up to a corner/partition or the next work's frame. */
/** Clear wall kept between a label and a window opening (its casing). */
const LABEL_WINDOW_MARGIN = 0.1;

/**
 * Distance from the frame edge to the nearest window on the same wall in direction `sign`, for windows that
 * overlap the painting's height (where the label goes). The colliding walls are uncut, so labels would
 * otherwise happily print themselves across the glass.
 */
function windowClearance(a: Artwork, openings: WindowOpening[], sign: 1 | -1): number {
  const { right, normal } = axes(a);
  const half = frameHalfWidth(a);
  const bottom = a.position[1] - frameHalfHeight(a);
  const top = a.position[1] + frameHalfHeight(a);
  let free = Infinity;
  for (const o of openings) {
    const dx = o.center[0] - a.position[0];
    const dz = o.center[2] - a.position[2];
    if (Math.abs(dx * normal[0] + dz * normal[1]) > 0.5) continue; // another wall
    const axis = o.axis === "x" ? [1, 0] : [0, 1];
    if (Math.abs(axis[0] * right[0] + axis[1] * right[1]) < 0.9) continue; // perpendicular wall
    if (o.sill >= top || o.sill + o.height <= bottom) continue; // above/below the painting
    const along = (dx * right[0] + dz * right[1]) * sign;
    if (along <= 0) continue;
    free = Math.min(free, along - o.width / 2 - half - LABEL_WINDOW_MARGIN);
  }
  return free;
}

function freeSpace(
  a: Artwork,
  all: Artwork[],
  walls: WallSegment[],
  sign: 1 | -1,
  neighbourLabelsRight: Set<Artwork>,
  openings: WindowOpening[] = []
): number {
  const { right, normal } = axes(a);
  const half = frameHalfWidth(a);
  // 3 cm in front of the wall face (the painting's origin is ~7 cm off it), so the ray never grazes its own wall.
  const off = -0.04;
  const ox = a.position[0] + normal[0] * off + right[0] * half * sign;
  const oz = a.position[2] + normal[1] * off + right[1] * half * sign;
  let free = rayToWalls(ox, oz, right[0] * sign, right[1] * sign, walls);
  for (const n of sameWallNeighbours(a, all)) {
    const along = n.along * sign;
    if (along <= 0) continue;
    let edge = along - frameHalfWidth(n.b) - half;
    // A left-hand neighbour whose label sits on its right takes that space too.
    if (sign === -1 && neighbourLabelsRight.has(n.b)) edge -= LABEL_GAP + LABEL_WIDTH;
    free = Math.min(free, edge);
  }
  return Math.min(free, windowClearance(a, openings, sign));
}

/** Label centre height: reading height, kept within the painting's vertical span when it can be. */
export function labelCenterY(a: Artwork, labelHeight: number): number {
  const bottom = a.position[1] - frameHalfHeight(a);
  const top = a.position[1] + frameHalfHeight(a);
  const lo = bottom + labelHeight / 2;
  const hi = top - labelHeight / 2;
  if (lo > hi) return a.position[1];
  return Math.min(Math.max((a.floorY ?? 0) + LABEL_CENTER_Y, lo), hi);
}

/**
 * Places every work's label: to the right of the frame when there's room, else to the left, else centred
 * under the frame. `heights` are the labels' board heights (m), by artwork id.
 */
export function placeLabels(
  all: Artwork[],
  walls: WallSegment[],
  heights: Map<string, number>,
  openings: WindowOpening[] = []
): Map<string, LabelPlacement> {
  const need = LABEL_GAP + LABEL_WIDTH + LABEL_CLEARANCE;
  const offset = (a: Artwork) => frameHalfWidth(a) + LABEL_GAP + LABEL_WIDTH / 2;
  const rightOk = new Set(all.filter((a) => freeSpace(a, all, walls, 1, new Set(), openings) >= need));
  const out = new Map<string, LabelPlacement>();
  for (const a of all) {
    const h = heights.get(a.id) ?? LABEL_MIN_HEIGHT;
    const yLocal = labelCenterY(a, h) - a.position[1];
    if (rightOk.has(a)) out.set(a.id, { side: "right", x: offset(a), y: yLocal });
    else if (freeSpace(a, all, walls, -1, rightOk, openings) >= need) out.set(a.id, { side: "left", x: -offset(a), y: yLocal });
    else out.set(a.id, { side: "below", x: 0, y: -frameHalfHeight(a) - LABEL_BELOW_GAP - h / 2 });
  }
  return out;
}

export interface WallLabel {
  layout: LabelLayout;
  placement: LabelPlacement;
}

/** Typesets and places every work's label (the render and the click pickers share this result). */
export function computeWallLabels(
  artworks: Artwork[],
  walls: WallSegment[],
  locale: string,
  measure: MeasureText,
  openings: WindowOpening[] = []
): Map<string, WallLabel> {
  const layouts = new Map(artworks.map((a) => [a.id, layoutLabel(a, locale, measure)]));
  const placements = placeLabels(artworks, walls, new Map([...layouts].map(([id, l]) => [id, l.height])), openings);
  return new Map(artworks.map((a) => [a.id, { layout: layouts.get(a.id)!, placement: placements.get(a.id)! }]));
}

/** A label's clickable rectangle (its printed face) for pickWallLabel / the hover outline. */
export function labelRect(label: WallLabel): LabelRect {
  return {
    x: label.placement.x,
    y: label.placement.y,
    halfW: LABEL_WIDTH / 2,
    halfH: label.layout.height / 2,
    planeZ: LABEL_WALL_Z + LABEL_THICKNESS,
  };
}
