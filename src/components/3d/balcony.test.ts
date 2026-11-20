import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { buildCustomRoomLayout, buildRoomLayout, type GridCell } from "./galleryLayout";
import {
  BALCONY_MAX_DEPTH,
  DEFAULT_BALCONY_DEPTH,
  clampWindowPlacement,
  defaultWindow,
  windowCollides,
  type WindowPlacement,
} from "./windowOpenings";
import { FACADE_OFFSET, balconyFacades, balconyGeometries, facadePanels, railingColliders, rectOverlapsCells, solidWallBoxes } from "./balcony";
import { collides, walkableFloorPoint, wallBoxes } from "./clickNavigationGeometry";
import { planRoute } from "./routePlanner";
import { buildWindowParts } from "./windowGeometry";
import { glassShare, windowLightsFor } from "./windowLight";
import { facadeSunVisibility, outdoorLightFor, spillLightsFor } from "./outdoorLight";
import { CONCEPT_EXHIBITIONS } from "./conceptRooms";

/** 12 × 8 room, 3.6 m high: a balcony door in the middle of the south wall (+z), a window to its east. */
const door: WindowPlacement = {
  id: "b",
  wallId: "south",
  alongFraction: 0.5,
  width: 1.4,
  height: 2.6,
  sillHeight: 0.9, // ignored: a balcony door always starts at the floor
  styleId: "balcony",
  balconyWidth: 3,
  balconyDepth: 1.5,
};
const sideWindow: WindowPlacement = { id: "w", wallId: "south", alongFraction: 0.8, width: 1.2, height: 2, sillHeight: 0.8, styleId: "classic" };
const layout = buildRoomLayout([12, 8], 3.6, undefined, undefined, [door, sideWindow]);
const balcony = balconyGeometries(layout.windows)[0];

describe("balcony resolution", () => {
  it("puts the door on the floor and the platform outside the wall, centred on the door", () => {
    const o = layout.windows!.find((w) => w.id === "b")!;
    expect(o.sill).toBe(0);
    expect(o.balcony).toEqual({ along: 0, width: 3, depth: 1.5 });
    // South wall centre line z = 4, 0.3 m thick → outer face 4.15, edge 5.65.
    expect(balcony.floor).toEqual({ minX: -1.5, maxX: 1.5, minZ: 4.15, maxZ: 5.65 });
    expect(balcony.slab.minZ).toBe(4);
  });

  it("keeps the platform within its wall and clamps its depth", () => {
    const l = buildRoomLayout([12, 8], 3.6, undefined, undefined, [{ ...door, alongFraction: 0.02, balconyWidth: 40, balconyDepth: 9 }]);
    const b = l.windows![0].balcony!;
    expect(b.width).toBe(12); // the south wall's full length
    expect(b.depth).toBe(BALCONY_MAX_DEPTH);
    const narrow = buildRoomLayout([12, 8], 3.6, undefined, undefined, [{ ...door, balconyWidth: 0.5 }]).windows![0].balcony!;
    expect(narrow.width).toBeGreaterThanOrEqual(1.4); // never narrower than its door
  });

  it("drops a second platform that would overlap the first one on the same wall", () => {
    const other = { ...door, id: "b2", alongFraction: 0.72 };
    const l = buildRoomLayout([12, 8], 3.6, undefined, undefined, [door, other]);
    expect(l.windows!.filter((w) => w.balcony)).toHaveLength(1);
  });

  it("drops a balcony that would reach into another part of a U-shaped footprint", () => {
    // U: a 7 × 3 bar (x 0..7, z 0..3) with two 2 m legs going +z (x 0..2 and x 5..7, z 3..6).
    const cells: GridCell[] = [];
    for (let x = 0; x < 7; x++) for (let z = 0; z < 3; z++) cells.push({ x, z });
    for (const x0 of [0, 5]) for (let x = x0; x < x0 + 2; x++) for (let z = 3; z < 6; z++) cells.push({ x, z });
    // The left leg's inner wall (x = 2, z 3..6) faces +x, across the 3 m courtyard toward the right leg.
    const inner = buildCustomRoomLayout(cells, 3.5).wallRuns.find((r) => r.orientation === "vertical" && r.fixed === 2 && r.outward === 1)!;
    const at = (depth: number) =>
      buildCustomRoomLayout(cells, 3.5, undefined, undefined, undefined, [{ ...door, wallId: inner.id, balconyWidth: 2, balconyDepth: depth }]).layout;
    expect(at(2).windows!.filter((w) => w.balcony)).toHaveLength(1);
    // 4 m deep would reach x = 6.15, into the right leg: dropped, door and all (a door to nowhere).
    expect(at(4).windows).toHaveLength(0);
    expect(solidWallBoxes(at(4).walls, at(4).windows)).toHaveLength(at(4).walls.length);
  });
});

describe("walking out onto the balcony", () => {
  it("cuts the wall's collider at the door only (windows stay solid)", () => {
    const boxes = solidWallBoxes(layout.walls, layout.windows);
    expect(boxes).toHaveLength(5); // south wall → two piers either side of the door
    // Through the door: free. Through the window (x = 3.6): blocked.
    expect(collides(0, 4, boxes)).toBe(false);
    expect(collides(3.6, 4, boxes)).toBe(true);
  });

  it("fences the platform with railings the visitor can't pass", () => {
    const rails = railingColliders([balcony]);
    expect(rails).toHaveLength(3);
    const c = layout.colliders;
    for (let z = 2; z <= 5.1; z += 0.1) expect(collides(0, z, c), `z ${z.toFixed(1)}`).toBe(false);
    expect(collides(0, 5.7, c)).toBe(true); // past the edge railing
    expect(collides(1.6, 5, c)).toBe(true); // past a side railing
    expect(collides(1.2, 4.9, c)).toBe(true); // stepping sideways off the platform: the side railing
  });

  it("lets click-to-go pick the balcony floor through the door, but not the ground beyond the railing", () => {
    const walls = wallBoxes(layout);
    const eye = { x: 0, y: 1.7, z: 1 };
    const toward = (x: number, z: number) => new THREE.Vector3(x - eye.x, -eye.y, z - eye.z).normalize();
    expect(walkableFloorPoint(eye, toward(0, 5), walls, layout.colliders)).not.toBeNull();
    expect(walkableFloorPoint(eye, toward(0, 8), walls, layout.colliders)).toBeNull();
    // Through the window: wall.
    expect(walkableFloorPoint(eye, toward(3.6, 6), walls, layout.colliders)).toBeNull();
  });

  it("plans a route from the room onto the balcony through the door", () => {
    const route = planRoute({ x: -4, z: 0 }, { x: 1, z: 5 }, layout.colliders, wallBoxes(layout));
    expect(route.passThrough).toBe(false);
    const last = route.points[route.points.length - 1];
    expect(last.x).toBeCloseTo(1, 1);
    expect(last.z).toBeCloseTo(5, 1);
  });
});

describe("door and facade", () => {
  it("builds an open doorway: a frame, no glass, light through the clear opening", () => {
    const o = layout.windows!.find((w) => w.id === "b")!;
    const parts = buildWindowParts(o);
    expect(parts.panes).toHaveLength(0);
    expect(parts.localPanes).toHaveLength(1);
    expect(glassShare(o)).toBeGreaterThan(0.85);
  });

  it("skins the wall's outer face, holed around the door and the window", () => {
    const [f] = balconyFacades(layout.walls, layout.windows);
    expect(f.normal).toEqual([0, 1]);
    expect(f.plane).toBeCloseTo(4.15 + FACADE_OFFSET, 9);
    const panels = facadePanels(f, layout.windows!);
    // Two openings → 3 full-height piers + a head over each + a sill under the window.
    expect(panels).toHaveLength(6);
    const area = panels.reduce((s, p) => s + (p.a1 - p.a0) * (p.y1 - p.y0), 0);
    // The skin runs past the wall's ends to cover the outer corners.
    expect(f.end - f.start).toBeCloseTo(12 + 0.3 + 2 * FACADE_OFFSET, 9);
    expect(area).toBeCloseTo((f.end - f.start) * 3.6 - 1.4 * 2.6 - 1.2 * 2, 6);
  });

  it("lights the platform from the sun in front of the facade and shades it from a sun behind it", () => {
    const facades = balconyFacades(layout.walls, layout.windows);
    const p = new THREE.Vector3(0, 0, 5);
    const front = new THREE.Vector3(0, Math.sin(0.3), Math.cos(0.3));
    const behind = new THREE.Vector3(0, Math.sin(0.3), -Math.cos(0.3));
    expect(facadeSunVisibility(p, front, facades)).toBe(1);
    expect(facadeSunVisibility(p, behind, facades)).toBe(0);
    // A very high sun from behind clears the 3.6 m facade over a 0.85 m gap.
    const overhead = new THREE.Vector3(0, Math.sin(1.45), -Math.cos(1.45));
    expect(facadeSunVisibility(p, overhead, facades)).toBe(1);
  });

  it("takes its sky light from the panorama: brighter from above than from below", () => {
    const light = outdoorLightFor("park", 0, 1.25, []);
    const lum = ([r, g, b]: [number, number, number]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
    expect(lum(light.sky[2])).toBeGreaterThan(lum(light.sky[3]));
    expect(light.sunDirection).not.toBeNull();
    expect(outdoorLightFor("city", 0, 1.35, []).sunDirection).toBeNull();
  });
});

describe("editor rules", () => {
  it("gives a new balcony door its own proportions", () => {
    const d = defaultWindow("balcony", 3.6);
    expect(d.sillHeight).toBe(0);
    expect(d.balconyDepth).toBe(DEFAULT_BALCONY_DEPTH);
  });

  it("clamps a balcony like the renderer and strips balcony fields from windows", () => {
    const c = clampWindowPlacement({ ...door, sillHeight: 1, balconyDepth: 20, balconyWidth: 0.2 }, 12, 3.6);
    expect(c.sillHeight).toBe(0);
    expect(c.balconyDepth).toBe(BALCONY_MAX_DEPTH);
    expect(c.balconyWidth).toBeGreaterThanOrEqual(c.width);
    const w = clampWindowPlacement({ ...sideWindow, balconyDepth: 2 }, 12, 3.6);
    expect("balconyDepth" in w).toBe(false);
  });

  it("refuses overlapping balcony platforms but lets a window sit over one", () => {
    const a = { ...door, alongFraction: 0.3 };
    expect(windowCollides({ ...door, id: "c", alongFraction: 0.5 }, [a], 12)).toBe(true); // platforms 3 m wide, 2.4 m apart
    expect(windowCollides({ ...door, id: "c", alongFraction: 0.6 }, [a], 12)).toBe(false);
    expect(windowCollides({ ...sideWindow, alongFraction: 0.45 }, [a], 12)).toBe(false);
  });

  it("detects a platform reaching into drawn cells", () => {
    expect(rectOverlapsCells({ minX: 0.5, maxX: 1.5, minZ: -1, maxZ: 0 }, [{ x: 0, z: 0 }])).toBe(false);
    expect(rectOverlapsCells({ minX: 0.5, maxX: 1.5, minZ: -1, maxZ: 0.1 }, [{ x: 0, z: 0 }])).toBe(true);
  });
});

describe("vitrin-9 (balcony demo room)", () => {
  const ex = CONCEPT_EXHIBITIONS.find((e) => e.id === "vitrin-9")!;
  const l = ex.customLayout!;

  it("has one walkable balcony, sunlit from the panorama", () => {
    const [b] = balconyGeometries(l.windows);
    expect(b).toBeDefined();
    const mid = { x: (b.floor.minX + b.floor.maxX) / 2, z: (b.floor.minZ + b.floor.maxZ) / 2 };
    expect(collides(mid.x, mid.z, l.colliders)).toBe(false);
    expect(planRoute({ x: 0, z: -2 }, mid, l.colliders, wallBoxes(l)).passThrough).toBe(false);
    const light = outdoorLightFor(ex.outdoor!.panoramaId, ex.outdoor!.rotationY ?? 0, 1.25, balconyFacades(l.walls, l.windows));
    expect(facadeSunVisibility(new THREE.Vector3(mid.x, 0, mid.z), light.sunDirection!, light.facades)).toBe(1);
  });

  it("keeps the south wall's paintings off the door and the windows", () => {
    const spans = l.windows!.map((w) => [w.center[0] - w.width / 2, w.center[0] + w.width / 2]);
    for (const a of ex.artworks!.filter((x) => x.rotationY === Math.PI)) {
      const half = (a.height * a.aspect) / 2 + 0.3;
      for (const [s0, s1] of spans) expect(a.position[0] + half <= s0 || a.position[0] - half >= s1, a.id).toBe(true);
    }
  });
});

describe("vitrin-10 (night room)", () => {
  const ex = CONCEPT_EXHIBITIONS.find((e) => e.id === "vitrin-10")!;
  const l = ex.customLayout!;

  it("opens onto the night city through a walkable balcony and two glass walls", () => {
    expect(ex.outdoor!.panoramaId).toBe("night");
    expect(l.windows!.filter((w) => w.balcony)).toHaveLength(1);
    expect(l.windows!.filter((w) => w.styleId === "panorama")).toHaveLength(2);
    const [b] = balconyGeometries(l.windows);
    const mid = { x: (b.floor.minX + b.floor.maxX) / 2, z: (b.floor.minZ + b.floor.maxZ) / 2 };
    expect(planRoute({ x: 0, z: 3 }, mid, l.colliders, wallBoxes(l)).passThrough).toBe(false);
  });

  it("has no sun at night, and lets far less light in through the glass than the daytime park", () => {
    expect(outdoorLightFor("night", 0, 0.9, []).sunDirection).toBeNull();
    const lum = ([r, g, b]: [number, number, number]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const glass = l.windows!.filter((w) => w.styleId === "panorama");
    const night = windowLightsFor(glass, "night", ex.outdoor!.rotationY ?? 0);
    const day = windowLightsFor(glass, "park", ex.outdoor!.rotationY ?? 0);
    // The painted night skyline is a few % of the daytime park.
    expect(lum(night[0].radiance)).toBeLessThan(lum(day[0].radiance) / 6);
    expect(lum(night[0].radiance)).toBeGreaterThan(0);
  });

  it("spills the room's light out of every opening on the balcony wall, facing outside", () => {
    const facades = balconyFacades(l.walls, l.windows);
    const spills = spillLightsFor(l.windows, facades);
    expect(spills).toHaveLength(3); // the door and both glass walls
    for (const s of spills) {
      expect(s.normal.z).toBe(-1); // north wall → outside is −z
      const [a, b, , d] = s.corners;
      expect(b.clone().sub(a).cross(d.clone().sub(a)).dot(s.normal)).toBeGreaterThan(0);
      expect(a.z).toBeCloseTo(-5 - 0.15, 9); // on the wall's outer face
    }
  });
});
