import { describe, expect, it } from "vitest";
import { balconyGeometries, doorLeafColliders, railingColliders, solidWallBoxes } from "./balcony";
import { EXHIBITIONS } from "./exhibitions";
import { FRAME_BORDER } from "./artworkShadow";
import { EYE_HEIGHT, PLAYER_RADIUS, WALL_CLEARANCE, minCeilingFor } from "./galleryLayout";
import {
  CONCEPT_EXHIBITIONS,
  CONCEPT_HANG_CENTER_Y,
  CONCEPT_MIN_BOTTOM,
  CONCEPT_ROOM_SPECS,
  conceptHangY,
  conceptLightGrid,
} from "./conceptRooms";
import { SHOWCASE_ID } from "./showcaseExhibition";
import { CEILING_TEXTURES, FLOOR_TEXTURES, WALL_TEXTURES, findTexture } from "./surfaceTextures";

describe("concept rooms", () => {
  it("are vitrin-2 … vitrin-11, registered once each next to vitrin-1", () => {
    expect(CONCEPT_ROOM_SPECS.map((s) => s.id)).toEqual([
      "vitrin-2",
      "vitrin-3",
      "vitrin-4",
      "vitrin-5",
      "vitrin-6",
      "vitrin-7",
      "vitrin-8",
      "vitrin-9",
      "vitrin-10",
      "vitrin-11",
    ]);
    expect(SHOWCASE_ID).toBe("vitrin-1");
    const ids = EXHIBITIONS.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const e of CONCEPT_EXHIBITIONS) expect(EXHIBITIONS.find((x) => x.id === e.id)).toBe(e);
  });

  it("differ from each other in floor, wall and ceiling look", () => {
    const keys = CONCEPT_ROOM_SPECS.map((s) => [s.theme.floorTextureId, s.theme.wallTextureId, s.theme.ceilingTextureId, s.theme.wallColor].join("|"));
    expect(new Set(keys).size).toBe(keys.length);
    // More rooms than floor scans now: a floor may repeat, the room as a whole (and its wall colour) may not.
    expect(new Set(CONCEPT_ROOM_SPECS.map((s) => s.theme.wallColor)).size).toBe(CONCEPT_ROOM_SPECS.length);
  });

  it("only reference surface textures that exist", () => {
    for (const { id, theme } of CONCEPT_ROOM_SPECS) {
      if (theme.floorTextureId) expect(findTexture(FLOOR_TEXTURES, theme.floorTextureId), id).not.toBeNull();
      if (theme.wallTextureId) expect(findTexture(WALL_TEXTURES, theme.wallTextureId), id).not.toBeNull();
      if (theme.ceilingTextureId) expect(findTexture(CEILING_TEXTURES, theme.ceilingTextureId), id).not.toBeNull();
    }
  });

  it("spreads the ceiling fixture grid inside the room", () => {
    const pts = conceptLightGrid([18, 12], [3, 2]);
    expect(pts).toHaveLength(6);
    for (const p of pts) {
      expect(Math.abs(p.x)).toBeLessThan(9);
      expect(Math.abs(p.z)).toBeLessThan(6);
    }
  });
});

for (const spec of CONCEPT_ROOM_SPECS) {
  const ex = CONCEPT_EXHIBITIONS.find((e) => e.id === spec.id)!;
  const layout = ex.customLayout!;
  const [W, D] = spec.roomSize;
  const arts = ex.artworks!;
  const widthOf = (a: (typeof arts)[number]) => a.height * a.aspect + 2 * FRAME_BORDER;
  /** Floor the work is seen from (a mezzanine's top for works hung on it). */
  const floorOf = (a: (typeof arts)[number]) => a.floorY ?? 0;

  function wallOf(a: (typeof arts)[number]) {
    const [x, , z] = a.position;
    if (Math.abs(z - (-D / 2 + WALL_CLEARANCE)) < 1e-9) return { wall: "north", along: x, length: W };
    if (Math.abs(z - (D / 2 - WALL_CLEARANCE)) < 1e-9) return { wall: "south", along: x, length: W };
    if (Math.abs(x - (W / 2 - WALL_CLEARANCE)) < 1e-9) return { wall: "east", along: z, length: D };
    if (Math.abs(x - (-W / 2 + WALL_CLEARANCE)) < 1e-9) return { wall: "west", along: z, length: D };
    return null;
  }

  describe(`${spec.id} — ${spec.name}`, () => {
    it("keeps picture-light pool size and unique ids, all belonging to this room", () => {
      expect(arts.length).toBeGreaterThanOrEqual(6);
      expect(arts.length).toBeLessThanOrEqual(8);
      expect(new Set(arts.map((a) => a.id)).size).toBe(arts.length);
      for (const a of arts) expect(a.exhibitionId).toBe(spec.id);
    });

    it("hangs every work on a wall face, facing in, clear of the corners", () => {
      const facing: Record<string, number> = { north: 0, south: Math.PI, east: -Math.PI / 2, west: Math.PI / 2 };
      for (const a of arts) {
        const w = wallOf(a);
        expect(w, a.id).not.toBeNull();
        expect(a.rotationY).toBeCloseTo(facing[w!.wall], 10);
        expect(Math.abs(w!.along) + widthOf(a) / 2, a.id).toBeLessThan(w!.length / 2 - 0.8);
      }
    });

    it("hangs at eye level, off the floor and well below the ceiling", () => {
      for (const a of arts) {
        // Measured from the floor it's seen from (the mezzanine's top for works hung on it).
        const y = a.position[1] - floorOf(a);
        expect(y).toBeCloseTo(conceptHangY(a.height), 10);
        expect(y - a.height / 2).toBeGreaterThanOrEqual(CONCEPT_MIN_BOTTOM - 1e-9);
        if (a.height <= 2 * (CONCEPT_HANG_CENTER_Y - CONCEPT_MIN_BOTTOM)) expect(y).toBe(CONCEPT_HANG_CENTER_Y);
        // Under the slab, the slab's underside is the ceiling.
        const m = layout.mezzanine;
        const underSlab =
          m && !a.floorY && a.position[0] > m.rect.minX - 0.3 && a.position[0] < m.rect.maxX + 0.3 && a.position[2] > m.rect.minZ - 0.3 && a.position[2] < m.rect.maxZ + 0.3;
        const ceiling = underSlab ? m!.underside : spec.wallHeight - floorOf(a);
        expect(minCeilingFor(a.height), a.id).toBeLessThanOrEqual(ceiling);
        expect(y + a.height / 2 + FRAME_BORDER, a.id).toBeLessThan(ceiling - 0.7);
      }
    });

    it("leaves ≥ 1.5 m between neighbouring frames", () => {
      const byWall = new Map<string, typeof arts>();
      // Per wall and level: a mezzanine work hangs above the ones below it.
      const key = (a: (typeof arts)[number]) => `${wallOf(a)!.wall}|${floorOf(a)}`;
      for (const a of arts) byWall.set(key(a), [...(byWall.get(key(a)) ?? []), a]);
      for (const works of byWall.values()) {
        const s = [...works].sort((p, q) => wallOf(p)!.along - wallOf(q)!.along);
        for (let i = 1; i < s.length; i++) {
          const gap = wallOf(s[i])!.along - wallOf(s[i - 1])!.along - (widthOf(s[i]) + widthOf(s[i - 1])) / 2;
          expect(gap, `${s[i - 1].id} / ${s[i].id}`).toBeGreaterThanOrEqual(1.5);
        }
      }
    });

    it("keeps furniture off the walls, colliding and clear of every painting's stand-in-front spot", () => {
      // Walls (cut at balcony doors), open door leaves and balcony railings come first, then one box per furniture piece (on its
      // level, with a mezzanine: then the stair/columns follow on the room floor).
      const fixed =
        solidWallBoxes(layout.walls, layout.windows).length +
        doorLeafColliders(layout.windows).length +
        railingColliders(balconyGeometries(layout.windows)).length;
      const pieces = (level: number) => spec.furniture.filter((f) => (f.level ?? 0) === level).length;
      if (layout.levels) {
        layout.levels.forEach((l, i) => expect(l.colliders.length - l.walls.length, `level ${i}`).toBe(pieces(i)));
      } else {
        expect(layout.colliders).toHaveLength(fixed + spec.furniture.length);
      }
      for (const f of layout.furniture ?? []) {
        const r = Math.hypot(f.halfWidth, f.halfDepth);
        expect(Math.abs(f.x) + r).toBeLessThan(W / 2 - 0.15);
        expect(Math.abs(f.z) + r).toBeLessThan(D / 2 - 0.15);
      }
      for (const a of arts) {
        const [x, , z] = a.position;
        const [vx, vz] = [x + Math.sin(a.rotationY) * 2, z + Math.cos(a.rotationY) * 2];
        const level = a.floorY ? 1 : 0;
        const furniture = layout.levels
          ? layout.levels[level].colliders.filter((c) => !layout.levels![level].walls.some((w) => JSON.stringify(w) === JSON.stringify(c)))
          : layout.colliders.slice(fixed);
        // An open balcony door leaf mustn't stand on the spot either.
        for (const c of [...furniture, ...doorLeafColliders(layout.windows)]) {
          const blocked = vx > c.minX - PLAYER_RADIUS && vx < c.maxX + PLAYER_RADIUS && vz > c.minZ - PLAYER_RADIUS && vz < c.maxZ + PLAYER_RADIUS;
          expect(blocked, a.id).toBe(false);
        }
      }
    });

    it("has seats exactly for the sittable pieces, and spawns the visitor clear of the furniture", () => {
      expect(ex.seats).toHaveLength(spec.furniture.filter((f) => f.seating).length);
      const [x, y, z] = layout.playerStart;
      expect(y).toBe(EYE_HEIGHT);
      for (const c of layout.colliders) {
        const inside = x + PLAYER_RADIUS > c.minX && x - PLAYER_RADIUS < c.maxX && z + PLAYER_RADIUS > c.minZ && z - PLAYER_RADIUS < c.maxZ;
        expect(inside).toBe(false);
      }
    });
  });
}
