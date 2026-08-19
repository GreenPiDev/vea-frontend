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
}

export const FRAME_TEXTURES: Record<"gold" | "walnut", FrameTextureData> = {
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
};
