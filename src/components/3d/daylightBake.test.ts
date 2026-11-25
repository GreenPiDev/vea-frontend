import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { buildRoomLayout } from "./galleryLayout";
import { splitWallsAroundOpenings } from "./windowOpenings";
import { buildTexturedBoxGeometry } from "./textureUv";
import {
  DAYLIGHT_GUTTER,
  DAYLIGHT_TEXEL,
  MAX_ATLAS_SIZE,
  addDaylightUv,
  buildBakeGeometry,
  buildDaylightAtlas,
  daylightRevision,
  rectUv,
  type AtlasRect,
  type DaylightAtlas,
} from "./daylightBake";
import { setWindowLights } from "./windowLight";
import { setSunLight } from "./sunLight";
import { writeSunOccluderUniforms } from "./sunOccluders";
import { CONCEPT_EXHIBITIONS } from "./__fixtures__/demoRooms";

const ex = CONCEPT_EXHIBITIONS.find((e) => e.id === "vitrin-8")!;
const layout = ex.customLayout!;
const pieces = splitWallsAroundOpenings(layout.walls, layout.windows!);
const atlas = buildDaylightAtlas(pieces, layout.room, layout.wallHeight);
const all = (a: DaylightAtlas): AtlasRect[] => [a.floor, a.ceiling, ...a.faces];

describe("daylight atlas", () => {
  it("packs every rect (with its gutter) inside the atlas, without overlaps", () => {
    const g = DAYLIGHT_GUTTER;
    const rects = all(atlas);
    expect(atlas.width).toBeLessThanOrEqual(MAX_ATLAS_SIZE);
    expect(atlas.height).toBeLessThanOrEqual(MAX_ATLAS_SIZE);
    for (const r of rects) {
      expect(r.x - g).toBeGreaterThanOrEqual(0);
      expect(r.y - g).toBeGreaterThanOrEqual(0);
      expect(r.x + r.w + g).toBeLessThanOrEqual(atlas.width);
      expect(r.y + r.h + g).toBeLessThanOrEqual(atlas.height);
    }
    for (let i = 0; i < rects.length; i++)
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i];
        const b = rects[j];
        const apart = a.x + a.w + g <= b.x - g || b.x + b.w + g <= a.x - g || a.y + a.h + g <= b.y - g || b.y + b.h + g <= a.y - g;
        expect(apart, `${i}/${j}`).toBe(true);
      }
  });

  it("gives the floor the fine texel and covers the room footprint", () => {
    expect(atlas.floor.w).toBe(Math.ceil(layout.room.size[0] / DAYLIGHT_TEXEL));
    expect(atlas.bounds).toEqual([layout.room.center[0] - 8, layout.room.center[1] - 5, 16, 10]);
    expect(atlas.ceiling.w).toBeLessThan(atlas.floor.w);
    expect(atlas.floor.normal.y).toBe(1);
    expect(atlas.ceiling.normal.y).toBe(-1);
  });

  it("skips hidden wall tops/bottoms but keeps window sills and heads", () => {
    const sillPiece = pieces.findIndex((p) => p.position[1] - p.size[1] / 2 <= 1e-4 && p.position[1] + p.size[1] / 2 < layout.wallHeight - 0.5);
    expect(sillPiece).toBeGreaterThanOrEqual(0);
    const faces = atlas.faces.filter((f) => f.piece === sillPiece).map((f) => f.face);
    expect(faces).toContain(2); // the sill's top
    expect(faces).not.toContain(3); // its bottom on the floor
    const full = pieces.findIndex((p) => p.size[1] >= layout.wallHeight - 1e-4);
    const fullFaces = atlas.faces.filter((f) => f.piece === full).map((f) => f.face);
    expect(fullFaces).not.toContain(2);
    expect(fullFaces).not.toContain(3);
  });

  it("skips the perimeter walls' outer faces", () => {
    const i = pieces.findIndex((p) => p.id === "north");
    const faces = atlas.faces.filter((f) => f.piece === i).map((f) => f.face);
    expect(faces).toContain(4); // room side (+z)
    expect(faces).not.toContain(5); // outside (−z)
  });

  it("grows the texel for a huge room so it still fits", () => {
    const big = buildRoomLayout([120, 90], 12);
    const a = buildDaylightAtlas(big.walls, big.room, big.wallHeight);
    expect(a.width).toBeLessThanOrEqual(MAX_ATLAS_SIZE);
    expect(a.height).toBeLessThanOrEqual(MAX_ATLAS_SIZE);
    expect(120 / a.floor.w).toBeGreaterThan(DAYLIGHT_TEXEL);
  });
});

describe("wall daylight UVs", () => {
  it("map each vertex of a wall box onto its face's rect, at the matching corner", () => {
    const i = pieces.findIndex((p) => p.id === "north");
    const piece = pieces[i];
    const geo = buildTexturedBoxGeometry(piece.size, 2);
    addDaylightUv(geo, atlas, i, piece.size);
    const uv = geo.attributes.daylightUv;
    const pos = geo.attributes.position;
    const nrm = geo.attributes.normal;
    // The north wall's room-side face looks +z (face 4).
    const rect = atlas.faces.find((f) => f.piece === i && f.face === 4)!;
    const [u0, v0, du, dv] = rectUv(atlas, rect);
    let checked = 0;
    for (let k = 0; k < pos.count; k++) {
      if (nrm.getZ(k) < 0.5) continue;
      const world = new THREE.Vector3(pos.getX(k), pos.getY(k), pos.getZ(k)).add(new THREE.Vector3(...piece.position));
      const fu = (uv.getX(k) - u0) / du;
      const fv = (uv.getY(k) - v0) / dv;
      const expected = rect.origin.clone().addScaledVector(rect.uAxis, fu).addScaledVector(rect.vAxis, fv);
      expect(world.distanceTo(expected)).toBeLessThan(1e-5);
      checked++;
    }
    expect(checked).toBe(4);
  });
});

describe("bake geometry", () => {
  it("puts one guttered quad per rect in clip space, inner corners at the face's world corners", () => {
    const geo = buildBakeGeometry(atlas);
    const rects = all(atlas);
    expect(geo.attributes.position.count).toBe(rects.length * 4);
    const pos = geo.attributes.position;
    const world = geo.attributes.worldPos;
    for (let k = 0; k < pos.count; k++) {
      expect(Math.abs(pos.getX(k))).toBeLessThanOrEqual(1 + 1e-6);
      expect(Math.abs(pos.getY(k))).toBeLessThanOrEqual(1 + 1e-6);
    }
    // Floor quad, corner 0: gutter extrapolated beyond the room's min corner.
    const g = DAYLIGHT_GUTTER;
    const r = atlas.floor;
    expect(world.getX(0)).toBeCloseTo(r.origin.x - (g / r.w) * r.uAxis.x, 6);
    expect(world.getZ(0)).toBeCloseTo(r.origin.z - (g / r.h) * r.vAxis.z, 6);
    // Clip x of that corner lands on the gutter's pixel edge.
    expect(pos.getX(0)).toBeCloseTo(((r.x - g) / atlas.width) * 2 - 1, 9);
  });
});

describe("re-bake trigger", () => {
  it("bumps the revision on every daylight uniform write", () => {
    const r0 = daylightRevision();
    setWindowLights([]);
    setSunLight({ direction: null, color: [0, 0, 0], windows: [] });
    writeSunOccluderUniforms([]);
    expect(daylightRevision()).toBeGreaterThanOrEqual(r0 + 3);
  });
});
