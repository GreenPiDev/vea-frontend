import * as THREE from "three";

/**
 * BoxGeometry with per-face UVs pre-scaled to the box's own size, so a
 * shared (repeat=1) texture tiles at real-world scale regardless of how
 * large the box is — used for both wall runs (galleryLayout wall lengths
 * vary) and picture frames (frame size varies per painting), letting every
 * instance share one material/texture instead of cloning a texture per mesh.
 */
export function buildTexturedBoxGeometry(
  size: [number, number, number],
  tileSize: number
): THREE.BoxGeometry {
  const [w, h, d] = size;
  const geo = new THREE.BoxGeometry(w, h, d);
  const uv = geo.attributes.uv;
  const faceScales: [number, number][] = [
    [d / tileSize, h / tileSize], // +x
    [d / tileSize, h / tileSize], // -x
    [w / tileSize, d / tileSize], // +y
    [w / tileSize, d / tileSize], // -y
    [w / tileSize, h / tileSize], // +z
    [w / tileSize, h / tileSize], // -z
  ];
  for (let face = 0; face < 6; face++) {
    const [su, sv] = faceScales[face];
    for (let v = 0; v < 4; v++) {
      const i = face * 4 + v;
      uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
    }
  }
  uv.needsUpdate = true;
  return geo;
}
