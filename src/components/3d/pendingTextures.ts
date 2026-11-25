import * as THREE from "three";

/**
 * Image textures a scene's materials use that the GPU hasn't received yet (or whose image changed since) —
 * what three would otherwise upload lazily, mid-walk, the first time an object using them enters the view.
 * `uploadedVersion` reports the version already on the GPU (undefined: never uploaded).
 *
 * Only material properties are scanned (map, normalMap, roughnessMap, …): the textures hidden in custom
 * shader uniforms here are small data textures or render targets, never the big photos.
 */
export function pendingTextures(
  scene: THREE.Object3D,
  uploadedVersion: (texture: THREE.Texture) => number | undefined
): THREE.Texture[] {
  const found = new Set<THREE.Texture>();
  const visitMaterial = (material: THREE.Material) => {
    for (const value of Object.values(material)) {
      const texture = value as THREE.Texture | null;
      if (!texture?.isTexture || found.has(texture)) continue;
      // version 0: no image yet (or a render target, which three allocates itself).
      if ((texture as THREE.Texture & { isRenderTargetTexture?: boolean }).isRenderTargetTexture || texture.version === 0) continue;
      if (uploadedVersion(texture) === texture.version) continue;
      found.add(texture);
    }
  };
  scene.traverse((object) => {
    const material = (object as THREE.Mesh).material;
    if (!material) return;
    if (Array.isArray(material)) material.forEach(visitMaterial);
    else visitMaterial(material);
  });
  return [...found];
}
