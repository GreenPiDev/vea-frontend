import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export interface LoadedGltf {
  scene: THREE.Group;
  /** World-space bounding box of the whole loaded scene, at its own authored scale (1x) — the caller measures nativeWidth/nativeDepth from this before any curator-set `scale` is ever applied. */
  box: THREE.Box3;
}

const loader = new GLTFLoader();

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
          const box = new THREE.Box3().setFromObject(gltf.scene);
          resolve({ scene: gltf.scene, box });
        },
        (error) => reject(error)
      );
    };
    reader.onerror = () => reject(reader.error ?? new Error('Dosya okunamadı'));
    reader.readAsArrayBuffer(file);
  });
}
