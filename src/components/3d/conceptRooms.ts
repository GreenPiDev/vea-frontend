// Concept showcase rooms (/exhibition/vitrin-2 … vitrin-5) — sibling demos of the original Vitrin room
// (showcaseExhibition.ts, /exhibition/vitrin-1). Same hanging rules (see showcaseExhibition.ts / the plan in
// sergi-gercekcilestirme.md Adım 13: real canvas sizes, 1.5 m centre line, one focal work per wall, ≥ 1.5 m
// between frames, ≤ 8 works so every one gets a picture light), but each one differs in floor, wall and
// ceiling material, colour mood, frames, furniture and collection so a client can compare moods:
//
//   vitrin-2  Beton Loft          raw concrete + polished concrete floor + metal ceiling, 6 m high, one giant canvas
//   vitrin-3  Karanlık Salon      charcoal walls, dark parquet, gold frames, lounge with armchairs
//   vitrin-4  Akdeniz Taş Galeri  travertine walls, cream marble floor, warm plaster ceiling, light and airy
//   vitrin-5  Tuğla Atölye        exposed brick, herringbone parquet, concrete ceiling, slim black frames
//
// Static (no backend), like the original; not listed on the homepage selector.

import { ARTWORKS, type Artwork, type FrameStyle } from "./artworks";
import type { Exhibition, ExhibitionTheme } from "./exhibitions";
import { WALL_CLEARANCE, buildRoomLayout, type PlacedFurnitureInput } from "./galleryLayout";
import type { SeatSpot } from "./seating";

export type ConceptWall = "north" | "south" | "east" | "west";

export interface ConceptWork {
  /** Catalogue entry in artworks.ts this is a copy of (title, artist, year, real size, image). */
  source: string;
  frame: FrameStyle;
  wall: ConceptWall;
  /** Offset along the wall from its centre (metres; x for north/south walls, z for east/west). */
  along: number;
}

export interface ConceptFurniture {
  modelUrl: string;
  x: number;
  z: number;
  rotationY: number;
  /** Measured footprint of the model at scale 1 (x = width, z = depth at rotationY 0). */
  width: number;
  depth: number;
  round?: boolean;
  seating?: boolean;
}

export interface ConceptRoomSpec {
  id: string;
  name: string;
  subtitle: string;
  roomSize: [number, number];
  wallHeight: number;
  /** Ceiling fixture grid (columns × rows), spread evenly over the room. */
  lightGrid: [number, number];
  theme: ExhibitionTheme;
  works: ConceptWork[];
  furniture: ConceptFurniture[];
}

/** Hang centre line for normal-sized works (same as the original showcase). */
export const CONCEPT_HANG_CENTER_Y = 1.5;
/** Large works are raised so their bottom edge stays at least this high off the floor. */
export const CONCEPT_MIN_BOTTOM = 0.7;

export function conceptHangY(height: number): number {
  return Math.max(CONCEPT_HANG_CENTER_Y, CONCEPT_MIN_BOTTOM + height / 2);
}

/** Evenly spread `cols × rows` fixture positions: cell centres of an equal grid over the room. */
export function conceptLightGrid([W, D]: [number, number], [cols, rows]: [number, number]) {
  const xs = Array.from({ length: cols }, (_, i) => ((i + 0.5) / cols - 0.5) * W * 0.8);
  const zs = Array.from({ length: rows }, (_, i) => ((i + 0.5) / rows - 0.5) * D * 0.8);
  return xs.flatMap((x) => zs.map((z) => ({ x, z })));
}

// Measured GLB bounding boxes at scale 1 (public/furnitures/).
const BENCH = { modelUrl: "/furnitures/galeri_banki.glb", width: 1.8, depth: 0.5, seating: true };
const PLANT = { modelUrl: "/furnitures/buyuk_bitki.glb", width: 0.922, depth: 0.812, round: true };
const CANAPE = { modelUrl: "/furnitures/antique_canape_lod.glb", width: 1.814, depth: 0.927, seating: true };
const ARMCHAIR = { modelUrl: "/furnitures/antique_armchair.glb", width: 0.734, depth: 0.909, seating: true };
const COFFEE_TABLE = { modelUrl: "/furnitures/antique_coffee_table.glb", width: 1.459, depth: 0.673 };
const PEDESTAL = { modelUrl: "/furnitures/classic_vase_pedestal.glb", width: 0.44, depth: 0.36, round: true };

/** rotationY that seats the visitor facing north (−Z), same convention as the original bench. */
const FACE_NORTH = Math.PI;

export const CONCEPT_ROOM_SPECS: ConceptRoomSpec[] = [
  {
    id: "vitrin-2",
    name: "Beton Loft",
    subtitle: "Ham beton, cilalı zemin ve devasa bir tuval",
    roomSize: [18, 12],
    wallHeight: 6,
    lightGrid: [3, 2],
    theme: {
      wallColor: "#8d8e90",
      wallRoughness: 0.95,
      floorColor: "#7b7c7f",
      floorRoughness: 0.4,
      floorMetalness: 0.04,
      ceilingColor: "#5f6266",
      fogColor: "#8d8e90",
      backgroundColor: "#8d8e90",
      ambientColor: "#eef2f8",
      ambientIntensity: 0.4,
      hemisphereSkyColor: "#eef2f8",
      hemisphereGroundColor: "#7b7c7f",
      spotColor: "#f4f7ff",
      spotIntensity: 22,
      wallTextureId: "Concrete033",
      floorTextureId: "Concrete048",
      ceilingTextureId: "Metal048A",
    },
    works: [
      { source: "night-watch", frame: "modernBlack", wall: "north", along: 0 },
      { source: "the-scream", frame: "modernBlack", wall: "north", along: 6.5 },
      { source: "the-kiss", frame: "modernBlack", wall: "east", along: 0 },
      { source: "starry-night", frame: "modernBlack", wall: "west", along: -2.5 },
      { source: "great-wave", frame: "modernBlack", wall: "west", along: 2.5 },
      { source: "liberty-leading", frame: "modernBlack", wall: "south", along: 0 },
      { source: "mona-lisa", frame: "modernBlack", wall: "south", along: -6 },
    ],
    furniture: [
      { ...CANAPE, x: 0, z: 1.5, rotationY: FACE_NORTH },
      { ...PLANT, x: 7.9, z: -5, rotationY: 0.4 },
    ],
  },
  {
    id: "vitrin-3",
    name: "Karanlık Salon",
    subtitle: "Koyu duvarlar, altın çerçeveler ve klasik bir salon",
    roomSize: [14, 9],
    wallHeight: 4.2,
    lightGrid: [3, 2],
    theme: {
      wallColor: "#2e3035",
      wallRoughness: 0.9,
      floorColor: "#4a3626",
      floorRoughness: 0.4,
      floorMetalness: 0.03,
      ceilingColor: "#1d1e21",
      fogColor: "#2e3035",
      backgroundColor: "#2e3035",
      ambientColor: "#ffe9cc",
      ambientIntensity: 0.3,
      hemisphereSkyColor: "#ffe9cc",
      hemisphereGroundColor: "#4a3626",
      spotColor: "#ffe6bf",
      spotIntensity: 26,
      floorTextureId: "Wood051",
    },
    works: [
      { source: "birth-of-venus", frame: "gold", wall: "north", along: 0 },
      { source: "mona-lisa", frame: "gold", wall: "north", along: -4.6 },
      { source: "pearl-earring", frame: "gold", wall: "north", along: 4.6 },
      { source: "starry-night", frame: "gold", wall: "west", along: 0 },
      { source: "the-kiss", frame: "gold", wall: "east", along: 0 },
      { source: "the-scream", frame: "gold", wall: "south", along: -2.5 },
      { source: "great-wave", frame: "gold", wall: "south", along: 2.5 },
    ],
    furniture: [
      { ...ARMCHAIR, x: -1.9, z: 1.2, rotationY: FACE_NORTH },
      { ...ARMCHAIR, x: 1.9, z: 1.2, rotationY: FACE_NORTH },
      { ...COFFEE_TABLE, x: 0, z: 1.2, rotationY: 0 },
      { ...PEDESTAL, x: -6.2, z: -3.8, rotationY: 0 },
      { ...PEDESTAL, x: 6.2, z: -3.8, rotationY: 0 },
    ],
  },
  {
    id: "vitrin-4",
    name: "Akdeniz Taş Galeri",
    subtitle: "Traverten duvarlar, krem mermer ve geniş, aydınlık bir salon",
    roomSize: [15, 10],
    wallHeight: 4.4,
    lightGrid: [3, 2],
    theme: {
      wallColor: "#d9c9ad",
      wallRoughness: 0.9,
      floorColor: "#e3d8c3",
      floorRoughness: 0.28,
      floorMetalness: 0.03,
      ceilingColor: "#f1e8d6",
      fogColor: "#e8dcc4",
      backgroundColor: "#e8dcc4",
      ambientColor: "#fff3df",
      ambientIntensity: 0.42,
      hemisphereSkyColor: "#fff6e8",
      hemisphereGroundColor: "#c9b48e",
      spotColor: "#fff1d8",
      spotIntensity: 21,
      wallTextureId: "Travertine009",
      floorTextureId: "Marble004",
      ceilingTextureId: "Plaster007",
    },
    works: [
      { source: "the-kiss", frame: "walnut", wall: "north", along: 0 },
      { source: "starry-night", frame: "walnut", wall: "north", along: -4.6 },
      { source: "the-scream", frame: "walnut", wall: "north", along: 4.6 },
      { source: "liberty-leading", frame: "walnut", wall: "east", along: 0 },
      { source: "great-wave", frame: "walnut", wall: "west", along: -2.2 },
      { source: "pearl-earring", frame: "walnut", wall: "west", along: 2.2 },
      { source: "mona-lisa", frame: "walnut", wall: "south", along: 0 },
    ],
    furniture: [
      { ...BENCH, x: 0, z: 0.5, rotationY: FACE_NORTH },
      { ...PLANT, x: -6.5, z: 3.9, rotationY: 0.9 },
      { ...PLANT, x: 6.5, z: 3.9, rotationY: 2.1 },
    ],
  },
  {
    id: "vitrin-5",
    name: "Tuğla Atölye",
    subtitle: "Açık tuğla, balıksırtı parke ve ince siyah çerçeveler",
    roomSize: [16, 10],
    wallHeight: 4,
    lightGrid: [3, 2],
    theme: {
      wallColor: "#b3704f",
      wallRoughness: 0.95,
      floorColor: "#8a6a47",
      floorRoughness: 0.42,
      floorMetalness: 0.02,
      ceilingColor: "#8a8b8c",
      fogColor: "#b3704f",
      backgroundColor: "#b3704f",
      ambientColor: "#fff0de",
      ambientIntensity: 0.38,
      hemisphereSkyColor: "#fff0de",
      hemisphereGroundColor: "#8a6a47",
      spotColor: "#ffeccf",
      spotIntensity: 24,
      wallTextureId: "Bricks097",
      floorTextureId: "WoodFloor034",
      ceilingTextureId: "Concrete014",
    },
    works: [
      { source: "birth-of-venus", frame: "modernBlack", wall: "north", along: 0 },
      { source: "pearl-earring", frame: "modernBlack", wall: "north", along: -4.8 },
      { source: "mona-lisa", frame: "modernBlack", wall: "north", along: 4.8 },
      { source: "starry-night", frame: "modernBlack", wall: "east", along: 0 },
      { source: "the-scream", frame: "modernBlack", wall: "west", along: -2.3 },
      { source: "great-wave", frame: "modernBlack", wall: "west", along: 2.3 },
      { source: "the-kiss", frame: "modernBlack", wall: "south", along: 0 },
    ],
    furniture: [
      { ...CANAPE, x: 0, z: 0.8, rotationY: FACE_NORTH },
      { ...PEDESTAL, x: 6.3, z: 3.6, rotationY: 0 },
      { ...PLANT, x: -6.8, z: 3.9, rotationY: 1.3 },
    ],
  },
];

/** The work hung on its wall: real physical height, wall-face position and facing. */
export function hangConceptWork(spec: ConceptRoomSpec, work: ConceptWork): Artwork {
  const base = ARTWORKS.find((a) => a.id === work.source);
  if (!base?.heightCm) throw new Error(`${spec.id}: unknown or unsized artwork "${work.source}"`);
  const [W, D] = spec.roomSize;
  const height = base.heightCm / 100;
  const y = conceptHangY(height);
  const northZ = -D / 2 + WALL_CLEARANCE;
  const southZ = D / 2 - WALL_CLEARANCE;
  const eastX = W / 2 - WALL_CLEARANCE;
  const westX = -W / 2 + WALL_CLEARANCE;
  const placement: Record<ConceptWall, Pick<Artwork, "position" | "rotationY">> = {
    north: { position: [work.along, y, northZ], rotationY: 0 },
    south: { position: [work.along, y, southZ], rotationY: Math.PI },
    east: { position: [eastX, y, work.along], rotationY: -Math.PI / 2 },
    west: { position: [westX, y, work.along], rotationY: Math.PI / 2 },
  };
  return { ...base, id: `${spec.id}-${base.id}`, exhibitionId: spec.id, height, frame: work.frame, ...placement[work.wall] };
}

export function furnitureFootprints(furniture: ConceptFurniture[]): PlacedFurnitureInput[] {
  return furniture.map((f) => ({
    x: f.x,
    z: f.z,
    rotationY: f.rotationY,
    halfWidth: f.width / 2,
    halfDepth: f.depth / 2,
    round: f.round,
  }));
}

export function buildConceptExhibition(spec: ConceptRoomSpec): Exhibition {
  const seats: SeatSpot[] = spec.furniture.flatMap((f, i) =>
    f.seating ? [{ id: String(i), x: f.x, z: f.z, rotationY: f.rotationY }] : []
  );
  return {
    id: spec.id,
    name: spec.name,
    subtitle: spec.subtitle,
    roomSize: spec.roomSize,
    wallHeight: spec.wallHeight,
    theme: spec.theme,
    customLayout: buildRoomLayout(
      spec.roomSize,
      spec.wallHeight,
      conceptLightGrid(spec.roomSize, spec.lightGrid),
      furnitureFootprints(spec.furniture)
    ),
    artworks: spec.works.map((w) => hangConceptWork(spec, w)),
    furniture: spec.furniture.map((f) => ({ modelUrl: f.modelUrl, position: [f.x, 0, f.z], rotationY: f.rotationY, scale: 1 })),
    seats,
  };
}

export const CONCEPT_EXHIBITIONS: Exhibition[] = CONCEPT_ROOM_SPECS.map(buildConceptExhibition);
