import { describe, expect, it } from "vitest";
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
  it("are vitrin-2 … vitrin-5, registered once each next to vitrin-1", () => {
    expect(CONCEPT_ROOM_SPECS.map((s) => s.id)).toEqual(["vitrin-2", "vitrin-3", "vitrin-4", "vitrin-5"]);
    expect(SHOWCASE_ID).toBe("vitrin-1");
    const ids = EXHIBITIONS.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const e of CONCEPT_EXHIBITIONS) expect(EXHIBITIONS.find((x) => x.id === e.id)).toBe(e);
  });

  it("differ from each other in floor, wall and ceiling look", () => {
    const keys = CONCEPT_ROOM_SPECS.map((s) => [s.theme.floorTextureId, s.theme.wallTextureId, s.theme.ceilingTextureId, s.theme.wallColor].join("|"));
    expect(new Set(keys).size).toBe(keys.length);
    expect(new Set(CONCEPT_ROOM_SPECS.map((s) => s.theme.floorTextureId)).size).toBe(CONCEPT_ROOM_SPECS.length);
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
        const y = a.position[1];
        expect(y).toBe(conceptHangY(a.height));
        expect(y - a.height / 2).toBeGreaterThanOrEqual(CONCEPT_MIN_BOTTOM - 1e-9);
        if (a.height <= 2 * (CONCEPT_HANG_CENTER_Y - CONCEPT_MIN_BOTTOM)) expect(y).toBe(CONCEPT_HANG_CENTER_Y);
        expect(minCeilingFor(a.height), a.id).toBeLessThanOrEqual(spec.wallHeight);
        expect(y + a.height / 2 + FRAME_BORDER, a.id).toBeLessThan(spec.wallHeight - 0.7);
      }
    });

    it("leaves ≥ 1.5 m between neighbouring frames", () => {
      const byWall = new Map<string, typeof arts>();
      for (const a of arts) byWall.set(wallOf(a)!.wall, [...(byWall.get(wallOf(a)!.wall) ?? []), a]);
      for (const works of byWall.values()) {
        const s = [...works].sort((p, q) => wallOf(p)!.along - wallOf(q)!.along);
        for (let i = 1; i < s.length; i++) {
          const gap = wallOf(s[i])!.along - wallOf(s[i - 1])!.along - (widthOf(s[i]) + widthOf(s[i - 1])) / 2;
          expect(gap, `${s[i - 1].id} / ${s[i].id}`).toBeGreaterThanOrEqual(1.5);
        }
      }
    });

    it("keeps furniture off the walls, colliding and clear of every painting's stand-in-front spot", () => {
      expect(layout.colliders).toHaveLength(4 + spec.furniture.length);
      for (const f of layout.furniture ?? []) {
        const r = Math.hypot(f.halfWidth, f.halfDepth);
        expect(Math.abs(f.x) + r).toBeLessThan(W / 2 - 0.15);
        expect(Math.abs(f.z) + r).toBeLessThan(D / 2 - 0.15);
      }
      for (const a of arts) {
        const [x, , z] = a.position;
        const [vx, vz] = [x + Math.sin(a.rotationY) * 2, z + Math.cos(a.rotationY) * 2];
        for (const c of layout.colliders.slice(4)) {
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
