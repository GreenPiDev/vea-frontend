/**
 * Global display scale for backend artworks hung in the 3D room: every work's on-wall size is its real
 * physical size (heightCm/widthCm) × this factor. Tuned by eye with the user (2026-11-25) — at 1:1 the
 * works read small from a normal viewing distance in large rooms. One knob for the whole collection, so the
 * relative sizes between works stay true. Applied wherever a backend work's hang size is derived (3D
 * placement, panel floor plan, default hang height) so the plan and the 3D room agree. The DB keeps the real
 * dimensions; labels and the detail card still show them.
 */
export const ARTWORK_DISPLAY_SCALE = 1.75;

/**
 * Framed works (`framed: true`): the uploaded photo already shows the frame, but the entered heightCm/widthCm
 * are the canvas only — hung at those dimensions, the canvas came out smaller than it really is. So an
 * estimated frame moulding is added on every side: FRAME_ESTIMATE_RATIO of the long side, clamped to
 * FRAME_ESTIMATE_MIN..MAX cm (25×25 → +3 cm/side, 100×100 → +8, 150×150 → +10). Display only, never saved.
 */
export const FRAME_ESTIMATE_RATIO = 0.08;
export const FRAME_ESTIMATE_MIN_CM = 3;
export const FRAME_ESTIMATE_MAX_CM = 10;

export interface ArtworkSizeInput {
  heightCm: number;
  widthCm: number;
  framed?: boolean;
}

/** Estimated frame moulding width per side (cm) for a framed work, 0 for an unframed one. */
export function estimatedFrameCm({ heightCm, widthCm, framed }: ArtworkSizeInput): number {
  if (!framed) return 0;
  const long = Math.max(heightCm, widthCm);
  return Math.min(Math.max(long * FRAME_ESTIMATE_RATIO, FRAME_ESTIMATE_MIN_CM), FRAME_ESTIMATE_MAX_CM);
}

/** On-wall size of the image: height in metres (display scale applied) and width/height aspect, frame included. */
export function artworkDisplaySize(artwork: ArtworkSizeInput): { height: number; aspect: number } {
  const frame = estimatedFrameCm(artwork);
  const h = artwork.heightCm + 2 * frame;
  const w = artwork.widthCm + 2 * frame;
  return { height: (h / 100) * ARTWORK_DISPLAY_SCALE, aspect: w / h };
}

/** On-wall height in metres of a backend artwork (frame estimate included for framed works). */
export function artworkDisplayHeight(artwork: ArtworkSizeInput): number {
  return artworkDisplaySize(artwork).height;
}

/**
 * Framed works: the share of the displayed image's width (x) and height (y) on each side that is the
 * photographed frame, from the same estimate artworkDisplaySize adds — {0, 0} for an unframed work.
 * Artwork.tsx keeps the canvas weave off that border so it doesn't show on the frame.
 */
export function frameBorderFraction(artwork: ArtworkSizeInput): { x: number; y: number } {
  const frame = estimatedFrameCm(artwork);
  if (!frame) return { x: 0, y: 0 };
  return { x: frame / (artwork.widthCm + 2 * frame), y: frame / (artwork.heightCm + 2 * frame) };
}
