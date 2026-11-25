import { describe, expect, it } from "vitest";
import { WALL_THICKNESS, buildCustomRoomLayout, buildRoomLayout } from "./galleryLayout";
import {
  WINDOW_EDGE_MARGIN,
  WINDOW_HEAD_MARGIN,
  clampWindowPlacement,
  defaultWindow,
  windowCollides,
  openingSpansOnWall,
  resolveWindowOpenings,
  splitWallAroundOpenings,
  splitWallsAroundOpenings,
  type WindowPlacement,
} from "./windowOpenings";
import * as THREE from "three";
import { WINDOW_SETBACK, barOffsets, buildWindowParts } from "./windowGeometry";
import { CONCEPT_EXHIBITIONS } from "./__fixtures__/demoRooms";
import { FRAME_BORDER } from "./artworkShadow";

const win = (over: Partial<WindowPlacement> = {}): WindowPlacement => ({
  id: "w",
  wallId: "north",
  alongFraction: 0.5,
  width: 2,
  height: 2,
  sillHeight: 1,
  styleId: "modern",
  ...over,
});

// 10 × 8 room, 4 m high: north wall runs x -5..5 at z = -4.
const room = buildRoomLayout([10, 8], 4);

describe("resolveWindowOpenings", () => {
  it("places the opening on its wall, centred by alongFraction, facing into the room", () => {
    const [o] = resolveWindowOpenings(room.walls, [win({ alongFraction: 0.25 })], [0, 0]);
    expect(o.axis).toBe("x");
    expect(o.center).toEqual([-2.5, 2, -4]);
    expect(o.sill).toBe(1);
    expect(o.inward).toEqual([0, 1]);
    expect(o.depth).toBe(WALL_THICKNESS);

    const [east] = resolveWindowOpenings(room.walls, [win({ wallId: "east" })], [0, 0]);
    expect(east.axis).toBe("z");
    expect(east.center).toEqual([5, 2, 0]);
    expect(east.inward).toEqual([-1, 0]);
  });

  it("keeps solid wall at both ends and under the ceiling", () => {
    const [o] = resolveWindowOpenings(room.walls, [win({ alongFraction: 1, width: 20, height: 9 })], [0, 0]);
    expect(o.width).toBeCloseTo(10 - 2 * WINDOW_EDGE_MARGIN);
    expect(o.center[0] + o.width / 2).toBeCloseTo(5 - WINDOW_EDGE_MARGIN);
    expect(o.sill + o.height).toBeCloseTo(4 - WINDOW_HEAD_MARGIN);
  });

  it("allows floor-to-ceiling glazing (sill 0)", () => {
    const [o] = resolveWindowOpenings(room.walls, [win({ sillHeight: 0, height: 10 })], [0, 0]);
    expect(o.sill).toBe(0);
    expect(o.height).toBeCloseTo(4 - WINDOW_HEAD_MARGIN);
  });

  it("skips unknown walls and windows overlapping an earlier one on the same wall", () => {
    const res = resolveWindowOpenings(
      room.walls,
      [win({ id: "a" }), win({ id: "b", alongFraction: 0.55 }), win({ id: "c", wallId: "nope" }), win({ id: "d", alongFraction: 0.9 })],
      [0, 0]
    );
    expect(res.map((o) => o.id)).toEqual(["a", "d"]);
  });

  it("uses a custom wall run's outward side for the inward direction", () => {
    // 3 × 2 cells: bottom wall run is at z = 2 with the room on its -z side.
    const cells = [0, 1, 2].flatMap((x) => [0, 1].map((z) => ({ x, z })));
    const { wallRuns } = buildCustomRoomLayout(cells, 3);
    const bottom = wallRuns.find((w) => w.orientation === "horizontal" && Math.abs(w.fixed - 2) < 1e-9)!;
    const [o] = resolveWindowOpenings(wallRuns, [win({ wallId: bottom.id, width: 1, height: 1 })], [99, 99]);
    expect(o.inward).toEqual([0, -1]);
  });

  it("is resolved by buildRoomLayout without touching the colliders", () => {
    const layout = buildRoomLayout([10, 8], 4, undefined, undefined, [win()]);
    expect(layout.windows).toHaveLength(1);
    expect(layout.colliders).toEqual(room.colliders);
  });
});

describe("splitWallAroundOpenings", () => {
  const north = room.walls.find((w) => w.id === "north")!;
  const volume = (ws: { size: [number, number, number] }[]) => ws.reduce((s, w) => s + w.size[0] * w.size[1] * w.size[2], 0);

  it("returns the wall untouched without openings", () => {
    expect(splitWallAroundOpenings(north, [])).toEqual([north]);
    expect(splitWallsAroundOpenings(room.walls, [])).toBe(room.walls);
  });

  it("cuts piers, a sill piece and a head piece that exactly fill the wall minus the hole", () => {
    const openings = resolveWindowOpenings(room.walls, [win({ alongFraction: 0.3 }), win({ id: "b", alongFraction: 0.75 })], [0, 0]);
    const pieces = splitWallAroundOpenings(north, openings);
    expect(pieces).toHaveLength(3 + 2 * 2);
    const hole = openings.reduce((s, o) => s + o.width * o.height * o.depth, 0);
    expect(volume(pieces)).toBeCloseTo(volume([north]) - hole, 9);
    for (const p of pieces) {
      expect(p.position[2]).toBe(north.position[2]);
      expect(p.size[2]).toBe(north.size[2]);
      expect(p.id.startsWith("north:")).toBe(true);
    }
    // Nothing of the wall is left inside either opening.
    for (const o of openings)
      for (const p of pieces) {
        const overlapX = Math.min(p.position[0] + p.size[0] / 2, o.center[0] + o.width / 2) - Math.max(p.position[0] - p.size[0] / 2, o.center[0] - o.width / 2);
        const overlapY = Math.min(p.position[1] + p.size[1] / 2, o.sill + o.height) - Math.max(p.position[1] - p.size[1] / 2, o.sill);
        expect(overlapX > 1e-9 && overlapY > 1e-9).toBe(false);
      }
  });

  it("leaves no sill piece under floor-to-ceiling glazing", () => {
    const openings = resolveWindowOpenings(room.walls, [win({ sillHeight: 0 })], [0, 0]);
    const pieces = splitWallAroundOpenings(north, openings);
    expect(pieces).toHaveLength(3);
  });

  it("reports the spans an opening blocks along its wall", () => {
    const openings = resolveWindowOpenings(room.walls, [win({ alongFraction: 0.75 }), win({ id: "b", alongFraction: 0.25 })], [0, 0]);
    expect(openingSpansOnWall("north", openings)).toEqual([
      [-3.5, -1.5],
      [1.5, 3.5],
    ]);
    expect(openingSpansOnWall("east", openings)).toEqual([]);
  });
});

describe("window joinery", () => {
  it("splits a span into panes no larger than the limit", () => {
    expect(barOffsets(1.2, 1.3, 0.04)).toEqual([]);
    expect(barOffsets(2.5, 1.3, 0.04)).toEqual([0]);
    const offsets = barOffsets(3, 0.5, 0.035);
    expect(offsets.length).toBe(5); // 6 panes
    for (let i = 1; i < offsets.length; i++) expect(offsets[i] - offsets[i - 1] - 0.035).toBeLessThanOrEqual(0.5);
  });

  const bbox = (g: THREE.BufferGeometry) => {
    g.computeBoundingBox();
    return g.boundingBox!;
  };

  for (const styleId of ["modern", "classic", "panorama"] as const) {
    describe(styleId, () => {
      const [o] = resolveWindowOpenings(room.walls, [win({ styleId, width: 2.4, height: 2.6, sillHeight: styleId === "panorama" ? 0 : 0.9 })], [0, 0]);
      const parts = buildWindowParts(o);
      const pos = parts.joinery.attributes.position;
      const nrm = parts.joinery.attributes.normal;
      const idx = parts.joinery.index!;
      const roomFace = o.center[2] + o.depth / 2; // north wall: room side is +z

      it("builds closed, consistently wound, vertex-coloured joinery", () => {
        expect(idx.count).toBeGreaterThan(100);
        expect(parts.joinery.attributes.color.count).toBe(pos.count);
        const p = (i: number) => new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i));
        const n = (i: number) => new THREE.Vector3(nrm.getX(i), nrm.getY(i), nrm.getZ(i));
        for (let t = 0; t < idx.count; t += 3) {
          const [a, b, c] = [idx.getX(t), idx.getX(t + 1), idx.getX(t + 2)];
          const face = new THREE.Vector3().crossVectors(p(b).sub(p(a)), p(c).sub(p(a)));
          expect(face.dot(n(a))).toBeGreaterThanOrEqual(0);
          expect(n(a).length()).toBeCloseTo(1, 5);
        }
      });

      it("keeps the frame inside the opening and behind the room-side wall face (casing/board excepted)", () => {
        if (styleId === "classic") {
          // Casing + board reach onto the wall face and a few cm into the room, no further.
          const box = bbox(parts.joinery);
          expect(box.max.z).toBeLessThan(roomFace + 0.06);
          expect(box.max.x).toBeLessThan(o.center[0] + o.width / 2 + 0.13);
          return;
        }
        const box = bbox(parts.joinery);
        expect(box.min.x).toBeGreaterThanOrEqual(o.center[0] - o.width / 2 - 1e-6);
        expect(box.max.x).toBeLessThanOrEqual(o.center[0] + o.width / 2 + 1e-6);
        expect(box.min.y).toBeGreaterThanOrEqual(o.sill - 1e-6);
        expect(box.max.y).toBeLessThanOrEqual(o.sill + o.height + 1e-6);
        expect(box.max.z).toBeLessThan(roomFace);
      });

      it("glazes the openings between the bars, on the set-back glass plane, facing the room", () => {
        expect(parts.panes.length).toBeGreaterThan(0);
        for (const pane of parts.panes) {
          expect(pane.center[2]).toBeCloseTo(o.center[2] - WINDOW_SETBACK);
          expect(pane.rotationY).toBe(0);
          expect(Math.abs(pane.center[0] - o.center[0]) + pane.width / 2).toBeLessThanOrEqual(o.width / 2);
        }
        const glassArea = parts.panes.reduce((s, p) => s + p.width * p.height, 0);
        expect(glassArea).toBeGreaterThan(0.55 * o.width * o.height);
        expect(glassArea).toBeLessThan(o.width * o.height);
      });

      it("has hardware only on opening styles", () => {
        expect(parts.hardware !== null).toBe(styleId !== "panorama");
      });
    });
  }

  it("turns with the wall: an east-wall window faces west into the room", () => {
    const [o] = resolveWindowOpenings(room.walls, [win({ wallId: "east" })], [0, 0]);
    const parts = buildWindowParts(o);
    expect(parts.panes[0].rotationY).toBe(-Math.PI / 2);
    expect(parts.panes[0].center[0]).toBeCloseTo(5 + WINDOW_SETBACK);
    const box = bbox(parts.joinery);
    expect(box.min.x).toBeGreaterThan(5 - o.depth / 2);
  });

  it("drops the classic window board for a floor-level opening", () => {
    const withSill = buildWindowParts(resolveWindowOpenings(room.walls, [win({ styleId: "classic" })], [0, 0])[0]);
    const floor = buildWindowParts(resolveWindowOpenings(room.walls, [win({ styleId: "classic", sillHeight: 0 })], [0, 0])[0]);
    expect(bbox(withSill.joinery).max.z).toBeGreaterThan(bbox(floor.joinery).max.z);
  });
});

describe("window demo rooms", () => {
  for (const id of ["vitrin-6", "vitrin-7"]) {
    const ex = CONCEPT_EXHIBITIONS.find((e) => e.id === id)!;
    const windows = ex.customLayout!.windows!;

    it(`${id}: resolves every window and keeps the paintings clear of them`, () => {
      expect(windows.length).toBeGreaterThan(0);
      expect(ex.outdoor?.panoramaId).toBeTruthy();
      for (const a of ex.artworks!) {
        const half = (a.height * a.aspect) / 2 + FRAME_BORDER;
        for (const o of windows) {
          const sameWall = o.axis === "x" ? Math.abs(a.position[2] - o.center[2]) < 0.5 : Math.abs(a.position[0] - o.center[0]) < 0.5;
          if (!sameWall) continue;
          const along = o.axis === "x" ? a.position[0] : a.position[2];
          const oAlong = o.axis === "x" ? o.center[0] : o.center[2];
          expect(Math.abs(along - oAlong) - half - o.width / 2, `${a.id} / ${o.id}`).toBeGreaterThan(0.5);
        }
      }
    });
  }
});

describe("editor rules", () => {
  it("gives each style sensible defaults that fit under the ceiling", () => {
    for (const s of ["classic", "modern", "panorama"] as const) {
      const d = defaultWindow(s, 3.2);
      expect(d.sillHeight + d.height).toBeLessThanOrEqual(3.2 - WINDOW_HEAD_MARGIN + 1e-9);
    }
    expect(defaultWindow("panorama", 4).sillHeight).toBe(0);
  });

  it("clamps a placement into its wall like the renderer does", () => {
    const p = clampWindowPlacement(win({ alongFraction: 0.99, width: 30, height: 9, sillHeight: 3.9 }), 10, 4);
    expect(p.width).toBeCloseTo(10 - 2 * WINDOW_EDGE_MARGIN);
    expect(p.sillHeight + p.height).toBeLessThanOrEqual(4 - WINDOW_HEAD_MARGIN + 1e-9);
    // Same result the renderer resolves to.
    const [o] = resolveWindowOpenings(room.walls, [{ ...p }], [0, 0]);
    expect(o.width).toBeCloseTo(p.width);
    expect(o.center[0]).toBeCloseTo(-5 + p.alongFraction * 10);
  });

  it("detects windows that would overlap on the same wall only", () => {
    const a = win({ id: "a", alongFraction: 0.3 });
    expect(windowCollides(win({ id: "b", alongFraction: 0.4 }), [a], 10)).toBe(true);
    expect(windowCollides(win({ id: "b", alongFraction: 0.6 }), [a], 10)).toBe(false);
    expect(windowCollides(win({ id: "b", alongFraction: 0.3, wallId: "east" }), [a], 10)).toBe(false);
    expect(windowCollides(a, [a], 10)).toBe(false); // itself
  });
});
