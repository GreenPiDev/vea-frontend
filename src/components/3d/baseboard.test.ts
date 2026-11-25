import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  BASEBOARD_CHAMFER,
  BASEBOARD_FADE_END,
  BASEBOARD_FADE_START,
  BASEBOARD_HEIGHT,
  BASEBOARD_PROTRUSION,
  BASEBOARD_SHADE,
  baseboardColor,
  buildBaseboardGeometry,
  mergeFloorRuns,
} from "./baseboard";
import { splitWallsAroundOpenings } from "./windowOpenings";
import { buildRoomLayout, type WallSegment } from "./galleryLayout";
import { applyRoomAo, createRoomAoUniforms } from "./roomAoMaterial";

const wall: WallSegment = { id: "north", position: [0, 2, -5], size: [10, 4, 0.3] };

function triangles(g: THREE.BufferGeometry) {
  const p = g.getAttribute("position");
  const n = g.getAttribute("normal");
  const out: { centroid: THREE.Vector3; normal: THREE.Vector3; geometricNormal: THREE.Vector3 }[] = [];
  for (let i = 0; i < p.count; i += 3) {
    const [a, b, c] = [0, 1, 2].map((k) => new THREE.Vector3().fromBufferAttribute(p, i + k));
    out.push({
      centroid: a.clone().add(b).add(c).divideScalar(3),
      normal: new THREE.Vector3().fromBufferAttribute(n, i),
      geometricNormal: new THREE.Vector3().crossVectors(b.clone().sub(a), c.clone().sub(a)).normalize(),
    });
  }
  return out;
}

describe("baseboard geometry", () => {
  it("is a low board standing just proud of the wall", () => {
    const g = buildBaseboardGeometry([wall]);
    g.computeBoundingBox();
    const box = g.boundingBox!;
    expect(box.min.y).toBe(0);
    expect(box.max.y).toBeCloseTo(BASEBOARD_HEIGHT, 6);
    expect(box.max.z).toBeCloseTo(-5 + 0.15 + BASEBOARD_PROTRUSION, 6);
    expect(box.min.z).toBeCloseTo(-5 - 0.15 - BASEBOARD_PROTRUSION, 6);
    expect(box.max.x).toBeCloseTo(5 + BASEBOARD_PROTRUSION, 6);
    expect(BASEBOARD_HEIGHT).toBeGreaterThanOrEqual(0.08);
    expect(BASEBOARD_HEIGHT).toBeLessThanOrEqual(0.12);
    expect(BASEBOARD_CHAMFER).toBeLessThan(BASEBOARD_PROTRUSION);
  });

  it("winds every face outward (normals point away from the wall, never into it)", () => {
    for (const t of triangles(buildBaseboardGeometry([wall]))) {
      expect(t.normal.distanceTo(t.geometricNormal)).toBeLessThan(1e-4);
      const out = t.centroid.clone().sub(new THREE.Vector3(0, t.centroid.y, -5));
      out.y = 0;
      if (t.normal.y > 0.99) continue; // top cap
      expect(t.normal.dot(out)).toBeGreaterThan(0);
      expect(t.normal.y).toBeGreaterThanOrEqual(-1e-9); // nothing faces the floor
    }
  });

  it("has a 45° chamfer on top that faces up toward the ceiling fixtures", () => {
    const chamfers = triangles(buildBaseboardGeometry([wall])).filter((t) => t.normal.y > 0.1 && t.normal.y < 0.99);
    expect(chamfers.length).toBe(8);
    for (const t of chamfers) expect(t.normal.y).toBeCloseTo(Math.SQRT1_2, 6);
  });

  it("covers every wall of a room in one geometry and skips walls that don't reach the floor", () => {
    const room = buildRoomLayout([8, 6], 3);
    const perWall = 4 * 2 * 3; // per side: front, chamfer, top-cap strip (2 triangles each)
    expect(buildBaseboardGeometry(room.walls).getAttribute("position").count).toBe(room.walls.length * perWall * 3);
    const header: WallSegment = { id: "header", position: [0, 2.6, 0], size: [1, 0.8, 0.3] };
    expect(buildBaseboardGeometry([header]).getAttribute("position").count).toBe(0);
  });
});

describe("baseboard distance fade (bright top line flicker)", () => {
  it("gives every vertex a horizontal outward direction matching its side's front face", () => {
    const g = buildBaseboardGeometry([wall]);
    const out = g.getAttribute("baseboardOutward");
    const tris = triangles(g);
    expect(out.count).toBe(g.getAttribute("position").count);
    tris.forEach((t, k) => {
      const o = new THREE.Vector3().fromBufferAttribute(out, k * 3);
      expect(o.y).toBe(0);
      expect(o.length()).toBeCloseTo(1, 6);
      // Points away from the wall like the front face of that side.
      const away = t.centroid.clone().sub(new THREE.Vector3(0, t.centroid.y, -5));
      expect(o.dot(away)).toBeGreaterThan(0);
      // Front faces: the outward direction is their own normal, so the fade is a no-op there.
      if (Math.abs(t.normal.y) < 1e-6) expect(o.distanceTo(t.normal)).toBeLessThan(1e-6);
    });
  });

  it("keeps the top cap outside the wall only, facing up", () => {
    const caps = triangles(buildBaseboardGeometry([wall])).filter((t) => t.normal.y > 0.99);
    expect(caps).toHaveLength(8);
    for (const t of caps) {
      const insideX = Math.abs(t.centroid.x) < 5 - 1e-3;
      const insideZ = Math.abs(t.centroid.z + 5) < 0.15 - 1e-3;
      expect(insideX && insideZ).toBe(false);
    }
  });

  it("fades between ~4 and ~1.5 pixels across the up-facing strip", () => {
    expect(BASEBOARD_FADE_START).toBeLessThan(BASEBOARD_FADE_END);
    expect(BASEBOARD_PROTRUSION / BASEBOARD_FADE_START).toBeCloseTo(4, 6);
    expect(BASEBOARD_PROTRUSION / BASEBOARD_FADE_END).toBeCloseTo(1.5, 6);
  });

  it("compiles the fade only into the skirting's program", () => {
    const field = { data: new Uint8Array(8), width: 2, height: 2, minX: 0, minZ: 0, sizeX: 1, sizeZ: 1 };
    const compile = (baseboard: boolean) => {
      const m = new THREE.MeshStandardMaterial();
      applyRoomAo(m, "wall", createRoomAoUniforms(field as never, 3, 0.5), undefined, undefined, { baseboard });
      const shader = {
        uniforms: {} as Record<string, { value: unknown }>,
        vertexShader: THREE.ShaderLib.physical.vertexShader,
        fragmentShader: THREE.ShaderLib.physical.fragmentShader,
      };
      m.onBeforeCompile(shader as never, null as never);
      return { defines: m.defines ?? {}, shader };
    };
    const board = compile(true);
    expect(board.defines.ROOM_BASEBOARD).toBe(1);
    expect(board.shader.vertexShader).toContain("attribute vec3 baseboardOutward");
    // Every varying the patch writes in the vertex stage and reads in the fragment stage must be declared in
    // both (a missing fragment declaration failed to compile and the skirting vanished, 2026-11-25).
    const varyings = (src: string) => new Set([...src.matchAll(/varying\s+\w+\s+(v\w+)\s*;/g)].map((m) => m[1]));
    const declaredInFragment = varyings(board.shader.fragmentShader);
    for (const name of varyings(board.shader.vertexShader)) {
      if (new RegExp(`\\b${name}\\b`).test(board.shader.fragmentShader.replace(/varying[^;]*;/g, ""))) {
        expect(declaredInFragment.has(name), name).toBe(true);
      }
    }
    expect(declaredInFragment.has("vBaseboardOutward")).toBe(true);
    expect(compile(false).defines.ROOM_BASEBOARD).toBeUndefined();
  });
});

describe("baseboard on walls cut around windows", () => {
  // 10 × 8 m room, east wall: a sill window and a balcony door (floor level).
  const room = buildRoomLayout([10, 8], 4, undefined, undefined, [
    { id: "w", wallId: "east", alongFraction: 0.3, width: 1.6, height: 2, sillHeight: 0.9, styleId: "classic" },
    { id: "b", wallId: "east", alongFraction: 0.7, width: 1.4, height: 2.6, sillHeight: 0, styleId: "balcony", balconyWidth: 2, balconyDepth: 1.5 },
  ]);
  const pieces = splitWallsAroundOpenings(room.walls, room.windows ?? []);
  const eastRuns = () => mergeFloorRuns(pieces).filter((w) => w.id.startsWith("east"));

  it("joins the piers and the piece under a sill back into one run", () => {
    // Without the merge: pier + under-sill + pier + pier = 4 floor pieces; with it, the door alone splits the wall.
    expect(pieces.filter((w) => w.id.startsWith("east") && w.position[1] - w.size[1] / 2 < 0.01).length).toBe(4);
    expect(eastRuns()).toHaveLength(2);
  });

  it("leaves no overlapping boards along the wall (the joint flicker)", () => {
    const spans = eastRuns()
      .map((w) => [w.position[2] - w.size[2] / 2, w.position[2] + w.size[2] / 2])
      .sort((a, b) => a[0] - b[0]);
    for (let i = 1; i < spans.length; i++) expect(spans[i][0]).toBeGreaterThan(spans[i - 1][1]);
  });

  it("keeps the board out of the balcony door", () => {
    const door = (room.windows ?? []).find((o) => o.balcony)!;
    const [d0, d1] = [door.center[2] - door.width / 2, door.center[2] + door.width / 2];
    for (const w of eastRuns()) {
      const [a0, a1] = [w.position[2] - w.size[2] / 2, w.position[2] + w.size[2] / 2];
      expect(a1 <= d0 + 1e-6 || a0 >= d1 - 1e-6).toBe(true);
    }
  });

  it("leaves an uncut room unchanged", () => {
    expect(mergeFloorRuns(room.walls)).toHaveLength(room.walls.length);
  });
});

describe("baseboard look", () => {
  it("is a shade darker than the wall, same hue", () => {
    const wallColor = new THREE.Color("#e4dfd5");
    const c = baseboardColor("#e4dfd5");
    expect(c.r).toBeCloseTo(wallColor.r * BASEBOARD_SHADE, 10);
    expect(c.getHSL({ h: 0, s: 0, l: 0 }).h).toBeCloseTo(wallColor.getHSL({ h: 0, s: 0, l: 0 }).h, 6);
    expect(BASEBOARD_SHADE).toBeGreaterThan(0.75);
    expect(BASEBOARD_SHADE).toBeLessThan(1);
  });

  it("compiles with the walls' room-AO patch (same lighting as the wall it sits on)", () => {
    const m = new THREE.MeshStandardMaterial({ color: baseboardColor("#e4dfd5") });
    const field = { data: new Uint8Array(8), width: 2, height: 2, minX: 0, minZ: 0, sizeX: 1, sizeZ: 1 };
    applyRoomAo(m, "wall", createRoomAoUniforms(field as never, 3, 0.5));
    const shader = {
      uniforms: {} as Record<string, { value: unknown }>,
      vertexShader: THREE.ShaderLib.physical.vertexShader,
      fragmentShader: THREE.ShaderLib.physical.fragmentShader,
    };
    m.onBeforeCompile(shader as never, null as never);
    expect(m.defines?.ROOM_AO_SURFACE).toBe(2);
    expect(shader.fragmentShader).toContain("roomAmbientOcclusion");
  });
});
