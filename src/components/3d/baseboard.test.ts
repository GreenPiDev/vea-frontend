import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  BASEBOARD_CHAMFER,
  BASEBOARD_HEIGHT,
  BASEBOARD_PROTRUSION,
  BASEBOARD_SHADE,
  baseboardColor,
  buildBaseboardGeometry,
} from "./baseboard";
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
    const perWall = 4 * 2 * 2 + 2; // 4 sides + 4 chamfers (2 triangles each) + top cap
    expect(buildBaseboardGeometry(room.walls).getAttribute("position").count).toBe(room.walls.length * perWall * 3);
    const header: WallSegment = { id: "header", position: [0, 2.6, 0], size: [1, 0.8, 0.3] };
    expect(buildBaseboardGeometry([header]).getAttribute("position").count).toBe(0);
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
