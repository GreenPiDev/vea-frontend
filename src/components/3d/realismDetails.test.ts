import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { WEAVE_TEXTURE_SIZE, buildWeaveNormalData, getCanvasWeaveNormalMap, weaveHeight } from "./canvasWeave";
import {
  ARTWORK_WALL_GAP,
  FRAME_BORDER,
  SHADOW_DROP,
  SHADOW_SPREAD,
  SHADOW_STRENGTH_FRAMED,
  SHADOW_STRENGTH_FRAMELESS,
  computeArtworkShadow,
} from "./artworkShadow";
import { ENVMAP_PHYSICAL_PARS } from "./roomAoMaterial";
import { WALL_CLEARANCE, WALL_THICKNESS } from "./galleryLayout";
import type { Artwork } from "./artworks";

describe("canvas weave", () => {
  it("heights stay within 0..1", () => {
    for (let i = 0; i < 200; i++) {
      const h = weaveHeight(Math.random(), Math.random());
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThanOrEqual(1);
    }
  });

  it("tiles seamlessly (u=0 matches u→1)", () => {
    for (const v of [0.1, 0.37, 0.8]) {
      expect(weaveHeight(1e-6, v)).toBeCloseTo(weaveHeight(1 - 1e-6, v), 3);
      expect(weaveHeight(v, 1e-6)).toBeCloseTo(weaveHeight(v, 1 - 1e-6), 3);
    }
  });

  it("encodes unit-length normals that point out of the surface", () => {
    const data = buildWeaveNormalData();
    expect(data.length).toBe(WEAVE_TEXTURE_SIZE * WEAVE_TEXTURE_SIZE * 4);
    let sumX = 0;
    for (let i = 0; i < data.length; i += 4) {
      const n = [0, 1, 2].map((c) => (data[i + c] / 255) * 2 - 1);
      expect(Math.hypot(...n)).toBeCloseTo(1, 1);
      expect(n[2]).toBeGreaterThan(0.3);
      sumX += n[0];
    }
    // A woven surface has no overall tilt.
    expect(Math.abs(sumX / (data.length / 4))).toBeLessThan(0.02);
  });

  it("shares one texture, read through uv1, as non-color data", () => {
    const t = getCanvasWeaveNormalMap();
    expect(getCanvasWeaveNormalMap()).toBe(t);
    expect(t.channel).toBe(1);
    expect(t.colorSpace).toBe(THREE.NoColorSpace);
  });
});

describe("computeArtworkShadow", () => {
  const base: Artwork = {
    id: "a",
    exhibitionId: "e",
    title: "t",
    artist: "x",
    year: "1900",
    image: "/a.jpg",
    aspect: 1.5,
    height: 1,
    position: [0, 1.6, -5 + WALL_CLEARANCE],
    rotationY: 0,
    frame: "gold",
  } as Artwork;

  it("lies on the wall face, just in front of it", () => {
    const s = computeArtworkShadow(base);
    const wallFace = -5 + WALL_THICKNESS / 2;
    expect(s.position[2]).toBeGreaterThan(wallFace);
    expect(s.position[2] - wallFace).toBeLessThan(0.005);
    expect(ARTWORK_WALL_GAP).toBeCloseTo(0.07);
  });

  it("is the frame's size plus the soft edge, dropped below the painting", () => {
    const s = computeArtworkShadow(base);
    expect(s.width).toBeCloseTo(1.5 + 2 * (FRAME_BORDER + SHADOW_SPREAD));
    expect(s.height).toBeCloseTo(1 + 2 * (FRAME_BORDER + SHADOW_SPREAD));
    expect(s.position[1]).toBeCloseTo(1.6 - SHADOW_DROP);
    expect(s.strength).toBe(SHADOW_STRENGTH_FRAMED);
  });

  it("is smaller and lighter for a frameless canvas", () => {
    const s = computeArtworkShadow({ ...base, frame: null });
    expect(s.width).toBeCloseTo(1.5 + 2 * SHADOW_SPREAD);
    expect(s.strength).toBe(SHADOW_STRENGTH_FRAMELESS);
  });

  it("follows the wall the painting faces (east wall, facing -X)", () => {
    const s = computeArtworkShadow({ ...base, position: [7 - WALL_CLEARANCE, 1.6, 2], rotationY: -Math.PI / 2 });
    const wallFace = 7 - WALL_THICKNESS / 2;
    expect(s.position[0]).toBeLessThan(wallFace);
    expect(wallFace - s.position[0]).toBeLessThan(0.005);
    expect(s.position[2]).toBeCloseTo(2);
  });
});

describe("box-projected env map chunk", () => {
  it("splices the box projection into three's IBL radiance lookup", () => {
    expect(ENVMAP_PHYSICAL_PARS).toContain("roomBoxProject( reflectVec, vRoomAoWorldPos )");
  });
});
