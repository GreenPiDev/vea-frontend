// Real photo-scanned PBR materials (CC0, ambientCG.com) for picture frames —
// same diffuse+roughness(+metalness) approach as surfaceTextures.ts, applied
// to the frame box instead of a flat metalness/roughness color.

export interface FrameTextureData {
  map: string;
  roughnessMap: string;
  metalnessMap?: string;
  /** World meters per texture tile on the frame's outer face/edge. */
  tileSize: number;
  /** Base material factors; multiplied with the maps (metalnessMap absent -> this is the flat value). */
  metalness: number;
  roughness: number;
  /** Multiplies the color map — lets one photo-scanned material be re-tinted (e.g. Metal048A darkened to
   * near-black for "modernBlack") instead of needing a separate texture set per color. Defaults to white
   * (no tint) when omitted. */
  color?: string;
}

export const FRAME_TEXTURES: Record<"gold" | "walnut" | "modernBlack", FrameTextureData> = {
  gold: {
    map: "/textures/Metal048A/color.jpg",
    roughnessMap: "/textures/Metal048A/roughness.jpg",
    metalnessMap: "/textures/Metal048A/metalness.jpg",
    tileSize: 0.6,
    metalness: 1,
    roughness: 1,
  },
  walnut: {
    map: "/textures/Wood051/color.jpg",
    roughnessMap: "/textures/Wood051/roughness.jpg",
    tileSize: 0.6,
    metalness: 0.05,
    roughness: 1,
  },
  // Default frame for a backend artwork whose artist marked their uploaded image as unframed (see
  // artworks.ts's `frame` doc comment). Reuses the same brushed-metal scan as "gold" — already loaded for
  // any gold-framed painting in the room, so this adds no extra texture fetch in the common case — but
  // tinted near-black and tiled finer, with metalness turned down, for a matte anodized-aluminum look
  // instead of a flat solid color.
  modernBlack: {
    map: "/textures/Metal048A/color.jpg",
    roughnessMap: "/textures/Metal048A/roughness.jpg",
    tileSize: 0.22,
    metalness: 0.35,
    roughness: 0.9,
    color: "#2a2a2a",
  },
};
