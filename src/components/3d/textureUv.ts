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

/**
 * BoxGeometry whose UVs come from world coordinates (u/v = world metres / tileSize, projected along each
 * face's axis) — for the pieces a wall is cut into around a window: neighbouring pieces then continue the
 * same texture across the cut instead of each restarting at 0, so the scan doesn't jump at the opening.
 */
export function buildWorldUvBoxGeometry(
  size: [number, number, number],
  center: [number, number, number],
  tileSize: number
): THREE.BoxGeometry {
  const geo = new THREE.BoxGeometry(...size);
  const pos = geo.attributes.position;
  const nrm = geo.attributes.normal;
  const uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) + center[0];
    const y = pos.getY(i) + center[1];
    const z = pos.getZ(i) + center[2];
    const nx = Math.abs(nrm.getX(i));
    const ny = Math.abs(nrm.getY(i));
    if (nx > 0.5) uv.setXY(i, z / tileSize, y / tileSize);
    else if (ny > 0.5) uv.setXY(i, x / tileSize, z / tileSize);
    else uv.setXY(i, x / tileSize, y / tileSize);
  }
  uv.needsUpdate = true;
  return geo;
}
