import { describe, expect, it } from "vitest";
import type { Artwork } from "./artworks";
import { ARTWORKS } from "./__fixtures__/catalogArtworks";
import { FRAME_BORDER } from "./artworkShadow";
import { WALL_CLEARANCE, buildRoomLayout } from "./galleryLayout";
import { pickWallLabel, pickWallTarget, wallBoxes } from "./clickNavigationGeometry";
import { SHOWCASE_ARTWORKS, SHOWCASE_EXHIBITION } from "./__fixtures__/showcaseRoom";
import {
  LABEL_CENTER_Y,
  LABEL_GAP,
  LABEL_MIN_HEIGHT,
  LABEL_PADDING,
  LABEL_PX_PER_M,
  LABEL_WIDTH,
  formatDimensions,
  labelCenterY,
  labelFont,
  labelContent,
  labelRect,
  computeWallLabels,
  LABEL_THICKNESS,
  LABEL_WALL_Z,
  layoutLabel,
  placeLabels,
  wrapText,
  type MeasureText,
} from "./wallLabelLayout";

/** Monospace stand-in for canvas measureText: 0.55 em per character. */
const measure: MeasureText = (text, font) => text.length * Number(/(\d+)px/.exec(font)![1]) * 0.55;

const base: Artwork = {
  id: "a",
  title: "Yıldızlı Gece",
  artist: "Vincent van Gogh",
  year: "1889",
  exhibitionId: "x",
  image: "/x.jpg",
  aspect: 1.25,
  height: 0.737,
  frame: "walnut",
  position: [0, 1.5, -5 + WALL_CLEARANCE],
  rotationY: 0,
};

const texts = (a: Artwork) => layoutLabel(a, "tr", measure).lines.map((l) => l.runs.map((r) => r.text).join(""));

describe("label content", () => {
  it("reads artist / title, year / medium / dimensions, in that order", () => {
    const a = { ...base, technique: "Tuval üzerine yağlı boya", heightCm: 73.7, widthCm: 92.1 };
    expect(texts(a)).toEqual(["Vincent van Gogh", "Yıldızlı Gece, 1889", "Tuval üzerine yağlı boya", "73,7 × 92,1 cm"]);
    const runs = layoutLabel(a, "tr", measure).lines.map((l) => l.runs.map((r) => r.style));
    expect(runs).toEqual([["artist"], ["title", "year"], ["meta"], ["meta"]]);
  });

  it("leaves out what the artwork doesn't have (no empty lines, no ', ' without a year)", () => {
    expect(texts({ ...base, year: "" })).toEqual(["Vincent van Gogh", "Yıldızlı Gece"]);
  });

  it("formats dimensions in the visitor's locale", () => {
    expect(formatDimensions(73.7, 92.1, "tr")).toBe("73,7 × 92,1 cm");
    expect(formatDimensions(73.7, 92.1, "en")).toBe("73.7 × 92.1 cm");
    expect(formatDimensions(180, 180, "tr")).toBe("180 × 180 cm");
  });

  it("wraps long titles inside the board and keeps the year with the last line when it fits", () => {
    const a = { ...base, title: "Kanagawa Açıklarında Büyük Dalga ve Uzaktaki Fuji Dağı" };
    const layout = layoutLabel(a, "tr", measure);
    const maxWidth = (LABEL_WIDTH - 2 * LABEL_PADDING) * LABEL_PX_PER_M;
    for (const line of layout.lines) {
      const right = Math.max(...line.runs.map((r) => r.x + measure(r.text, labelFont(r.style))));
      expect(right - LABEL_PADDING * LABEL_PX_PER_M).toBeLessThanOrEqual(maxWidth + 1e-6);
    }
    expect(layout.lines.length).toBeGreaterThan(2);
  });

  it("wrapText is greedy and never drops words", () => {
    const lines = wrapText("bir iki üç dört beş", 60, "10px x", measure);
    expect(lines.join(" ")).toBe("bir iki üç dört beş");
    expect(lines.length).toBeGreaterThan(1);
  });

  it("grows with its content, never below the minimum height, texture matches the board", () => {
    const short = layoutLabel({ ...base, artist: "", year: "" }, "tr", measure);
    const full = layoutLabel({ ...base, technique: "Tuval üzerine yağlı boya", heightCm: 73.7, widthCm: 92.1 }, "tr", measure);
    expect(short.height).toBe(LABEL_MIN_HEIGHT);
    const long = layoutLabel({ ...base, title: "Halka Yol Gösteren Özgürlük ve Barikattaki Paris Halkı", technique: "Karton üzerine yağlı boya, tempera ve pastel", heightCm: 91, widthCm: 73.5 }, "tr", measure);
    expect(long.height).toBeGreaterThan(LABEL_MIN_HEIGHT);
    expect(full.height).toBeGreaterThanOrEqual(short.height);
    expect(full.textureHeight).toBe(Math.round(full.height * LABEL_PX_PER_M));
    // Baselines go down the board and stay inside it.
    const b = full.lines.map((l) => l.baseline);
    expect([...b].sort((p, q) => p - q)).toEqual(b);
    expect(b[b.length - 1]).toBeLessThan(full.textureHeight);
  });

  it("sets the artist bold and the title italic", () => {
    expect(labelFont("artist")).toMatch(/^600 \d+px/);
    expect(labelFont("title")).toMatch(/^italic 400/);
  });
});

describe("label placement", () => {
  const room = buildRoomLayout([10, 8], 3.5);
  const heights = (all: Artwork[]) => new Map(all.map((a) => [a.id, 0.09]));
  const frameHalf = (a: Artwork) => (a.height * a.aspect) / 2 + FRAME_BORDER;

  it("hangs at reading height beside the work's lower half, within its vertical span", () => {
    expect(labelCenterY(base, 0.09)).toBeCloseTo(LABEL_CENTER_Y, 10);
    const high = { ...base, position: [0, 2.3, -4] as [number, number, number] };
    const y = labelCenterY(high, 0.09);
    expect(y - 0.045).toBeGreaterThanOrEqual(2.3 - base.height / 2 - FRAME_BORDER - 1e-9);
    const tiny = { ...base, frame: null, height: 0.05, position: [0, 1.6, -4] as [number, number, number] };
    expect(labelCenterY(tiny, 0.09)).toBe(1.6);
  });

  it("goes to the right of the frame on an open wall", () => {
    const p = placeLabels([base], room.walls, heights([base])).get("a")!;
    expect(p.side).toBe("right");
    expect(p.x).toBeCloseTo(frameHalf(base) + LABEL_GAP + LABEL_WIDTH / 2, 10);
  });

  it("switches to the left next to a corner, and below when boxed in", () => {
    const nearCorner = { ...base, position: [4.6 - frameHalf(base), 1.5, -4 + WALL_CLEARANCE] as [number, number, number] };
    expect(placeLabels([nearCorner], room.walls, heights([nearCorner])).get("a")!.side).toBe("left");
    const wide = { ...base, aspect: 9 / 0.737, position: [0, 1.5, -4 + WALL_CLEARANCE] as [number, number, number] };
    expect(placeLabels([wide], room.walls, heights([wide])).get("a")!.side).toBe("below");
  });

  it("moves to the other side of the frame when a window is on its right", () => {
    const north = { ...base, position: [0, 1.5, -4 + WALL_CLEARANCE] as [number, number, number] };
    const withWindow = buildRoomLayout([10, 8], 3.5, undefined, undefined, [
      // Opening starts 20 cm right of the frame: no room for a 31 cm label.
      { id: "w", wallId: "north", alongFraction: (frameHalf(north) + 0.2 + 0.5 + 5) / 10, width: 1, height: 2, sillHeight: 0.8, styleId: "modern" },
    ]);
    expect(placeLabels([north], withWindow.walls, heights([north]), withWindow.windows).get("a")!.side).toBe("left");
    // A high clerestory above the painting doesn't count.
    const high = buildRoomLayout([10, 8], 3.5, undefined, undefined, [
      { id: "w", wallId: "north", alongFraction: (frameHalf(north) + 0.2 + 0.5 + 5) / 10, width: 1, height: 0.6, sillHeight: 2.6, styleId: "modern" },
    ]);
    expect(placeLabels([north], high.walls, heights([north]), high.windows).get("a")!.side).toBe("right");
  });

  it("respects the visitor's right on every wall orientation", () => {
    const east = { ...base, position: [5 - WALL_CLEARANCE, 1.5, 3.6 - frameHalf(base)] as [number, number, number], rotationY: -Math.PI / 2 };
    // Facing the east wall (looking +x) the visitor's right is +z, toward the corner at z = 4: no room there.
    expect(placeLabels([east], room.walls, heights([east])).get("a")!.side).toBe("left");
  });

  it("doesn't put two labels into the same gap between close neighbours", () => {
    const left = { ...base, id: "l", position: [-0.65, 1.5, -4 + WALL_CLEARANCE] as [number, number, number] };
    const right = { ...base, id: "r", position: [0.65, 1.5, -4 + WALL_CLEARANCE] as [number, number, number] };
    const p = placeLabels([left, right], room.walls, heights([left, right]));
    // 1.3 m apart: the gap between the frames can't hold a label, so the left work's label goes to its left.
    expect(p.get("r")!.side).toBe("right");
    expect(p.get("l")!.side).toBe("left");
  });

  it("puts every showcase label beside its work, clear of corners and neighbours", () => {
    const p = placeLabels(SHOWCASE_ARTWORKS, SHOWCASE_EXHIBITION.customLayout!.walls, heights(SHOWCASE_ARTWORKS));
    for (const a of SHOWCASE_ARTWORKS) expect(p.get(a.id)!.side, a.id).toBe("right");
  });

  it("every catalogue work has real dimensions and a medium for its label", () => {
    for (const a of ARTWORKS) {
      expect(a.heightCm, a.id).toBeGreaterThan(0);
      expect(a.widthCm, a.id).toBeGreaterThan(0);
      expect(a.technique, a.id).toBeTruthy();
    }
  });
});

describe("label content and click target", () => {
  it("the modal and the board say the same thing", () => {
    const a = { ...base, technique: "Tuval üzerine yağlı boya", heightCm: 73.7, widthCm: 92.1 };
    const c = labelContent(a, "tr");
    expect(c).toEqual({ artist: "Vincent van Gogh", title: "Yıldızlı Gece", year: "1889", meta: ["Tuval üzerine yağlı boya", "73,7 × 92,1 cm"] });
    expect(texts(a).join(" ")).toContain(c.meta.join(" "));
  });

  const room = buildRoomLayout([10, 8], 3.5);
  const art = { ...base, position: [0, 1.5, -4 + WALL_CLEARANCE] as [number, number, number] };
  const labels = computeWallLabels([art], room.walls, "tr", measure);
  const rect = labelRect(labels.get("a")!);
  const rects = new Map([["a", rect]]);
  const walls = wallBoxes(room);
  const eye = { x: 0, y: 1.6, z: 1 };
  const toward = (x: number, y: number, z: number) => {
    const d = { x: x - eye.x, y: y - eye.y, z: z - eye.z };
    const l = Math.hypot(d.x, d.y, d.z);
    return { x: d.x / l, y: d.y / l, z: d.z / l };
  };

  it("is the label's printed face, on the wall beside the frame", () => {
    expect(rect.planeZ).toBeCloseTo(LABEL_WALL_Z + LABEL_THICKNESS, 10);
    expect(rect.x).toBeGreaterThan(frameHalfOf(art));
    expect(rect.halfW).toBeCloseTo(LABEL_WIDTH / 2, 10);
  });

  it("is hit when looking at the label, missed beside it", () => {
    const z = art.position[2] + rect.planeZ;
    const hit = pickWallLabel(eye, toward(rect.x, 1.5 + rect.y, z), [art], rects, walls);
    expect(hit?.artwork.id).toBe("a");
    expect(pickWallLabel(eye, toward(rect.x + rect.halfW + 0.05, 1.5 + rect.y, z), [art], rects, walls)).toBeNull();
  });

  it("tells a click on the label from a click on the painting", () => {
    const z = art.position[2];
    expect(pickWallTarget(eye, toward(rect.x, 1.5 + rect.y, z + rect.planeZ), [art], rects, walls, FRAME_BORDER)?.kind).toBe("label");
    expect(pickWallTarget(eye, toward(0, 1.5, z), [art], rects, walls, FRAME_BORDER)?.kind).toBe("artwork");
    // Labels switched off (no handler) → only paintings are targets.
    expect(pickWallTarget(eye, toward(rect.x, 1.5 + rect.y, z + rect.planeZ), [art], null, walls, FRAME_BORDER)).toBeNull();
  });

  it("isn't clickable from behind its wall", () => {
    const behind = { x: 0, y: 1.6, z: -6 };
    const d = { x: rect.x, y: rect.y - 0.1, z: art.position[2] - behind.z };
    const l = Math.hypot(d.x, d.y, d.z);
    expect(pickWallLabel(behind, { x: d.x / l, y: d.y / l, z: d.z / l }, [art], rects, walls)).toBeNull();
  });
});

function frameHalfOf(a: Artwork) {
  return (a.height * a.aspect) / 2 + (a.frame ? FRAME_BORDER : 0);
}
