import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';

export interface LoadedGltf {
  scene: THREE.Group;
  /** World-space bounding box of the whole loaded scene, at its own authored scale (1x) — the caller measures nativeWidth/nativeDepth from this before any curator-set `scale` is ever applied. */
  box: THREE.Box3;
}

// Mirrors drei's useGLTF, which configures a DRACOLoader automatically —
// that's why already-placed furniture renders fine (FurnitureInstances.tsx
// uses useGLTF) while this raw GLTFLoader (used only to measure a
// just-picked file before upload) needs its own, otherwise any
// KHR_draco_mesh_compression model throws instead of parsing. Same
// Google-hosted decoder version drei/three-stdlib's useGLTF uses
// (node_modules/@react-three/drei/core/Gltf.js) — no reason to diverge.
const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.5/');

const loader = new GLTFLoader();
loader.setDRACOLoader(dracoLoader);

/**
 * Parses a user-picked .glb File entirely client-side (no upload needed yet
 * — FurnitureEditor.tsx's "+ Model Yükle" flow needs the real bounding box
 * *before* deciding to upload anything) and measures its bounding box.
 * Shared by FurnitureEditor.tsx (nativeWidth/nativeDepth for the create
 * payload) and captureModelThumbnail.ts (camera framing) — both consume the
 * same parsed scene so the file is only parsed once per upload.
 */
export function loadGltfFromFile(file: File): Promise<LoadedGltf> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const buffer = reader.result as ArrayBuffer;
      loader.parse(
        buffer,
        '',
        (gltf) => {
          resolve({ scene: gltf.scene, box: measureLocalBoundingBox(gltf.scene) });
        },
        (error) => reject(error)
      );
    };
    reader.onerror = () => reject(reader.error ?? new Error('Dosya okunamadı'));
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Unions each mesh's own *local* geometry bounding box (ignoring node
 * transforms entirely) instead of `Box3.setFromObject(scene)` (which
 * transforms by each node's accumulated matrixWorld). Deliberate, not an
 * oversight: these generated furniture models are authored with every
 * sub-part already sitting in the same origin-centered space (see each
 * node's `extras: {pivot: "floor centre (Y=0)", ...}` convention — no node
 * actually carries a translation/rotation/scale), AND three's own
 * GLTFLoader (examples/jsm, used here — unlike the scene's drei/
 * three-stdlib useGLTF, which doesn't have this behavior) has a
 * pivot-container reconstruction heuristic that fires whenever
 * `userData.pivot` is set and the node has children: it tries
 * `node.position.x -= pivot[0]` assuming `pivot` is a numeric array from
 * GLTFExporter. Here `pivot` is this unrelated descriptive *string*, so
 * `pivot[0]` is a character, the subtraction yields NaN, and it corrupts
 * that node's (and every descendant's) matrixWorld — while leaving the
 * geometry itself completely untouched. Measuring from local geometry boxes
 * sidesteps that corruption rather than depending on every future model
 * never reusing the word "pivot" in its extras.
 */
function measureLocalBoundingBox(scene: THREE.Object3D): THREE.Box3 {
  const box = new THREE.Box3();
  scene.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.geometry.computeBoundingBox();
      if (child.geometry.boundingBox) box.union(child.geometry.boundingBox);
    }
  });
  return box;
}
