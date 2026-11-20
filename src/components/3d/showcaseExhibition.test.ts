import { describe, expect, it } from "vitest";
import { EXHIBITIONS } from "./exhibitions";
import { EYE_HEIGHT, PLAYER_RADIUS, WALL_CLEARANCE, minCeilingFor } from "./galleryLayout";
import { FRAME_BORDER } from "./artworkShadow";
import {
  SHOWCASE_ARTWORKS,
  SHOWCASE_EXHIBITION,
  SHOWCASE_FURNITURE_FOOTPRINTS,
  SHOWCASE_HANG_CENTER_Y,
  SHOWCASE_ID,
  SHOWCASE_MIN_BOTTOM,
  SHOWCASE_ROOM_SIZE,
  SHOWCASE_WALL_HEIGHT,
  showcaseHangY,
} from "./showcaseExhibition";
import { CEILING_TEXTURES, FLOOR_TEXTURES, findTexture } from "./surfaceTextures";

const [W, D] = SHOWCASE_ROOM_SIZE;
const layout = SHOWCASE_EXHIBITION.customLayout!;

/** Which wall a painting hangs on, and its centre along that wall. */
function wallOf(a: (typeof SHOWCASE_ARTWORKS)[number]) {
  const [x, , z] = a.position;
  if (Math.abs(z - (-D / 2 + WALL_CLEARANCE)) < 1e-9) return { wall: "north", along: x, length: W };
  if (Math.abs(z - (D / 2 - WALL_CLEARANCE)) < 1e-9) return { wall: "south", along: x, length: W };
  if (Math.abs(x - (W / 2 - WALL_CLEARANCE)) < 1e-9) return { wall: "east", along: z, length: D };
  if (Math.abs(x - (-W / 2 + WALL_CLEARANCE)) < 1e-9) return { wall: "west", along: z, length: D };
  return null;
}

const widthOf = (a: (typeof SHOWCASE_ARTWORKS)[number]) => a.height * a.aspect + 2 * FRAME_BORDER;

describe("showcase room", () => {
  it("is registered and opens by id (/exhibition/vitrin-1)", () => {
    expect(EXHIBITIONS.find((e) => e.id === SHOWCASE_ID)).toBe(SHOWCASE_EXHIBITION);
  });

  it("has a gallery-height ceiling (plan: 3.5–4.5 m)", () => {
    expect(SHOWCASE_WALL_HEIGHT).toBeGreaterThanOrEqual(3.5);
    expect(SHOWCASE_WALL_HEIGHT).toBeLessThanOrEqual(4.5);
    expect(layout.wallHeight).toBe(SHOWCASE_WALL_HEIGHT);
  });

  it("uses calm, low-saturation walls (no saturated red)", () => {
    const hex = SHOWCASE_EXHIBITION.theme.wallColor;
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    const saturation = Math.max(r, g, b) === 0 ? 0 : (Math.max(r, g, b) - Math.min(r, g, b)) / Math.max(r, g, b);
    expect(saturation).toBeLessThan(0.15);
    expect(SHOWCASE_EXHIBITION.theme.wallTextureId).toBeUndefined();
  });

  it("only references surface textures that exist", () => {
    expect(findTexture(FLOOR_TEXTURES, SHOWCASE_EXHIBITION.theme.floorTextureId)).not.toBeNull();
    expect(findTexture(CEILING_TEXTURES, SHOWCASE_EXHIBITION.theme.ceilingTextureId)).not.toBeNull();
  });

  it("spawns the visitor inside the room, clear of the furniture", () => {
    const [x, y, z] = layout.playerStart;
    expect(y).toBe(EYE_HEIGHT);
    for (const c of layout.colliders) {
      const inside =
        x + PLAYER_RADIUS > c.minX && x - PLAYER_RADIUS < c.maxX && z + PLAYER_RADIUS > c.minZ && z - PLAYER_RADIUS < c.maxZ;
      expect(inside).toBe(false);
    }
  });
});

describe("showcase hanging", () => {
  it("fits the 8-light picture-light pool, so every painting is lit at once", () => {
    expect(SHOWCASE_ARTWORKS.length).toBeGreaterThanOrEqual(6);
    expect(SHOWCASE_ARTWORKS.length).toBeLessThanOrEqual(8);
    expect(new Set(SHOWCASE_ARTWORKS.map((a) => a.id)).size).toBe(SHOWCASE_ARTWORKS.length);
  });

  it("hangs every work on a wall face, facing into the room", () => {
    const facing: Record<string, number> = { north: 0, south: Math.PI, east: -Math.PI / 2, west: Math.PI / 2 };
    for (const a of SHOWCASE_ARTWORKS) {
      const w = wallOf(a);
      expect(w, a.id).not.toBeNull();
      expect(a.rotationY).toBeCloseTo(facing[w!.wall], 10);
      expect(Math.abs(w!.along) + widthOf(a) / 2).toBeLessThan(w!.length / 2 - 0.8);
    }
  });

  it("puts normal-sized works on the eye-level centre line and keeps large ones off the floor", () => {
    expect(SHOWCASE_HANG_CENTER_Y).toBeGreaterThanOrEqual(1.45);
    expect(SHOWCASE_HANG_CENTER_Y).toBeLessThanOrEqual(1.55);
    for (const a of SHOWCASE_ARTWORKS) {
      const y = a.position[1];
      expect(y).toBe(showcaseHangY(a.height));
      if (a.height <= 2 * (SHOWCASE_HANG_CENTER_Y - SHOWCASE_MIN_BOTTOM)) expect(y).toBe(SHOWCASE_HANG_CENTER_Y);
      expect(y - a.height / 2).toBeGreaterThanOrEqual(SHOWCASE_MIN_BOTTOM - 1e-9);
      expect(minCeilingFor(a.height)).toBeLessThanOrEqual(SHOWCASE_WALL_HEIGHT);
      expect(y + a.height / 2 + FRAME_BORDER).toBeLessThan(SHOWCASE_WALL_HEIGHT - 0.7);
    }
  });

  it("leaves breathing room between neighbours on the same wall (≥ 1.5 m frame to frame)", () => {
    const byWall = new Map<string, typeof SHOWCASE_ARTWORKS>();
    for (const a of SHOWCASE_ARTWORKS) {
      const w = wallOf(a)!.wall;
      byWall.set(w, [...(byWall.get(w) ?? []), a]);
    }
    for (const works of byWall.values()) {
      const sorted = [...works].sort((p, q) => wallOf(p)!.along - wallOf(q)!.along);
      for (let i = 1; i < sorted.length; i++) {
        const gap = wallOf(sorted[i])!.along - wallOf(sorted[i - 1])!.along - (widthOf(sorted[i]) + widthOf(sorted[i - 1])) / 2;
        expect(gap).toBeGreaterThanOrEqual(1.5);
      }
    }
  });
});

describe("showcase furniture", () => {
  it("has a bench and a plant, nothing more", () => {
    const urls = (SHOWCASE_EXHIBITION.furniture ?? []).map((f) => f.modelUrl);
    expect(urls).toHaveLength(2);
    expect(urls.some((u) => u.includes("bank"))).toBe(true);
    expect(urls.some((u) => u.includes("bitki"))).toBe(true);
  });

  it("collides, casts contact shadows and keeps clear of the walls", () => {
    expect(layout.furniture).toEqual(SHOWCASE_FURNITURE_FOOTPRINTS);
    expect(layout.colliders).toHaveLength(4 + SHOWCASE_FURNITURE_FOOTPRINTS.length);
    for (const f of SHOWCASE_FURNITURE_FOOTPRINTS) {
      const r = Math.hypot(f.halfWidth, f.halfDepth);
      expect(Math.abs(f.x) + r).toBeLessThan(W / 2 - 0.15);
      expect(Math.abs(f.z) + r).toBeLessThan(D / 2 - 0.15);
    }
  });

  it("seats the visitor on the bench facing the main (north) wall", () => {
    expect(SHOWCASE_EXHIBITION.seats).toHaveLength(1);
    const seat = SHOWCASE_EXHIBITION.seats![0];
    // Player.tsx: camera yaw = seat.rotationY + π, yaw 0 faces −Z (north).
    const yaw = seat.rotationY + Math.PI;
    expect(Math.cos(yaw)).toBeCloseTo(1, 10);
  });

  it("doesn't block the stand-in-front spot of any painting", () => {
    for (const a of SHOWCASE_ARTWORKS) {
      const [x, , z] = a.position;
      const nx = Math.sin(a.rotationY);
      const nz = Math.cos(a.rotationY);
      const [vx, vz] = [x + nx * 2, z + nz * 2];
      for (const c of layout.colliders.slice(4)) {
        const blocked = vx > c.minX - PLAYER_RADIUS && vx < c.maxX + PLAYER_RADIUS && vz > c.minZ - PLAYER_RADIUS && vz < c.maxZ + PLAYER_RADIUS;
        expect(blocked, a.id).toBe(false);
      }
    }
  });
});
