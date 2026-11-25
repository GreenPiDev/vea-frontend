import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { fillStaticInstances, writeInstanceMatrix } from "./instanceMatrices";

function decompose(array: ArrayLike<number>, offset: number) {
  const m = new THREE.Matrix4().fromArray(Array.from(array).slice(offset, offset + 16));
  const p = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  m.decompose(p, q, s);
  return { p, q, s };
}

describe("writeInstanceMatrix", () => {
  it("writes position, Y rotation and uniform scale (the furniture case)", () => {
    const out = new Float32Array(16);
    writeInstanceMatrix({ position: [1, 2, 3], rotationY: Math.PI / 2, scale: 1.5 }, out, 0);
    const { p, q, s } = decompose(out, 0);
    expect(p.toArray()).toEqual([1, 2, 3]);
    expect(s.x).toBeCloseTo(1.5);
    expect(s.y).toBeCloseTo(1.5);
    // +X local axis turned 90° about Y points to −Z.
    const x = new THREE.Vector3(1, 0, 0).applyQuaternion(q);
    expect(x.x).toBeCloseTo(0);
    expect(x.z).toBeCloseTo(-1);
  });

  it("prefers the quaternion over rotationY and keeps a per-axis scale (the lamp bar case)", () => {
    const quaternion = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);
    const out = new Float32Array(32);
    writeInstanceMatrix({ position: [0, 0, 0], quaternion, rotationY: 1, scale: [1, 0.8, 1] }, out, 16);
    const { q, s } = decompose(out, 16);
    expect(q.angleTo(quaternion)).toBeCloseTo(0);
    expect(s.toArray().map((v) => +v.toFixed(5))).toEqual([1, 0.8, 1]);
    // The first slot is untouched.
    expect(Array.from(out.slice(0, 16)).every((v) => v === 0)).toBe(true);
  });

  it("defaults to identity rotation and unit scale", () => {
    const out = new Float32Array(16);
    writeInstanceMatrix({ position: [4, 5, 6] }, out, 0);
    expect(Array.from(out)).toEqual(new THREE.Matrix4().makeTranslation(4, 5, 6).toArray());
  });
});

describe("fillStaticInstances", () => {
  it("writes every matrix once, flags the upload and fits the culling sphere to the placed copies", () => {
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial(), 2);
    const version = mesh.instanceMatrix.version;
    fillStaticInstances(mesh, [{ position: [10, 0, 0] }, { position: [-10, 0, 0] }]);
    expect(mesh.count).toBe(2);
    expect(mesh.instanceMatrix.version).toBeGreaterThan(version);
    // Computed from identity matrices it would be a ~0.87 m sphere at the origin and cull both copies.
    expect(mesh.boundingSphere!.radius).toBeGreaterThan(10);
  });
});
