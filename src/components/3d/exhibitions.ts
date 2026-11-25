// Each exhibition is a self-contained single room with its own footprint,
// color palette / lighting mood, and hung collection. Only the selected
// exhibition's Scene is ever mounted (see App.tsx), so unrelated rooms cost
// zero render/light budget while not in use.

import type { Artwork } from "./artworks";
import type { RoomLayout } from "./galleryLayout";
import type { SeatSpot } from "./seating";

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
  /** Explicit hung collection for a custom exhibition; none means an empty room. */
  artworks?: Artwork[];
  /** Curator-placed furniture (template-only for now, see backendAdapter.ts's exhibitionFromBackendTemplate) — rendered by GalleryFurniture.tsx, already resolved against 3d/furniture.ts's FURNITURE_CATALOG. */
  furniture?: { modelUrl: string; position: [number, number, number]; rotationY: number; scale?: number; round?: boolean }[];
  /** Sittable furniture spots (isSeating furniture pieces), see seating.ts. */
  seats?: SeatSpot[];
  /** View through the windows (outdoorPanoramas.ts id). Only used when the layout has windows; defaults to the garden. */
  outdoor?: { panoramaId: string; /** Turns the view (and its sun) around the vertical axis, radians. */ rotationY?: number };
  /** Original builder inputs, kept so the exhibition can be reopened and edited. */
  builderSource?: CustomExhibitionSource;
}
