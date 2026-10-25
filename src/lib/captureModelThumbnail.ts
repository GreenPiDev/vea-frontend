import * as THREE from 'three';

const THUMBNAIL_SIZE = 320;

/**
 * Renders one framed snapshot of an already-loaded GLTF scene (see
 * loadGltfBoundingBox.ts) into a detached, never-DOM-attached canvas, for
 * FurnitureEditor.tsx's "+ Model Yükle" flow to upload as the catalog
 * row's thumbnail — no server-side headless rendering needed, the curator's
 * own browser (already running the real @react-three/fiber scene) can do
 * this directly. A fresh throwaway WebGLRenderer is created and disposed
 * per call rather than reusing the app's main R3F canvas, since this runs
 * outside the Canvas's render loop and only needs a single frame.
 */
export function captureModelThumbnail(scene: THREE.Object3D, box: THREE.Box3): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = THUMBNAIL_SIZE;
  canvas.height = THUMBNAIL_SIZE;

  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, preserveDrawingBuffer: true, antialias: true });
  renderer.setSize(THUMBNAIL_SIZE, THUMBNAIL_SIZE);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const captureScene = new THREE.Scene();
  captureScene.add(new THREE.AmbientLight('#ffffff', 1.2));
  const key = new THREE.DirectionalLight('#ffffff', 2.2);
  key.position.set(1, 1.5, 1);
  captureScene.add(key);
  captureScene.add(scene);

  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const radius = Math.max(size.x, size.y, size.z, 0.1);

  const camera = new THREE.PerspectiveCamera(40, 1, 0.01, radius * 10);
  camera.position.set(center.x + radius * 1.1, center.y + radius * 0.9, center.z + radius * 1.4);
  camera.lookAt(center);

  renderer.render(captureScene, camera);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      // Detach the scene before disposing the throwaway renderer/context —
      // we don't own `scene`'s lifetime (the caller still needs it to
      // measure the bounding box / show a live preview).
      captureScene.remove(scene);
      renderer.dispose();
      renderer.forceContextLoss();
      if (blob) resolve(blob);
      else reject(new Error('Thumbnail oluşturulamadı'));
    }, 'image/png');
  });
}
