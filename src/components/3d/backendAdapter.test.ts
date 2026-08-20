import { describe, expect, it } from "vitest";
import { adaptApiExhibition, groupByWallRun, wallRunsForSceneConfig } from "./backendAdapter";
import { EXHIBITIONS } from "./exhibitions";
import type { ApiExhibition, ApiExhibitionArtwork } from "../../lib/api/domains/exhibitions";
import type { ApiArtwork } from "../../lib/api/domains/artworks";

function makeArtwork(overrides: Partial<ApiArtwork> = {}): ApiArtwork {
  return {
    id: "artwork-1",
    artistProfileId: "profile-1",
    title: "Test Painting",
    technique: null,
    yearCreated: 1900,
    heightCm: 180,
    widthCm: 120,
    orientation: "PORTRAIT",
    story: null,
    conditionStatus: null,
    conditionNotes: null,
    note: null,
    category: "PAINTING",
    priceAmount: 100000,
    currency: "TRY",
    imageUrl: "https://example.com/painting.jpg",
    model3dUrl: null,
    status: "IN_EXHIBITION",
    createdAt: "2026-01-01T00:00:00.000Z",
    artistProfile: { displayName: "Test Artist" },
    ...overrides,
  };
}

function makeLink(overrides: Partial<ApiExhibitionArtwork> = {}): ApiExhibitionArtwork {
  return {
    id: "link-1",
    exhibitionId: "exhibition-1",
    artworkId: "artwork-1",
    positionData: { wallRunId: "north" },
    order: 0,
    artwork: makeArtwork(),
    ...overrides,
  };
}

function makeExhibition(overrides: Partial<ApiExhibition> = {}): ApiExhibition {
  return {
    id: "exhibition-1",
    ownerProfileId: "profile-1",
    title: "Test Exhibition",
    description: "A description",
    startDate: "2026-01-01T00:00:00.000Z",
    endDate: "2026-02-01T00:00:00.000Z",
    status: "ACTIVE",
    sceneConfig: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    artworkLinks: [],
    ...overrides,
  };
}

describe("adaptApiExhibition", () => {
  it("returns null when sceneConfig is missing", () => {
    expect(adaptApiExhibition(makeExhibition({ sceneConfig: null }))).toBeNull();
  });

  it("returns null for a template pointing at an unknown templateId", () => {
    const result = adaptApiExhibition(
      makeExhibition({ sceneConfig: { kind: "template", templateId: "does-not-exist" } })
    );
    expect(result).toBeNull();
  });

  it("builds a template exhibition using the local preset's room/theme and places artworks on named walls", () => {
    const preset = EXHIBITIONS[0];
    const result = adaptApiExhibition(
      makeExhibition({
        title: "My Renaissance Room",
        sceneConfig: { kind: "template", templateId: preset.id },
        artworkLinks: [makeLink({ positionData: { wallRunId: "north" } })],
      })
    );

    expect(result).not.toBeNull();
    expect(result!.id).toBe("exhibition-1");
    expect(result!.name).toBe("My Renaissance Room");
    expect(result!.roomSize).toEqual(preset.roomSize);
    expect(result!.wallHeight).toBe(preset.wallHeight);
    expect(result!.theme).toEqual(preset.theme);
    expect(result!.artworks).toHaveLength(1);
    expect(result!.artworks![0].frame).toBeNull();
    expect(result!.artworks![0].artist).toBe("Test Artist");
  });

  it("uses positionData.heightY as a curator hang-height override when set", () => {
    const preset = EXHIBITIONS[0];
    const result = adaptApiExhibition(
      makeExhibition({
        sceneConfig: { kind: "template", templateId: preset.id },
        artworkLinks: [makeLink({ positionData: { wallRunId: "north", heightY: 2.2 } })],
      })
    );

    expect(result!.artworks![0].position[1]).toBeCloseTo(2.2);
  });

  it("falls back to a Turkish placeholder artist name when artistProfile isn't embedded", () => {
    const preset = EXHIBITIONS[0];
    const result = adaptApiExhibition(
      makeExhibition({
        sceneConfig: { kind: "template", templateId: preset.id },
        artworkLinks: [
          makeLink({ artwork: makeArtwork({ artistProfile: undefined }) }),
        ],
      })
    );

    expect(result!.artworks![0].artist).toBe("Bilinmeyen Sanatçı");
  });

  it("builds a custom exhibition from cells/spawn and derives a full theme from the 3 picked colors", () => {
    const result = adaptApiExhibition(
      makeExhibition({
        sceneConfig: {
          kind: "custom",
          cells: [
            { x: 0, z: 0 },
            { x: 1, z: 0 },
          ],
          wallHeight: 4,
          wallColor: "#112233",
          floorColor: "#445566",
          ceilingColor: "#778899",
          spawn: { x: 0, z: 0, yaw: 0 },
        },
        artworkLinks: [],
      })
    );

    expect(result).not.toBeNull();
    expect(result!.custom).toBe(true);
    expect(result!.customLayout).toBeDefined();
    expect(result!.theme.wallColor).toBe("#112233");
    expect(result!.theme.backgroundColor).toBe("#112233"); // derived from wallColor
    expect(result!.theme.fogColor).toBe("#445566"); // derived from floorColor
    expect(result!.artworks).toEqual([]);
  });

  it("places multiple artworks sharing the same wall run, ordered by the `order` column", () => {
    const preset = EXHIBITIONS[0];
    const result = adaptApiExhibition(
      makeExhibition({
        sceneConfig: { kind: "template", templateId: preset.id },
        artworkLinks: [
          makeLink({ id: "link-b", order: 1, artwork: makeArtwork({ id: "b", title: "Second" }) }),
          makeLink({ id: "link-a", order: 0, artwork: makeArtwork({ id: "a", title: "First" }) }),
        ],
      })
    );

    expect(result!.artworks).toHaveLength(2);
    expect(result!.artworks!.map((a) => a.title)).toEqual(["First", "Second"]);
    // Two artworks split the north wall into two slots -> different x positions.
    expect(result!.artworks![0].position[0]).not.toBeCloseTo(result!.artworks![1].position[0]);
  });

  it("ignores links with no positionData (not hung on a wall yet)", () => {
    const preset = EXHIBITIONS[0];
    const result = adaptApiExhibition(
      makeExhibition({
        sceneConfig: { kind: "template", templateId: preset.id },
        artworkLinks: [makeLink({ positionData: null })],
      })
    );

    expect(result!.artworks).toEqual([]);
  });

  it("treats a missing artworkLinks (e.g. from a list endpoint) as an empty room", () => {
    const preset = EXHIBITIONS[0];
    const result = adaptApiExhibition(
      makeExhibition({
        sceneConfig: { kind: "template", templateId: preset.id },
        artworkLinks: undefined,
      })
    );

    expect(result!.artworks).toEqual([]);
  });
});

describe("wallRunsForSceneConfig", () => {
  it("returns null for a missing sceneConfig", () => {
    expect(wallRunsForSceneConfig(null)).toBeNull();
  });

  it("returns null for a template pointing at an unknown templateId", () => {
    expect(wallRunsForSceneConfig({ kind: "template", templateId: "does-not-exist" })).toBeNull();
  });

  it("returns the 4 named walls for a template sceneConfig", () => {
    const preset = EXHIBITIONS[0];
    const runs = wallRunsForSceneConfig({ kind: "template", templateId: preset.id });

    expect(runs?.map((r) => r.id).sort()).toEqual(["east", "north", "south", "west"]);
  });

  it("returns one run per boundary edge for a custom sceneConfig", () => {
    const runs = wallRunsForSceneConfig({
      kind: "custom",
      cells: [{ x: 0, z: 0 }],
      wallHeight: 4,
      wallColor: "#112233",
      floorColor: "#445566",
      ceilingColor: "#778899",
      spawn: { x: 0, z: 0, yaw: 0 },
    });

    // A single 1x1 cell has 4 boundary edges (no shared/interior edges to merge away).
    expect(runs).toHaveLength(4);
  });
});

describe("groupByWallRun", () => {
  it("groups links by wallRunId and sorts by the order column", () => {
    const links = [
      makeLink({ id: "b", order: 1, positionData: { wallRunId: "north" } }),
      makeLink({ id: "a", order: 0, positionData: { wallRunId: "north" } }),
      makeLink({ id: "c", order: 0, positionData: { wallRunId: "south" } }),
    ];

    const byWall = groupByWallRun(links);

    expect(byWall.get("north")?.map((l) => l.id)).toEqual(["a", "b"]);
    expect(byWall.get("south")?.map((l) => l.id)).toEqual(["c"]);
  });

  it("ignores links with no positionData", () => {
    const links = [makeLink({ id: "a", positionData: null })];

    expect(groupByWallRun(links).size).toBe(0);
  });
});
