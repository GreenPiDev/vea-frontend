// Curated, license-clear (CC0, ambientCG.com) PBR texture presets a custom
// exhibition can pick for its walls/floor/ceiling instead of a flat color.
// Diffuse + roughness + normal maps (OpenGL/"GL" tangent-space convention,
// matching three.js's default normalMapType) are used — the normal map is
// downscaled to 512px (vs. 1024px color/roughness) since per-pixel surface
// detail doesn't need the same resolution as the albedo to read correctly,
// keeping the added texture weight small.

export interface SurfaceTexture {
  id: string;
  label: string;
  /** Small preview shown in the builder's texture picker. */
  thumbnail: string;
  map: string;
  roughnessMap: string;
  normalMap: string;
  /** World meters per texture tile — controls repeat so the pattern reads at real-world scale. */
  tileSize: number;
  /**
   * Multiplies the baked normal map's perturbation strength (MeshStandardMaterial's
   * `normalScale`). Pure lighting-shader cost — no extra geometry/vertices/texture
   * fetches — so it's free to push higher for materials with real physical relief
   * (mortar lines, cobblestone joints, diamond plate ridges) that read too flat at
   * [1,1] under this scene's lighting; left near [1,1] for materials that are
   * genuinely closer to flat (polished marble, plaster, fabric).
   */
  normalScale: [number, number];
}

function tex(id: string, label: string, tileSize: number, normalScale: [number, number] = [1, 1]): SurfaceTexture {
  return {
    id,
    label,
    thumbnail: `/textures/${id}/thumb.jpg`,
    map: `/textures/${id}/color.jpg`,
    roughnessMap: `/textures/${id}/roughness.jpg`,
    normalMap: `/textures/${id}/normal.jpg`,
    tileSize,
    normalScale,
  };
}

export const FLOOR_TEXTURES: SurfaceTexture[] = [
  tex("WoodFloor051", "Açık Parke", 3, [1.3, 1.3]),
  tex("WoodFloor034", "Balıksırtı Parke", 2, [1.4, 1.4]),
  tex("Wood051", "Koyu Ahşap Parke", 3, [1.3, 1.3]),
  tex("Marble012", "Gri Mermer", 2.5, [0.8, 0.8]),
  tex("Marble004", "Krem Mermer", 3, [0.8, 0.8]),
  tex("Terrazzo003", "Terrazzo", 2, [1.2, 1.2]),
  tex("PavingStones142", "Taş Döşeme", 1.5, [2.4, 2.4]),
  tex("MetalPlates006", "Endüstriyel Metal Zemin", 2, [1.8, 1.8]),
  tex("Carpet013", "Kırmızı Halı", 2, [1.4, 1.4]),
  tex("Concrete048", "Cilalı Beton", 3, [1, 1]),
];

export const WALL_TEXTURES: SurfaceTexture[] = [
  tex("Plaster001", "Düz Sıva", 3, [1, 1]),
  tex("Bricks097", "Tuğla", 2, [2.5, 2.5]),
  tex("WoodSiding009", "Ahşap Panel", 2.5, [1.5, 1.5]),
  tex("Wood062", "Koyu Ahşap Kaplama", 2.5, [1.3, 1.3]),
  tex("Fabric026", "Kumaş Kaplama", 2, [1.3, 1.3]),
  tex("Marble012", "Mermer Kaplama", 3, [0.8, 0.8]),
  tex("Travertine009", "Traverten", 2.5, [1.6, 1.6]),
  tex("Concrete033", "Ham Beton Duvar", 3, [1.2, 1.2]),
];

export const CEILING_TEXTURES: SurfaceTexture[] = [
  tex("Plaster003", "Mat Beyaz Sıva", 4),
  tex("Plaster007", "Sıcak Krem Sıva", 4),
  tex("Metal048A", "Metalik Tavan", 3),
  tex("Concrete014", "Ham Beton Tavan", 4),
  tex("WoodSiding007", "Ahşap Lambri Tavan", 3),
];

export function findTexture(list: SurfaceTexture[], id: string | undefined): SurfaceTexture | null {
  if (!id) return null;
  return list.find((t) => t.id === id) ?? null;
}

// Neutral base scans used to give a *custom-color* room (artist picked an RGB color instead of a preset
// texture) subtle real-world surface variation — the color tints these instead of painting a perfectly flat
// MeshStandardMaterial, which read as artificial/matte-paint-swatch flat. Picked for being visually neutral
// enough that tinting reads as "painted plaster/sealed concrete", not as their own distinct pattern.
export const DEFAULT_WALL_TEXTURE = findTexture(WALL_TEXTURES, "Plaster001")!; // flat plaster
export const DEFAULT_FLOOR_TEXTURE = findTexture(FLOOR_TEXTURES, "Concrete048")!; // sealed concrete
export const DEFAULT_CEILING_TEXTURE = findTexture(CEILING_TEXTURES, "Plaster003")!; // matte plaster
