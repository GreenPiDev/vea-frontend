import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  NORMAL_SCALE_LINE,
  SPEC_AA_DECLARE,
  SPEC_AA_MAX_KERNEL,
  SPEC_AA_MIN_NORMAL,
  SPEC_AA_NORMAL_MAP,
  SPEC_AA_ROUGHNESS,
  filteredRoughness,
  normalDetailFade,
  screenSpaceKernel,
  toksvigVariance,
} from "./specularAa";
import { applyRoomAo, createRoomAoUniforms } from "./roomAoMaterial";
import { FLOOR_TEXTURES } from "./surfaceTextures";

describe("Toksvig variance", () => {
  it("is zero for a full-length normal (base mip, nothing filtered away) and JPEG-level shortening", () => {
    expect(toksvigVariance(1, 2.4)).toBe(0);
    expect(toksvigVariance(0.985, 1)).toBe(0);
    expect(toksvigVariance(1.02, 1)).toBe(0);
  });

  it("grows as mip filtering shortens the averaged normal, and with normalScale²", () => {
    expect(toksvigVariance(0.8, 1)).toBeGreaterThan(toksvigVariance(0.9, 1));
    expect(toksvigVariance(0.8, 2)).toBeCloseTo(4 * toksvigVariance(0.8, 1), 10);
  });
});

describe("normal-detail fade", () => {
  it("keeps the full normal map up close and eases it out once a pixel covers many texels", () => {
    expect(normalDetailFade(0.5)).toBe(1);
    expect(normalDetailFade(1.5)).toBe(1);
    expect(normalDetailFade(6)).toBeCloseTo(SPEC_AA_MIN_NORMAL, 10);
    expect(normalDetailFade(40)).toBeCloseTo(SPEC_AA_MIN_NORMAL, 10);
    let prev = 1;
    for (let t = 1; t < 8; t += 0.25) {
      const v = normalDetailFade(t);
      expect(v).toBeLessThanOrEqual(prev + 1e-12);
      prev = v;
    }
  });

  it("never removes the detail entirely (the floor still reads as a material far away)", () => {
    expect(SPEC_AA_MIN_NORMAL).toBeGreaterThanOrEqual(0.3);
  });
});

describe("screen-space kernel and filtered roughness", () => {
  it("is zero on a flat, unperturbed surface and clamped on wildly varying normals", () => {
    expect(screenSpaceKernel(0, 0)).toBe(0);
    expect(screenSpaceKernel(10, 10)).toBe(SPEC_AA_MAX_KERNEL);
  });

  it("never makes a surface glossier, and leaves rough surfaces practically unchanged", () => {
    for (const r of [0.05, 0.2, 0.5, 0.9]) {
      expect(filteredRoughness(r, 0)).toBeCloseTo(r, 10);
      expect(filteredRoughness(r, 0.05)).toBeGreaterThan(r);
    }
    expect(filteredRoughness(0.9, SPEC_AA_MAX_KERNEL) - 0.9).toBeLessThan(0.07);
    expect(filteredRoughness(1, 1)).toBe(1);
  });

  it("softens a polished floor's reflection under a strong kernel, but keeps it glossy", () => {
    const polished = filteredRoughness(0.15, SPEC_AA_MAX_KERNEL);
    expect(polished).toBeGreaterThan(0.5);
    expect(polished).toBeLessThan(0.7);
  });
});

describe("specular AA shader patch", () => {
  function compiled(normalScale: [number, number]) {
    const m = new THREE.MeshStandardMaterial({ normalScale: new THREE.Vector2(...normalScale) });
    const field = { data: new Uint8Array(8), width: 2, height: 2, minX: 0, minZ: 0, sizeX: 1, sizeZ: 1 };
    applyRoomAo(m, "floor", createRoomAoUniforms(field as never, 3, 0.5));
    const shader = {
      uniforms: {} as Record<string, { value: unknown }>,
      vertexShader: THREE.ShaderLib.physical.vertexShader,
      fragmentShader: THREE.ShaderLib.physical.fragmentShader,
    };
    m.onBeforeCompile(shader as never, null as never);
    return shader.fragmentShader;
  }

  it("finds its anchors in three's chunks (fails if a three upgrade moves them)", () => {
    expect(THREE.ShaderChunk.normal_fragment_maps).toContain(NORMAL_SCALE_LINE);
    expect(THREE.ShaderLib.physical.fragmentShader).toContain("#include <normal_fragment_begin>");
    expect(THREE.ShaderLib.physical.fragmentShader).toContain("#include <normal_fragment_maps>");
    expect(THREE.ShaderLib.physical.fragmentShader).toContain("#include <lights_physical_fragment>");
  });

  it("declares the accumulator before the normal map, replaces the scale line and filters the roughness after", () => {
    const s = compiled([1.3, 1.3]);
    const decl = s.indexOf(SPEC_AA_DECLARE.trim());
    const map = s.indexOf(SPEC_AA_NORMAL_MAP.trim());
    const rough = s.indexOf(SPEC_AA_ROUGHNESS.trim());
    expect(decl).toBeGreaterThan(-1);
    expect(map).toBeGreaterThan(decl);
    expect(rough).toBeGreaterThan(map);
    expect(s.indexOf("#include <lights_physical_fragment>")).toBeLessThan(rough);
    expect(s).not.toContain(NORMAL_SCALE_LINE);
    expect(s).not.toContain("#include <normal_fragment_maps>");
  });

  it("doesn't depend on the texture's normalScale (switching floors never recompiles)", () => {
    expect(compiled([0.8, 0.8])).toBe(compiled([2.4, 2.4]));
  });

  it("covers every glossy floor preset (all go through the room-AO patch with a normal map)", () => {
    expect(FLOOR_TEXTURES.every((t) => t.normalMap.endsWith("normal.jpg"))).toBe(true);
  });
});
