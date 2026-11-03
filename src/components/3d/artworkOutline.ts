// Warm-yellow hover outline around a painting, shared by both navigation modes (ClickNavigation.tsx: the
// painting under the mouse; WalkArtworkPicker.tsx: the painting at the screen centre). A thin band just
// outside the frame, drawn on the wall face — outside the frame's silhouette, so the frame never hides it.
// One quad sized per painting via uniforms. Only one outline is ever visible at a time (the two modes
// are exclusive), so a single shared material is enough.

import * as THREE from "three";
import type { Artwork as ArtworkData } from "./artworks";
import { ARTWORK_WALL_GAP, FRAME_BORDER } from "./artworkShadow";

export const OUTLINE_GAP = 0.012;
export const OUTLINE_WIDTH = 0.022;
export const outlineMaterial = new THREE.ShaderMaterial({
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform vec2 uOuterHalf;
    uniform vec2 uInnerHalf;
    varying vec2 vUv;
    void main() {
      vec2 p = abs((vUv - 0.5) * 2.0 * uOuterHalf);
      vec2 d = p - uInnerHalf;
      float edge = max(d.x, d.y);
      float aa = fwidth(edge);
      float band = smoothstep(-aa, aa, edge);
      gl_FragColor = vec4(1.0, 0.78, 0.22, band * 0.95);
    }
  `,
  uniforms: { uOuterHalf: { value: new THREE.Vector2(1, 1) }, uInnerHalf: { value: new THREE.Vector2(0.9, 0.9) } },
  transparent: true,
  depthWrite: false,
  polygonOffset: true,
  polygonOffsetFactor: -2,
  polygonOffsetUnits: -2,
});
export const outlineGeometry = new THREE.PlaneGeometry(1, 1);

/** Show `mesh` as the outline of `artwork`, or hide it for null. */
export function applyArtworkOutline(mesh: THREE.Mesh, artwork: ArtworkData | null): void {
  mesh.visible = artwork !== null;
  if (!artwork) return;
  const border = artwork.frame ? FRAME_BORDER : 0;
  const innerX = (artwork.height * artwork.aspect) / 2 + border + OUTLINE_GAP;
  const innerY = artwork.height / 2 + border + OUTLINE_GAP;
  const outerX = innerX + OUTLINE_WIDTH;
  const outerY = innerY + OUTLINE_WIDTH;
  outlineMaterial.uniforms.uInnerHalf.value.set(innerX, innerY);
  outlineMaterial.uniforms.uOuterHalf.value.set(outerX, outerY);
  // On the wall face, just in front of it (same plane idea as the wall shadows).
  const back = -(ARTWORK_WALL_GAP - 0.004);
  const [px, py, pz] = artwork.position;
  mesh.position.set(px + Math.sin(artwork.rotationY) * back, py, pz + Math.cos(artwork.rotationY) * back);
  mesh.rotation.set(0, artwork.rotationY, 0);
  mesh.scale.set(outerX * 2, outerY * 2, 1);
}
