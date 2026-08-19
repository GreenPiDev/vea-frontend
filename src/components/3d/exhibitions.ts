// Each exhibition is a self-contained single room with its own footprint,
// color palette / lighting mood, and hung collection. Only the selected
// exhibition's Scene is ever mounted (see App.tsx), so unrelated rooms cost
// zero render/light budget while not in use.

import type { Artwork } from "./artworks";
import type { RoomLayout } from "./galleryLayout";

export interface ExhibitionTheme {
  wallColor: string;
  wallRoughness: number;
  floorColor: string;
  floorRoughness: number;
  floorMetalness: number;
  ceilingColor: string;
  fogColor: string;
  backgroundColor: string;
  ambientColor: string;
  ambientIntensity: number;
  hemisphereSkyColor: string;
  hemisphereGroundColor: string;
  spotColor: string;
  spotIntensity: number;
  /** Optional real-photo PBR texture id (see surfaceTextures.ts) — overrides the flat color when set. */
  floorTextureId?: string;
  wallTextureId?: string;
  ceilingTextureId?: string;
}

/** Raw builder state needed to reopen a custom exhibition for editing. */
export interface CustomExhibitionSource {
  name: string;
  wallHeight: number;
  wallColor: string;
  floorColor: string;
  ceilingColor: string;
  floorTextureId?: string;
  wallTextureId?: string;
  ceilingTextureId?: string;
  cells: { x: number; z: number }[];
  /** Wall-run id -> curated artwork id (see galleryLayout.ts's CustomWallRun.id). */
  placements: Record<string, string>;
  /** User-chosen spawn cell + facing (radians yaw); see galleryLayout.ts's SpawnOverride. */
  spawn: { x: number; z: number; yaw: number };
}

export interface Exhibition {
  id: string;
  name: string;
  subtitle: string;
  /** [width (x), depth (z)] of the standalone room — unused when customLayout is set. */
  roomSize?: [number, number];
  wallHeight: number;
  theme: ExhibitionTheme;
  /** True for a user-drawn exhibition created via the builder (shows a delete/edit control). */
  custom?: boolean;
  /** Precomputed layout for a user-drawn (non-rectangular) room; overrides roomSize. */
  customLayout?: RoomLayout;
  /** Explicit hung collection for a custom exhibition; overrides the ARTWORKS-by-id lookup. */
  artworks?: Artwork[];
  /** Original builder inputs, kept so the exhibition can be reopened and edited. */
  builderSource?: CustomExhibitionSource;
}

export const EXHIBITIONS: Exhibition[] = [
  {
    id: "renaissance",
    name: "Rönesans Ustaları",
    subtitle: "Klasik portre ve figür sanatı",
    roomSize: [14, 10],
    wallHeight: 6,
    theme: {
      wallColor: "#efe4cf",
      wallRoughness: 0.9,
      floorColor: "#8a6a45",
      floorRoughness: 0.4,
      floorMetalness: 0.02,
      ceilingColor: "#f7f0e0",
      fogColor: "#efe4cf",
      backgroundColor: "#e9dcc2",
      ambientColor: "#fff1d6",
      ambientIntensity: 0.38,
      hemisphereSkyColor: "#fff6e6",
      hemisphereGroundColor: "#c9a876",
      spotColor: "#fff2d0",
      spotIntensity: 20,
    },
  },
  {
    id: "impressionism",
    name: "Empresyonizm ve Japon Sanatı",
    subtitle: "Işık, renk ve ahşap baskı",
    roomSize: [14, 10],
    wallHeight: 6,
    theme: {
      wallColor: "#22303f",
      wallRoughness: 0.75,
      floorColor: "#141a22",
      floorRoughness: 0.15,
      floorMetalness: 0.35,
      ceilingColor: "#0f141b",
      fogColor: "#1b2531",
      backgroundColor: "#141c26",
      ambientColor: "#cfe0ff",
      ambientIntensity: 0.22,
      hemisphereSkyColor: "#a9c7ff",
      hemisphereGroundColor: "#0d1620",
      spotColor: "#eaf2ff",
      spotIntensity: 24,
    },
  },
  {
    id: "baroque",
    name: "Barok ve Dışavurumculuk",
    subtitle: "Dramatik ışık, koyu salon",
    roomSize: [10, 10],
    wallHeight: 5,
    theme: {
      wallColor: "#3b1418",
      wallRoughness: 0.85,
      floorColor: "#1c1210",
      floorRoughness: 0.3,
      floorMetalness: 0.05,
      ceilingColor: "#2a1013",
      fogColor: "#33110f",
      backgroundColor: "#2a0f0f",
      ambientColor: "#ffd8b0",
      ambientIntensity: 0.16,
      hemisphereSkyColor: "#5a2a2a",
      hemisphereGroundColor: "#100606",
      spotColor: "#ffd9a0",
      spotIntensity: 26,
    },
  },
  {
    id: "grande-galerie",
    name: "Büyük Galeri",
    subtitle: "Louvre esintili, kırmızı duvarlı, devasa tablolar salonu",
    roomSize: [34, 22],
    wallHeight: 13,
    theme: {
      wallColor: "#8f2323",
      wallRoughness: 0.85,
      floorColor: "#c8a874",
      floorRoughness: 0.35,
      floorMetalness: 0.05,
      ceilingColor: "#f9f5ec",
      fogColor: "#d8c4a0",
      backgroundColor: "#efe3cc",
      ambientColor: "#fff8ec",
      ambientIntensity: 0.5,
      hemisphereSkyColor: "#fff6e0",
      hemisphereGroundColor: "#c9a876",
      spotColor: "#fff8e8",
      spotIntensity: 20,
    },
  },
];
