import { describe, expect, it } from "vitest";
import {
  DEFAULT_MEZZANINE,
  MEZZANINE_STAIR_WIDTH,
  isMezzanineRunId,
  mezzanineGroundRules,
  mezzanineProblem,
  mezzanineSpecFor,
  mezzanineWallRuns,
  stairRun,
  windowCrossesSlab,
} from "./mezzanineTemplate";
import { SLAB_THICKNESS, resolveMezzanine } from "./mezzanine";
import { buildRoomLayout, WALL_THICKNESS } from "./galleryLayout";
import { adaptApiExhibition, adaptExhibitionTemplate, rectangleBlueprint, wallRunsForSceneConfig } from "./backendAdapter";
import { levelNav, planLevelRoute, stepTowardOnLevels, floorYAt, type LevelPoint } from "./levels";
import { EXHIBITIONS } from "./exhibitions";
import type { ApiExhibition, ApiExhibitionArtwork } from "../../lib/api/domains/exhibitions";
import type { ApiExhibitionTemplate, MezzanineData } from "../../lib/api/domains/exhibitionTemplates";
import type { ApiArtwork } from "../../lib/api/domains/artworks";
import type { FurnitureDef } from "./furniture";

const SIZE: [number, number] = [16, 12];
const H = 7;
const north: MezzanineData = { wallId: "north", depth: 4, top: 3.6, stairEnd: "end" };

describe("mezzanine from template data", () => {
  it("builds a full-length slab along the chosen wall, stair at the chosen end climbing toward it", () => {
    const spec = mezzanineSpecFor(north, SIZE);
    const h = WALL_THICKNESS / 2;
    expect(spec.rect).toEqual({ minX: -8 + h, maxX: 8 - h, minZ: -6 + h, maxZ: -6 + h + 4 });
    expect(spec.stair).toMatchObject({ axis: "z", dir: -1, topAt: -6 + h + 4 });
    expect(spec.stair.across).toEqual([8 - h - MEZZANINE_STAIR_WIDTH, 8 - h]);
    const start = mezzanineSpecFor({ ...north, stairEnd: "start" }, SIZE);
    expect(start.stair.across).toEqual([-8 + h, -8 + h + MEZZANINE_STAIR_WIDTH]);
  });

  it("works on every wall: the slab touches its wall, the stair runs into the hall and lands on the slab edge", () => {
    for (const wallId of ["north", "south", "east", "west"] as const) {
      const data = { ...north, wallId };
      expect(mezzanineProblem(data, SIZE, H), wallId).toBeNull();
      const m = resolveMezzanine(mezzanineSpecFor(data, SIZE), buildRoomLayout(SIZE, H).walls);
      // Exactly one free edge → one railing run (with the stair's gap at one end), and an edge face.
      expect(m.railings, wallId).toHaveLength(1);
      expect(m.edgeFaces, wallId).toHaveLength(1);
      // The stair's foot stays inside the room, with a landing in front of it.
      const s = m.stair;
      const limit = s.axis === "z" ? SIZE[1] / 2 - WALL_THICKNESS / 2 : SIZE[0] / 2 - WALL_THICKNESS / 2;
      expect(Math.abs(s.bottom) + 1.2, wallId).toBeLessThanOrEqual(limit + 1e-9);
      // Walled on the side wall, railed on the hall side.
      expect(s.sides.filter((x) => x.open), wallId).toHaveLength(1);
    }
  });

  it("refuses what doesn't fit: too deep, too low, no headroom, no room for the stair", () => {
    expect(mezzanineProblem({ ...north, depth: 1 }, SIZE, H)).toBe("tooShallow");
    expect(mezzanineProblem({ ...north, depth: 8 }, SIZE, H)).toBe("tooDeep");
    expect(mezzanineProblem({ ...north, top: 2.5 }, SIZE, H)).toBe("tooLow");
    expect(mezzanineProblem({ ...north, top: 5 }, SIZE, 7)).toBe("tooHigh");
    // A 12 m deep room with a 6 m slab: 5.7 m of hall, too short for a 5 m stair + landing.
    expect(mezzanineProblem({ ...north, depth: 6, top: 3.6 }, SIZE, H)).toBe("stairNoRoom");
    expect(stairRun(3.6)).toBeCloseTo(19 * 0.28, 10);
    expect(mezzanineProblem({ wallId: "north", ...DEFAULT_MEZZANINE }, SIZE, H)).toBeNull();
  });

  it("gives the mezzanine level its own wall runs: the slab's wall in full, the side walls above the slab", () => {
    const runs = mezzanineWallRuns(north, SIZE);
    expect(runs.map((r) => r.id)).toEqual(["north@mezz", "west@mezz", "east@mezz"]);
    expect(runs.every((r) => isMezzanineRunId(r.id))).toBe(true);
    expect(runs[0]).toMatchObject({ start: -8, end: 8, fixed: -6 });
    expect(runs[1]).toMatchObject({ start: -6, fixed: -8, orientation: "vertical" });
    expect(runs[1].end).toBeCloseTo(-6 + WALL_THICKNESS / 2 + 4, 10);
  });

  it("keeps room-floor works off the side walls under the slab and off the stair's wall, and under the slab's underside", () => {
    const rules = mezzanineGroundRules(north, SIZE);
    expect(rules.get("north")!.ceiling).toBeCloseTo(3.6 - SLAB_THICKNESS, 10);
    expect(rules.get("west")!.blocked).toHaveLength(1);
    // Stair on the east end → the east wall also blocks the stair's length.
    const east = rules.get("east")!.blocked;
    expect(east).toHaveLength(2);
    expect(east[1][1] - east[1][0]).toBeCloseTo(stairRun(3.6), 10);
    expect(rules.has("south")).toBe(false);
  });

  it("flags windows cutting through the slab", () => {
    const w = { id: "w1", wallId: "north", alongFraction: 0.5, width: 1.5, height: 2, sillHeight: 2.5, styleId: "classic" as const };
    expect(windowCrossesSlab(w, north, SIZE)).toBe(true);
    expect(windowCrossesSlab({ ...w, sillHeight: 4 }, north, SIZE)).toBe(false); // above the slab
    expect(windowCrossesSlab({ ...w, sillHeight: 0.9 }, north, SIZE)).toBe(false); // 0.9 → 2.9, under the slab
    // Side wall: only where the slab meets it (east wall runs z −6 … 6; the slab covers its north 4.15 m).
    const side = { ...w, wallId: "east" };
    expect(windowCrossesSlab({ ...side, alongFraction: 0.2 }, north, SIZE)).toBe(true);
    expect(windowCrossesSlab({ ...side, alongFraction: 0.8 }, north, SIZE)).toBe(false);
  });
});

// --- Backend templates ----------------------------------------------------------------------------------

function makeTemplate(roomShape: ApiExhibitionTemplate["roomShape"]): ApiExhibitionTemplate {
  return {
    id: "template-1",
    organizationId: "org-1",
    name: "Asma Katlı",
    roomShape,
    wallHeight: H,
    wallColor: "#eeeeee",
    floorColor: "#888888",
    ceilingColor: "#ffffff",
    theme: EXHIBITIONS[0].theme,
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

function makeArtwork(id: string): ApiArtwork {
  return {
    id,
    artistProfileId: "p",
    title: id,
    artistDisplayName: "A",
    technique: null,
    yearCreated: 1900,
    heightCm: 100,
    widthCm: 80,
    orientation: "PORTRAIT",
    framed: false,
    story: null,
    conditionStatus: null,
    conditionNotes: null,
    note: null,
    category: "PAINTING",
    priceAmount: 1,
    maxDiscountPercent: null,
    currency: "TRY",
    imageUrl: "https://example.com/a.jpg",
    model3dUrl: null,
    status: "IN_EXHIBITION",
    createdAt: "2026-01-01T00:00:00.000Z",
    artistProfile: { displayName: "A", userId: "u" },
  };
}

function link(id: string, wallRunId: string, order = 0): ApiExhibitionArtwork {
  return { id, exhibitionId: "e", artworkId: id, positionData: { wallRunId }, order, artwork: makeArtwork(id) };
}

const shape = { kind: "rectangle" as const, width: SIZE[0], depth: SIZE[1], mezzanine: north };

describe("backend templates with a mezzanine", () => {
  const bench: FurnitureDef = { id: "bench", label: "Bank", modelUrl: "/b.glb", footprint: { width: 1.8, depth: 0.5 }, isSeating: true };

  it("renders the slab, puts level-1 furniture (and its seat) on it", () => {
    const template = makeTemplate({
      ...shape,
      furniture: [
        { furnitureId: "bench", x: 0, z: -4, rotationY: 0, level: 1 },
        { furnitureId: "bench", x: 0, z: 3, rotationY: 0 },
      ],
    });
    const ex = adaptExhibitionTemplate(template, [bench]);
    const layout = ex.customLayout!;
    expect(layout.mezzanine?.top).toBe(3.6);
    expect(layout.levels).toHaveLength(2);
    expect(ex.furniture![0].position[1]).toBe(3.6);
    expect(ex.furniture![1].position[1]).toBe(0);
    expect(ex.seats![0].y).toBe(3.6);
    expect(ex.seats![1].y).toBeUndefined();
    // Under-slab fixtures were added automatically.
    expect(layout.ceilingSpots.some(([, y]) => y < 3.6)).toBe(true);
    // The slab bench collides on the slab, not on the floor below it.
    expect(layout.levels![1].colliders.length - layout.levels![1].walls.length).toBe(1);
    expect(layout.levels![0].colliders.length - layout.levels![0].walls.length).toBe(1);
  });

  it("ignores a stored mezzanine that no longer fits (a lower wall height): single-level room", () => {
    const ex = adaptExhibitionTemplate({ ...makeTemplate(shape), wallHeight: 5 });
    expect(ex.customLayout?.mezzanine).toBeUndefined();
  });

  it("hangs @mezz works on the slab and keeps room-floor works off the stair and from under the slab", () => {
    const template = makeTemplate(shape);
    const exhibition: ApiExhibition = {
      id: "e",
      curatorUserId: "u",
      title: "Sergi",
      description: null,
      startDate: "2026-01-01T00:00:00.000Z",
      endDate: "2026-02-01T00:00:00.000Z",
      status: "ACTIVE",
      sceneConfig: { kind: "template", templateId: template.id } as ApiExhibition["sceneConfig"],
      maxArtworks: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      exhibitionTemplate: template,
      artworkLinks: [link("up", "north@mezz"), link("side-up", "east@mezz"), link("under", "north"), link("east", "east")],
    };
    const runs = wallRunsForSceneConfig(exhibition.sceneConfig, template)!;
    expect(runs.map((r) => r.id)).toEqual(["north", "south", "east", "west", "north@mezz", "west@mezz", "east@mezz"]);

    const ex = adaptApiExhibition(exhibition)!;
    const by = (id: string) => ex.artworks!.find((a) => a.id === id)!;
    const spec = mezzanineSpecFor(north, SIZE);
    // On the slab: seen from its top, hung above it.
    expect(by("up").floorY).toBe(3.6);
    expect(by("up").position[1]).toBeGreaterThan(3.6 + 1);
    expect(by("side-up").floorY).toBe(3.6);
    expect(by("side-up").position[2]).toBeLessThan(spec.rect.maxZ);
    // Under the slab: below its underside.
    const under = by("under");
    expect(under.floorY).toBeUndefined();
    expect(under.position[1] + under.height / 2).toBeLessThan(3.6 - SLAB_THICKNESS);
    // The east wall (stair side): neither under the slab nor behind the stair.
    const east = by("east");
    const stairEnd = spec.stair.topAt + stairRun(3.6);
    expect(east.position[2] - (east.height * east.aspect) / 2).toBeGreaterThan(stairEnd);
  });

  it("reaches a slab work's viewpoint from the hall over the generated stair", () => {
    const ex = adaptExhibitionTemplate(makeTemplate(shape));
    const nav = levelNav(ex.customLayout!);
    const from: LevelPoint = { x: 0, z: 4, level: 0 };
    const to: LevelPoint = { x: -3, z: -4, level: 1 };
    let at = { ...from, floorY: 0 };
    for (const p of planLevelRoute(nav, from, to).points) {
      for (let i = 0; i < 4000; i++) {
        const s = stepTowardOnLevels(nav, at, p, 0.05);
        at = s;
        if (s.arrived || s.blocked) break;
      }
    }
    expect(Math.hypot(at.x - to.x, at.z - to.z)).toBeLessThan(1e-3);
    expect(at.level).toBe(1);
    expect(floorYAt(nav, at.x, at.z, at.level)).toBe(3.6);
  });

  it("draws the slab, the stair and the mezzanine runs on the plan", () => {
    const plan = rectangleBlueprint(SIZE, [], undefined, north);
    expect(plan.mezzanine?.runs.map((r) => r.id)).toEqual(["north@mezz", "west@mezz", "east@mezz"]);
    expect(plan.mezzanine?.slab).toEqual(mezzanineSpecFor(north, SIZE).rect);
    expect(plan.wallRuns).toHaveLength(4);
  });
});
