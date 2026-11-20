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

/** Outline band around a rectangle hung on `artwork`'s wall: centre (cx, cy) and half size, painting-local. */
function applyRectOutline(mesh: THREE.Mesh, artwork: ArtworkData, cx: number, cy: number, halfW: number, halfH: number): void {
  mesh.visible = true;
  const innerX = halfW + OUTLINE_GAP;
  const innerY = halfH + OUTLINE_GAP;
  const outerX = innerX + OUTLINE_WIDTH;
  const outerY = innerY + OUTLINE_WIDTH;
  outlineMaterial.uniforms.uInnerHalf.value.set(innerX, innerY);
  outlineMaterial.uniforms.uOuterHalf.value.set(outerX, outerY);
  // On the wall face, just in front of it (same plane idea as the wall shadows).
  const back = -(ARTWORK_WALL_GAP - 0.004);
  const s = Math.sin(artwork.rotationY);
  const c = Math.cos(artwork.rotationY);
  const [px, py, pz] = artwork.position;
  // Painting-local right axis = (cos, 0, -sin).
  mesh.position.set(px + s * back + c * cx, py + cy, pz + c * back - s * cx);
  mesh.rotation.set(0, artwork.rotationY, 0);
  mesh.scale.set(outerX * 2, outerY * 2, 1);
}

/** Show `mesh` as the outline of `artwork`, or hide it for null. */
export function applyArtworkOutline(mesh: THREE.Mesh, artwork: ArtworkData | null): void {
  if (!artwork) {
    mesh.visible = false;
    return;
  }
  const border = artwork.frame ? FRAME_BORDER : 0;
  applyRectOutline(mesh, artwork, 0, 0, (artwork.height * artwork.aspect) / 2 + border, artwork.height / 2 + border);
}

/** Show `mesh` as the outline of `artwork`'s wall label (wallLabelLayout.ts's labelRect). */
export function applyLabelOutline(mesh: THREE.Mesh, artwork: ArtworkData, rect: { x: number; y: number; halfW: number; halfH: number }): void {
  applyRectOutline(mesh, artwork, rect.x, rect.y, rect.halfW, rect.halfH);
}

/** Outline whatever wall target is hovered (painting or label), or hide it for null. */
export function applyWallTargetOutline(
  mesh: THREE.Mesh,
  target: { kind: "artwork" | "label"; artwork: ArtworkData } | null,
  labelRects: Map<string, { x: number; y: number; halfW: number; halfH: number }>
): void {
  const rect = target?.kind === "label" ? labelRects.get(target.artwork.id) : undefined;
  if (target && rect) applyLabelOutline(mesh, target.artwork, rect);
  else applyArtworkOutline(mesh, target?.artwork ?? null);
}
