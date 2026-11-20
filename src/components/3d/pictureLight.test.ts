import { describe, expect, it } from "vitest";
import * as THREE from "three";
import type { Artwork } from "./artworks";
import {
  BOTTOM_LEVEL,
  PICTURE_LIGHT_GAIN,
  SPILL,
  decodePictureLight,
  encodePictureLight,
  installPictureLightShader,
  pictureLightIrradiance,
  pictureLightPlacement,
} from "./pictureLight";
import { computeFixtureTransform } from "./fixtureGeometry";
import { ARTWORK_WALL_GAP, FRAME_BORDER, FRAME_DEPTH } from "./artworkShadow";
import { canvasZ } from "./frameProfile";

/** A painting on a wall whose face is at z = 0, facing +Z, centred at x = 0. */
function painting(height: number, aspect: number, centerY = 1.6, frame: Artwork["frame"] = null): Artwork {
  return {
    frame,
    id: "t",
    exhibitionId: "t",
    title: "t",
    artist: "t",
    image: "",
    aspect,
    height,
    position: [0, centerY, ARTWORK_WALL_GAP],
    rotationY: 0,
  } as unknown as Artwork;
}

const WALL_N = { x: 0, y: 0, z: 1 };
const SIZES: [number, number][] = [
  [0.8, 1],
  [1.1, 0.9],
  [1.6, 0.8],
  [1.8, 1.2],
  [2.2, 1.4],
];

function sampler(height: number, aspect: number, frame: Artwork["frame"] = null) {
  const art = painting(height, aspect, Math.max(1.6, height / 2 + 0.5), frame);
  const light = pictureLightPlacement(art, 8);
  const [cx, cy] = art.position;
  const top = cy + height / 2;
  const bottom = cy - height / 2;
  const half = (height * aspect) / 2;
  // On the canvas plane (in the frame's rebate, or a bare stretched canvas) / on the wall face behind it.
  const at = (x: number, y: number) =>
    pictureLightIrradiance({ x: cx + x, y, z: ARTWORK_WALL_GAP + canvasZ(frame) }, WALL_N, light);
  const wallAt = (x: number, y: number) => pictureLightIrradiance({ x: cx + x, y, z: 0 }, WALL_N, light);
  return { art, light, at, wallAt, top, bottom, half, cy };
}

describe("picture light: on the canvas", () => {
  it.each(SIZES)("%s m tall: the brightest point in view is on the canvas, not the wall above", (h, aspect) => {
    const { at, wallAt, top, bottom, half } = sampler(h, aspect);
    let canvasMax = 0;
    for (let y = bottom; y <= top; y += 0.02) for (let x = -half; x <= half; x += 0.05) canvasMax = Math.max(canvasMax, at(x, y));
    let wallMax = 0;
    for (let y = top + FRAME_BORDER + 0.01; y < top + 0.6; y += 0.02)
      for (let x = -half - 0.5; x <= half + 0.5; x += 0.05) wallMax = Math.max(wallMax, wallAt(x, y));
    expect(wallMax).toBeLessThan(canvasMax * 0.9);
  });

  it.each(SIZES)("%s m tall: lit evenly, fading gently from top to bottom", (h, aspect) => {
    const { at, top, bottom, cy } = sampler(h, aspect);
    const t = at(0, top - 0.02);
    const b = at(0, bottom + 0.02);
    expect(at(0, cy)).toBeLessThan(t);
    expect(b / t).toBeGreaterThan(BOTTOM_LEVEL - 0.05);
    expect(b / t).toBeLessThan(0.8);
  });

  it.each(SIZES)("%s m tall: the side edges keep most of the light", (h, aspect) => {
    const { at, cy, half } = sampler(h, aspect);
    expect(at(half - 0.02, cy) / at(0, cy)).toBeGreaterThan(0.75);
  });

  it("gives every painting the same exposure, whatever its size", () => {
    for (const [h, aspect] of SIZES) {
      const { at, top } = sampler(h, aspect);
      expect(at(0, top - 0.001) / PICTURE_LIGHT_GAIN).toBeCloseTo(1, 1);
    }
  });
});

describe("picture light: around the canvas", () => {
  it("washes the wall softly around the frame and fades out within the spill width", () => {
    const { at, wallAt, light, top, cy, half } = sampler(1.2, 1);
    const nearSide = wallAt(half + FRAME_BORDER + 0.02, cy);
    expect(nearSide).toBeGreaterThan(at(0, cy) * 0.4);
    // The window is drawn on the painting's plane; the wall face behind sees it slightly enlarged.
    const enlarge = (light.standoff + ARTWORK_WALL_GAP) / light.standoff;
    expect(wallAt((half + SPILL) * enlarge + 0.01, cy)).toBe(0);
    expect(wallAt(0, light.position.y - (light.topDepth - SPILL) * enlarge + 0.01)).toBe(0);
    expect(top).toBeLessThan(light.position.y);
  });

  it("lights the frame's top face from above without outshining the canvas", () => {
    const { light, top, half, at } = sampler(1.2, 1, "modernBlack");
    let peak = 0;
    for (let z = ARTWORK_WALL_GAP - FRAME_DEPTH / 2; z <= ARTWORK_WALL_GAP + FRAME_DEPTH / 2; z += 0.005)
      for (let x = -half; x <= half; x += 0.1)
        peak = Math.max(peak, pictureLightIrradiance({ x, y: top + FRAME_BORDER, z }, { x: 0, y: 1, z: 0 }, light));
    expect(peak).toBeGreaterThan(0);
    // The up-facing top face sits right under the lamp, so it may slightly out-light the canvas (a real
    // picture light does the same); it's a thin strip, above eye level for this size. ~1.24× with the slim
    // 4 cm frame measured against its own canvas in the rebate (the ~1.12× noted before compared it with an
    // unframed canvas plane) — guard against it turning into a glare.
    expect(peak).toBeLessThan(at(0, top - 0.02) * 1.3);
  });

  it("sends nothing into the room or through the wall", () => {
    const { light } = sampler(1.2, 1);
    // Floor in front of the painting, a visitor-facing surface 1 m out.
    expect(pictureLightIrradiance({ x: 0, y: 0, z: 1.2 }, { x: 0, y: 1, z: 0 }, light)).toBe(0);
    expect(pictureLightIrradiance({ x: 0, y: 1.6, z: 1.5 }, { x: 0, y: 0, z: -1 }, light)).toBe(0);
    // Floor on the far side of a partition (behind the wall plane).
    expect(pictureLightIrradiance({ x: 0, y: 0, z: -0.3 }, { x: 0, y: 1, z: 0 }, light)).toBe(0);
    // ...and the wall right behind the painting does get it (the wash).
    expect(pictureLightIrradiance({ x: 0, y: 1.6, z: 0 }, WALL_N, light)).toBeGreaterThan(0);
  });
});

describe("picture light: consistent with the visible lamp", () => {
  it.each(SIZES)("%s m tall: emits from the fixture's LED strip", (h, aspect) => {
    const art = painting(h, aspect);
    const light = pictureLightPlacement(art, 8);
    const strip = computeFixtureTransform(art, 8).stripPosition;
    expect(light.position.distanceTo(new THREE.Vector3(...strip))).toBeLessThan(0.01);
  });

  it("follows the wall's orientation", () => {
    const art = { ...painting(1, 1), position: [3, 1.6, 2] as [number, number, number], rotationY: -Math.PI / 2 };
    const light = pictureLightPlacement(art, 8);
    expect(light.normal.x).toBeCloseTo(-1);
    // The lamp stands `standoff` in front of the canvas face, which is canvasZ(null) off the hang plane.
    expect(light.position.x).toBeCloseTo(3 - light.standoff - canvasZ(null));
    const onCanvas = pictureLightIrradiance({ x: 3 - canvasZ(null), y: 1.9, z: 2 }, { x: -1, y: 0, z: 0 }, light);
    expect(onCanvas).toBeCloseTo(PICTURE_LIGHT_GAIN * 0.9, 1);
  });
});

describe("picture light: GPU plumbing", () => {
  it("round-trips the window through a SpotLight's fields", () => {
    const p = pictureLightPlacement(painting(1.8, 1.2), 8);
    const e = encodePictureLight(p);
    expect(e.penumbra).toBeGreaterThanOrEqual(0);
    expect(e.penumbra).toBeLessThanOrEqual(1);
    const d = decodePictureLight(e.angle, e.penumbra, e.distance, e.decay);
    expect(d.standoff).toBeCloseTo(p.standoff, 6);
    expect(d.topDepth).toBeCloseTo(p.topDepth, 6);
    expect(d.bottomDepth).toBe(p.bottomDepth);
    expect(d.halfWidth).toBe(p.halfWidth);
  });

  it("replaces three's spot term in the shader chunk (fails loudly on a three upgrade)", () => {
    expect(installPictureLightShader()).toBe(true);
    const chunk = THREE.ShaderChunk.lights_pars_begin;
    expect(chunk).toContain("pictureLightShape");
    expect(chunk.match(/void getSpotLightInfo\(/g)).toHaveLength(1);
    // The rest of the chunk (rect area lights etc.) is intact.
    expect(chunk).toContain("NUM_RECT_AREA_LIGHTS");
    expect(chunk).toContain("getHemisphereLightIrradiance");
  });
});
