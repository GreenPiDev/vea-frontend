import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { pendingTextures } from "./pendingTextures";

function loaded(): THREE.Texture {
  const t = new THREE.Texture();
  t.needsUpdate = true; // what a loader does once the image has arrived (version 1)
  return t;
}

describe("pendingTextures", () => {
  it("finds every not-yet-uploaded texture once, across meshes and multi-material meshes", () => {
    const photo = loaded();
    const normal = loaded();
    const rough = loaded();
    const shared = new THREE.MeshStandardMaterial({ map: photo, normalMap: normal });
    const scene = new THREE.Scene();
    scene.add(new THREE.Mesh(new THREE.PlaneGeometry(), shared));
    scene.add(new THREE.Mesh(new THREE.PlaneGeometry(), shared));
    scene.add(new THREE.Mesh(new THREE.BoxGeometry(), [new THREE.MeshStandardMaterial({ roughnessMap: rough }), shared]));
    expect(new Set(pendingTextures(scene, () => undefined))).toEqual(new Set([photo, normal, rough]));
  });

  it("skips textures already on the GPU, images not loaded yet and render targets", () => {
    const uploaded = loaded();
    const empty = new THREE.Texture(); // version 0 — nothing to upload yet
    const target = new THREE.WebGLRenderTarget(4, 4);
    target.texture.needsUpdate = true;
    const changed = loaded();
    const scene = new THREE.Scene();
    scene.add(new THREE.Mesh(new THREE.PlaneGeometry(), new THREE.MeshStandardMaterial({ map: uploaded, normalMap: empty })));
    scene.add(new THREE.Mesh(new THREE.PlaneGeometry(), new THREE.MeshBasicMaterial({ map: target.texture })));
    scene.add(new THREE.Mesh(new THREE.PlaneGeometry(), new THREE.MeshBasicMaterial({ map: changed })));
    changed.needsUpdate = true; // re-drawn after its first upload (version 2, GPU has 1)
    const onGpu = new Map<THREE.Texture, number>([
      [uploaded, uploaded.version],
      [changed, 1],
    ]);
    expect(pendingTextures(scene, (t) => onGpu.get(t))).toEqual([changed]);
  });
});
