import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { applyPictureLight } from "./pictureLightMaterial";
import type { PictureLightPlacement } from "./pictureLight";
import {
  LABEL_BORDER,
  LABEL_BORDER_COLOR,
  LABEL_INK,
  LABEL_INK_MUTED,
  LABEL_PAPER,
  LABEL_PX_PER_M,
  LABEL_TEXTURE_WIDTH,
  LABEL_THICKNESS,
  LABEL_TYPE,
  LABEL_WIDTH,
  labelFont,
  type LabelLayout,
} from "./wallLabelLayout";

function drawLabelTexture(layout: LabelLayout): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = LABEL_TEXTURE_WIDTH;
  canvas.height = layout.textureHeight;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = LABEL_PAPER;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // Thin black frame on the face; the board edges sample the corner texel, so they read black too.
    const b = Math.max(2, Math.round(LABEL_BORDER * LABEL_PX_PER_M));
    ctx.fillStyle = LABEL_BORDER_COLOR;
    ctx.fillRect(0, 0, canvas.width, b);
    ctx.fillRect(0, canvas.height - b, canvas.width, b);
    ctx.fillRect(0, 0, b, canvas.height);
    ctx.fillRect(canvas.width - b, 0, b, canvas.height);
    ctx.textBaseline = "alphabetic";
    for (const line of layout.lines) {
      for (const run of line.runs) {
        ctx.font = labelFont(run.style);
        ctx.fillStyle = LABEL_TYPE[run.style].muted ? LABEL_INK_MUTED : LABEL_INK;
        ctx.fillText(run.text, run.x, line.baseline);
      }
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

/**
 * The printed face (uv 0..1) plus four edges; the edges sample a corner texel (the black border), so the whole
 * board is one mesh, one material, one draw call. No back face (it's against the wall).
 */
function buildBoardGeometry(width: number, height: number): THREE.BufferGeometry {
  const hw = width / 2;
  const hh = height / 2;
  const t = LABEL_THICKNESS;
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const paper = [0.004, 0.996];
  const quad = (corners: number[][], normal: number[], uv?: number[][]) => {
    for (const i of [0, 1, 2, 0, 2, 3]) {
      positions.push(...corners[i]);
      normals.push(...normal);
      uvs.push(...(uv ? uv[i] : paper));
    }
  };
  quad([[-hw, -hh, t], [hw, -hh, t], [hw, hh, t], [-hw, hh, t]], [0, 0, 1], [[0, 0], [1, 0], [1, 1], [0, 1]]);
  quad([[-hw, hh, t], [hw, hh, t], [hw, hh, 0], [-hw, hh, 0]], [0, 1, 0]);
  quad([[-hw, -hh, 0], [hw, -hh, 0], [hw, -hh, t], [-hw, -hh, t]], [0, -1, 0]);
  quad([[hw, -hh, t], [hw, -hh, 0], [hw, hh, 0], [hw, hh, t]], [1, 0, 0]);
  quad([[-hw, -hh, 0], [-hw, -hh, t], [-hw, hh, t], [-hw, hh, 0]], [-1, 0, 0]);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  return g;
}

/**
 * A printed museum label on a thin board, its back flat on the wall (`position` is its back centre in the
 * painting's local frame). Matte paper, lit like the wall: picture-light spill, room fill and the ceiling
 * fixtures (pictureLightMaterial.ts, `ceiling: true`) — so the ink darkens with the room instead of glowing.
 */
export default function WallLabel({
  layout,
  position,
  lights,
}: {
  layout: LabelLayout;
  position: [number, number, number];
  /** Picture lamps whose wash reaches the label (Artwork.tsx, lampsReaching). */
  lights: PictureLightPlacement[];
}) {
  const texture = useMemo(() => drawLabelTexture(layout), [layout]);
  const geometry = useMemo(() => buildBoardGeometry(LABEL_WIDTH, layout.height), [layout.height]);
  const material = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.85, metalness: 0 });
    applyPictureLight(m, lights, { ceiling: true });
    return m;
  }, [texture, lights]);
  useEffect(() => () => texture.dispose(), [texture]);
  useEffect(() => () => material.dispose(), [material]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <mesh position={position} geometry={geometry} material={material} raycast={() => null} />;
}
