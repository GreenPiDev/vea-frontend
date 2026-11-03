// Soft shadow each hung painting casts onto its wall (see ArtworkWallShadows.tsx for the rendering).
//
// The scene has no real shadow maps (GalleryLights.tsx explains why), so without this a painting reads as
// a picture pasted onto the wall rather than an object hanging in front of it. The shadow is a quad on
// the wall face, slightly larger than the frame and dropped a little downward — the picture light sits
// above and in front of the painting, so its shadow falls mostly below and to the sides, barely above.

import type { Artwork as ArtworkData } from "./artworks";
import { WALL_CLEARANCE, WALL_THICKNESS } from "./galleryLayout";

export const FRAME_BORDER = 0.07;
export const FRAME_DEPTH = 0.05;

/** Width of the shadow's soft edge beyond the painting's silhouette (m). */
export const SHADOW_SPREAD = 0.06;
/** How far the shadow is shifted down from the painting (m) — light comes from above the frame. */
export const SHADOW_DROP = 0.035;
/** Peak darkening (0..1) — a frame stands off the wall and blocks more light than a bare canvas. */
export const SHADOW_STRENGTH_FRAMED = 0.5;
export const SHADOW_STRENGTH_FRAMELESS = 0.38;
/** Lift off the wall face against z-fighting. */
const WALL_OFFSET = 0.002;

/** Gap between a painting's origin and its wall's face, in the painting's local -Z direction. */
export const ARTWORK_WALL_GAP = WALL_CLEARANCE - WALL_THICKNESS / 2;

export interface ArtworkShadowTransform {
  position: [number, number, number];
  rotationY: number;
  /** Full quad size: the silhouette plus SHADOW_SPREAD on every side. */
  width: number;
  height: number;
  strength: number;
}

export function computeArtworkShadow(data: ArtworkData): ArtworkShadowTransform {
  const border = data.frame ? FRAME_BORDER : 0;
  const width = data.height * data.aspect + 2 * (border + SHADOW_SPREAD);
  const height = data.height + 2 * (border + SHADOW_SPREAD);
  // Local -Z (toward the wall) rotated into world space: rotationY maps local +Z to (sin, 0, cos).
  const back = -(ARTWORK_WALL_GAP - WALL_OFFSET);
  const sin = Math.sin(data.rotationY);
  const cos = Math.cos(data.rotationY);
  return {
    position: [
      data.position[0] + sin * back,
      data.position[1] - SHADOW_DROP,
      data.position[2] + cos * back,
    ],
    rotationY: data.rotationY,
    width,
    height,
    strength: data.frame ? SHADOW_STRENGTH_FRAMED : SHADOW_STRENGTH_FRAMELESS,
  };
}
