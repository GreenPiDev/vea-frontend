import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  CEILING_MACRO_VARIATION,
  MACRO_VARIATION_ALBEDO,
  MACRO_VARIATION_DECL,
  MACRO_VARIATION_ROUGHNESS,
  hash12,
  macroAlbedoFactor,
  macroCoord,
  macroNoise,
  macroRoughnessNoise,
  valueNoise,
} from "./macroVariation";
import { CEILING_TEXTURES, FLOOR_TEXTURES, WALL_TEXTURES } from "./surfaceTextures";
import { applyRoomAo, createRoomAoUniforms } from "./roomAoMaterial";

/** Samples over a 120 × 120 m area on a 0.4 m grid (enough noise cells for stable statistics). */
function samples(fn: (u: number, v: number) => number) {
  const out: number[] = [];
  for (let u = -60; u < 60; u += 0.4) for (let v = -60; v < 60; v += 0.4) out.push(fn(u, v));
  return out;
}

function correlation(a: number[], b: number[]) {
  const mean = (x: number[]) => x.reduce((s, v) => s + v, 0) / x.length;
  const ma = mean(a);
  const mb = mean(b);
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < a.length; i++) {
    num += (a[i] - ma) * (b[i] - mb);
    da += (a[i] - ma) ** 2;
    db += (b[i] - mb) ** 2;
  }
  return num / Math.sqrt(da * db);
}

describe("macro noise", () => {
  it("hash and value noise stay in [0, 1], including far from the origin", () => {
    for (const [x, y] of [[0, 0], [17, -3], [1234, 5678], [-9999, 31]]) {
      expect(hash12(x, y)).toBeGreaterThanOrEqual(0);
      expect(hash12(x, y)).toBeLessThan(1);
      expect(valueNoise(x + 0.3, y + 0.7)).toBeGreaterThanOrEqual(0);
      expect(valueNoise(x + 0.3, y + 0.7)).toBeLessThanOrEqual(1);
    }
  });

  it("is centred on zero, so the average exposure doesn't move", () => {
    const s = samples(macroNoise);
    const mean = s.reduce((a, v) => a + v, 0) / s.length;
    expect(Math.abs(mean)).toBeLessThan(0.08);
    expect(Math.max(...s)).toBeLessThanOrEqual(1);
    expect(Math.min(...s)).toBeGreaterThanOrEqual(-1);
    // ...and actually varies (not a near-constant).
    const sd = Math.sqrt(s.reduce((a, v) => a + (v - mean) ** 2, 0) / s.length);
    expect(sd).toBeGreaterThan(0.15);
  });

  it("is low-frequency: smooth over a few centimetres, no visible grain of its own", () => {
    let maxStep = 0;
    for (let u = -10; u < 10; u += 0.05) maxStep = Math.max(maxStep, Math.abs(macroNoise(u + 0.05, 1.7) - macroNoise(u, 1.7)));
    expect(maxStep).toBeLessThan(0.1);
  });

  it.each([1.5, 2, 2.5, 3])("gives neighbouring copies of a %s m tile a different tone", (tile) => {
    const a = samples(macroNoise);
    const b = samples((u, v) => macroNoise(u + tile, v));
    const rms = Math.sqrt(a.reduce((s, v, i) => s + (v - b[i]) ** 2, 0) / a.length);
    expect(rms).toBeGreaterThan(0.15);
  });

  it.each([1.5, 2, 2.5, 3])("has no lattice of its own: tile copies a few metres apart are unrelated (%s m tile)", (tile) => {
    const a = samples(macroNoise);
    for (let k = Math.ceil(5 / tile); k * tile < 15; k++) {
      expect(Math.abs(correlation(a, samples((u, v) => macroNoise(u + k * tile, v))))).toBeLessThan(0.25);
    }
  });

  it("drives roughness with a decorrelated field", () => {
    expect(Math.abs(correlation(samples(macroNoise), samples(macroRoughnessNoise)))).toBeLessThan(0.2);
  });

  it("keeps the albedo change within ± the amplitude", () => {
    // Min/max once instead of an `expect` per sample (thousands of calls timed out under load).
    const s = samples((u, w) => macroAlbedoFactor(u, w, 0.12));
    let lo = Infinity;
    let hi = -Infinity;
    for (const v of s) {
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    expect(lo).toBeGreaterThanOrEqual(0.88 - 1e-9);
    expect(hi).toBeLessThanOrEqual(1.12 + 1e-9);
  });
});

describe("macro coordinates", () => {
  it("walls meeting at a corner agree on the shared edge (no seam in inside corners)", () => {
    // Wall A runs along x at z = 4; wall B along z at x = 6; they meet at (6, y, 4).
    for (const y of [0.3, 1.6, 2.9]) {
      const [ua, va] = macroCoord("wall", 6, y, 4);
      const [ub, vb] = macroCoord("wall", 6, y, 4);
      expect(macroNoise(ua, va)).toBe(macroNoise(ub, vb));
      // Approaching the corner from either wall converges to the same value.
      const a = macroCoord("wall", 6 - 1e-4, y, 4);
      const b = macroCoord("wall", 6, y, 4 - 1e-4);
      expect(Math.abs(macroNoise(...a) - macroNoise(...b))).toBeLessThan(1e-3);
    }
  });

  it("varies along and up a wall, and across the floor", () => {
    expect(macroCoord("wall", 1, 2, 3)).toEqual([4, 2]);
    expect(macroCoord("floor", 1, 0, 3)).toEqual([1, 3]);
    expect(macroCoord("ceiling", 1, 4, 3)).toEqual([1, 3]);
  });
});

describe("macro variation presets", () => {
  it("is strongest on the scans whose repetition shows most", () => {
    const brick = WALL_TEXTURES.find((t) => t.id === "Bricks097")!;
    const paving = FLOOR_TEXTURES.find((t) => t.id === "PavingStones142")!;
    for (const t of [...FLOOR_TEXTURES, ...WALL_TEXTURES]) {
      expect(t.macroVariation).toBeGreaterThanOrEqual(0.05);
      expect(t.macroVariation).toBeLessThanOrEqual(brick.macroVariation);
    }
    expect(paving.macroVariation).toBe(brick.macroVariation);
    expect(brick.macroVariation).toBeLessThanOrEqual(0.12);
  });

  it("keeps the ceiling calmer than any wall or floor", () => {
    for (const t of [...FLOOR_TEXTURES, ...WALL_TEXTURES]) expect(CEILING_MACRO_VARIATION).toBeLessThan(t.macroVariation);
    expect(CEILING_TEXTURES.length).toBeGreaterThan(0);
  });
});

describe("macro variation shader patch", () => {
  function compiled(surface: "floor" | "ceiling" | "wall", amplitude?: number) {
    const m = new THREE.MeshStandardMaterial();
    const field = { data: new Uint8Array(8), width: 2, height: 2, minX: 0, minZ: 0, sizeX: 1, sizeZ: 1 };
    applyRoomAo(m, surface, createRoomAoUniforms(field as never, 3, 0.5), amplitude);
    const shader = {
      uniforms: {} as Record<string, { value: unknown }>,
      vertexShader: THREE.ShaderLib.physical.vertexShader,
      fragmentShader: THREE.ShaderLib.physical.fragmentShader,
    };
    m.onBeforeCompile(shader as never, null as never);
    return shader;
  }

  it("hooks into the albedo and roughness slots of three's standard shader", () => {
    const s = compiled("wall", 0.12);
    expect(s.fragmentShader).toContain(MACRO_VARIATION_DECL.trim().split("\n")[0]);
    expect(s.fragmentShader).toContain(MACRO_VARIATION_ALBEDO.trim());
    expect(s.fragmentShader).toContain(MACRO_VARIATION_ROUGHNESS.trim().split("\n")[0]);
    expect(s.uniforms.uMacroVariation.value).toBe(0.12);
  });

  it("is a per-material uniform (switching textures never recompiles)", () => {
    expect(compiled("floor", 0.08).fragmentShader).toBe(compiled("floor", 0.12).fragmentShader);
    expect(compiled("ceiling").uniforms.uMacroVariation.value).toBe(CEILING_MACRO_VARIATION);
  });
});
