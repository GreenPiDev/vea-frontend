// Curated, license-clear (CC0, ambientCG.com) PBR texture presets a custom
// exhibition can pick for its walls/floor/ceiling instead of a flat color.
// Only diffuse + roughness maps are used (no normal maps) — keeps the
// fragment shader cheap so surface realism doesn't cost FPS.

export interface SurfaceTexture {
  id: string;
  label: string;
  /** Small preview shown in the builder's texture picker. */
  thumbnail: string;
  map: string;
  roughnessMap: string;
  /** World meters per texture tile — controls repeat so the pattern reads at real-world scale. */
  tileSize: number;
}

function tex(id: string, label: string, tileSize: number): SurfaceTexture {
  return {
    id,
    label,
    thumbnail: `/textures/${id}/thumb.jpg`,
    map: `/textures/${id}/color.jpg`,
    roughnessMap: `/textures/${id}/roughness.jpg`,
    tileSize,
  };
}

export const FLOOR_TEXTURES: SurfaceTexture[] = [
  tex("WoodFloor051", "Açık Parke", 3),
  tex("WoodFloor034", "Balıksırtı Parke", 2),
  tex("Marble012", "Mermer", 2.5),
  tex("Carpet013", "Kırmızı Halı", 2),
  tex("Concrete048", "Cilalı Beton", 3),
];

export const WALL_TEXTURES: SurfaceTexture[] = [
  tex("Plaster001", "Düz Sıva", 3),
  tex("Bricks097", "Tuğla", 2),
  tex("WoodSiding009", "Ahşap Panel", 2.5),
  tex("Fabric026", "Kumaş Kaplama", 2),
];

export const CEILING_TEXTURES: SurfaceTexture[] = [
  tex("Plaster003", "Mat Beyaz Sıva", 4),
  tex("Plaster007", "Sıcak Krem Sıva", 4),
];

export function findTexture(list: SurfaceTexture[], id: string | undefined): SurfaceTexture | null {
  if (!id) return null;
  return list.find((t) => t.id === id) ?? null;
}

// Neutral base scans used to give a *custom-color* room (artist picked an RGB color instead of a preset
// texture) subtle real-world surface variation — the color tints these instead of painting a perfectly flat
// MeshStandardMaterial, which read as artificial/matte-paint-swatch flat. Picked for being visually neutral
// enough that tinting reads as "painted plaster/sealed concrete", not as their own distinct pattern.
export const DEFAULT_WALL_TEXTURE = WALL_TEXTURES[0]; // Plaster001 — flat plaster
export const DEFAULT_FLOOR_TEXTURE = FLOOR_TEXTURES[4]; // Concrete048 — sealed concrete
export const DEFAULT_CEILING_TEXTURE = CEILING_TEXTURES[0]; // Plaster003 — matte plaster
