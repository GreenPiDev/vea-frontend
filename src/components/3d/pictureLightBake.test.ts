import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { buildTexturedBoxGeometry } from "./textureUv";
import { DAYLIGHT_GUTTER, MAX_ATLAS_SIZE, faceAxes } from "./daylightBake";
import { pictureLightIntensity, pictureLightPlacement } from "./pictureLight";
import {
  MAX_OBJECT_PICTURE_LIGHTS,
  addPictureLightUv,
  buildPictureLightAtlas,
  lampsReaching,
  localBoxToWorld,
  rectTexelWorld,
} from "./pictureLightBake";
import { SHOWCASE_ARTWORKS, SHOWCASE_EXHIBITION } from "./showcaseExhibition";
import { ARTWORK_WALL_GAP } from "./artworkShadow";
import type { Artwork } from "./artworks";

const layout = SHOWCASE_EXHIBITION.customLayout!;
const walls = layout.walls;
const lights = SHOWCASE_ARTWORKS.map((a) => pictureLightPlacement(a, layout.wallHeight));
const atlas = buildPictureLightAtlas(walls, lights)!;

/** World point of a face of a wall piece at face fraction (fu, fv). */
function facePoint(piece: number, face: number, fu: number, fv: number): THREE.Vector3 {
  const w = walls[piece];
  const k = Math.floor(face / 2);
  const sign = face % 2 === 0 ? 1 : -1;
  const [ua, va] = faceAxes(face);
  const p = new THREE.Vector3(...w.position);
  p.setComponent(k, w.position[k] + (sign * w.size[k]) / 2);
  p.setComponent(ua, w.position[ua] + (fu - 0.5) * w.size[ua]);
  p.setComponent(va, w.position[va] + (fv - 0.5) * w.size[va]);
  return p;
}

describe("picture-light atlas", () => {
  it("packs every rect (with its gutter) and the black texel inside the atlas, without overlaps", () => {
    const g = DAYLIGHT_GUTTER;
    expect(atlas.width).toBeLessThanOrEqual(MAX_ATLAS_SIZE);
    expect(atlas.height).toBeLessThanOrEqual(MAX_ATLAS_SIZE);
    const boxes = [...atlas.rects, { ...atlas.dark, w: 1, h: 1 }].map((r) => [r.x - g, r.y - g, r.x + r.w + g, r.y + r.h + g]);
    for (const [x0, y0, x1, y1] of boxes) {
      expect(x0).toBeGreaterThanOrEqual(0);
      expect(y0).toBeGreaterThanOrEqual(0);
      expect(x1).toBeLessThanOrEqual(atlas.width);
      expect(y1).toBeLessThanOrEqual(atlas.height);
    }
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const [a, b] = [boxes[i], boxes[j]];
        expect(a[2] <= b[0] || b[2] <= a[0] || a[3] <= b[1] || b[3] <= a[1]).toBe(true);
      }
    }
  });

  it("is small: only the lit part of the walls, not whole walls", () => {
    const wallArea = walls.reduce((s, w) => s + 2 * (w.size[0] * w.size[1] + w.size[2] * w.size[1]), 0);
    const bakedArea = atlas.rects.reduce((s, r) => s + r.uAxis.length() * r.vAxis.length(), 0);
    expect(bakedArea).toBeLessThan(wallArea * 0.25);
    expect(atlas.width * atlas.height * 8).toBeLessThan(2 * 1024 * 1024); // HalfFloat RGBA < 2 MB
  });

  it("covers every wall point a lamp reaches, on a rect that lists that lamp", () => {
    let checked = 0;
    walls.forEach((_, piece) => {
      for (let face = 0; face < 6; face++) {
        const rect = atlas.rects.find((r) => r.piece === piece && r.face === face);
        for (let fu = 0.005; fu < 1; fu += 0.01) {
          for (let fv = 0.01; fv < 1; fv += 0.02) {
            const p = facePoint(piece, face, fu, fv);
            lights.forEach((light, i) => {
              if (pictureLightIntensity(p, light) <= 0) return;
              // A lamp behind the face lights nothing there (N·L < 0).
              const k = Math.floor(face / 2);
              const sign = face % 2 === 0 ? 1 : -1;
              if (sign * (light.position.getComponent(k) - p.getComponent(k)) <= 0) return;
              checked++;
              expect(rect).toBeDefined();
              expect(rect!.lights).toContain(i);
              expect(fu).toBeGreaterThanOrEqual(rect!.span[0] - 1e-9);
              expect(fu).toBeLessThanOrEqual(rect!.span[2] + 1e-9);
              expect(fv).toBeGreaterThanOrEqual(rect!.span[1] - 1e-9);
              expect(fv).toBeLessThanOrEqual(rect!.span[3] + 1e-9);
            });
          }
        }
      }
    });
    expect(checked).toBeGreaterThan(500);
  });

  it("maps a wall vertex to the texel that bakes that same world point", () => {
    for (const rect of atlas.rects) {
      const wall = walls[rect.piece];
      const geometry = buildTexturedBoxGeometry(wall.size, 1);
      addPictureLightUv(geometry, atlas, rect.piece, wall.size);
      const uv = geometry.attributes.pictureLightUv;
      const pos = geometry.attributes.position;
      const nrm = geometry.attributes.normal;
      const [fx, fy, fz] = [Math.floor(rect.face / 2) === 0, Math.floor(rect.face / 2) === 1, Math.floor(rect.face / 2) === 2];
      const sign = rect.face % 2 === 0 ? 1 : -1;
      for (let i = 0; i < pos.count; i++) {
        const onFace = (fx && nrm.getX(i) === sign) || (fy && nrm.getY(i) === sign) || (fz && nrm.getZ(i) === sign);
        if (!onFace) continue;
        const world = new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i)).add(new THREE.Vector3(...wall.position));
        const baked = rectTexelWorld(rect, uv.getX(i) * atlas.width - rect.x, uv.getY(i) * atlas.height - rect.y);
        expect(baked.distanceTo(world)).toBeLessThan(1e-4);
      }
      geometry.dispose();
    }
  });

  it("sends unlit faces to the black texel and clamps lit ones to their own rect + gutter", () => {
    const g = DAYLIGHT_GUTTER;
    walls.forEach((wall, piece) => {
      const geometry = buildTexturedBoxGeometry(wall.size, 1);
      addPictureLightUv(geometry, atlas, piece, wall.size);
      const clamp = geometry.attributes.pictureLightUvClamp;
      const nrm = geometry.attributes.normal;
      for (let i = 0; i < clamp.count; i++) {
        const n = [nrm.getX(i), nrm.getY(i), nrm.getZ(i)];
        const k = n.findIndex((v) => Math.abs(v) > 0.5);
        const face = k * 2 + (n[k] > 0 ? 0 : 1);
        const rect = atlas.rects.find((r) => r.piece === piece && r.face === face);
        const box = [clamp.getX(i) * atlas.width, clamp.getY(i) * atlas.height, clamp.getZ(i) * atlas.width, clamp.getW(i) * atlas.height];
        if (!rect) {
          expect(box).toEqual([atlas.dark.x + 0.5, atlas.dark.y + 0.5, atlas.dark.x + 0.5, atlas.dark.y + 0.5].map((v) => expect.closeTo(v, 3)));
        } else {
          expect(box[0]).toBeCloseTo(rect.x - g + 0.5, 3);
          expect(box[3]).toBeCloseTo(rect.y + rect.h + g - 0.5, 3);
        }
      }
      geometry.dispose();
    });
  });

  it("is null in a room without paintings", () => {
    expect(buildPictureLightAtlas(walls, [])).toBeNull();
  });
});

describe("lamps reaching a painting or label", () => {
  const at = (x: number, y = 1.6): Artwork =>
    ({ id: `a${x}`, exhibitionId: "t", frame: null, aspect: 1, height: 1, position: [x, y, ARTWORK_WALL_GAP], rotationY: 0 }) as unknown as Artwork;
  const box = (a: Artwork) => localBoxToWorld(a.position, a.rotationY, [-0.55, -0.55, -ARTWORK_WALL_GAP], [0.55, 0.55, 0.01]);

  it("always includes the painting's own lamp first, and never a far one", () => {
    const art = [at(0), at(6), at(-6)];
    const ls = art.map((a) => pictureLightPlacement(a, 4));
    expect(lampsReaching(box(art[1]), ls, 1)).toEqual([1]);
  });

  it("adds a neighbour whose wash spills onto it, up to the cap", () => {
    // Frames 0.3 m apart: each one's wash (SPILL 0.3 m) reaches the next.
    const art = [at(0), at(1.3), at(-1.3)];
    const ls = art.map((a) => pictureLightPlacement(a, 4));
    const reached = lampsReaching(box(art[0]), ls, 0);
    expect(reached[0]).toBe(0);
    expect(reached.length).toBe(MAX_OBJECT_PICTURE_LIGHTS);
  });
});
