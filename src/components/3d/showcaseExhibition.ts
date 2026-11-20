// Showcase exhibition (sergi-gercekcilestirme.md Adım 13) — the room to show clients and to take every
// before/after screenshot from. A test room (no paintings, low ceiling, saturated walls) reads as fake with
// any renderer; this one follows how a real museum room is hung:
//
// - 4.2 m ceiling (plan: 3.5–4.5 m) — tall enough to feel like a gallery, low enough that the walls above
//   the paintings don't turn into large flat, evenly lit planes.
// - Calm warm off-white walls (flat colour, no wall scan), light oak parquet, matte plaster ceiling.
// - Paintings at their real physical sizes, hung on a 1.5 m centre line; the large canvases are raised just
//   enough to keep ~0.7 m above the floor. One focal work per wall, generous space between works.
// - Few, well-placed pieces of furniture: one bench facing the main wall (sittable), one plant in the corner
//   visible from the entrance view. Both are platform default models shipped in public/furnitures/ — their
//   footprints below are the models' measured bounding boxes at scale 1.
// - 7 paintings, so every one gets a picture light from the 8-light ArtworkLightPool at once.
//
// Static (no backend) on purpose: it always exists, never changes under a screenshot series, and opens at
// /exhibition/vitrin (static templates aren't listed on the homepage selector).

import { ARTWORKS, type Artwork, type FrameStyle } from "./artworks";
import type { Exhibition } from "./exhibitions";
import { WALL_CLEARANCE, buildRoomLayout, type PlacedFurnitureInput } from "./galleryLayout";
import type { SeatSpot } from "./seating";

export const SHOWCASE_ID = "vitrin";
export const SHOWCASE_ROOM_SIZE: [number, number] = [16, 11];
export const SHOWCASE_WALL_HEIGHT = 4.2;
/** Centre line for normal-sized works (plan: 1.45–1.55 m). */
export const SHOWCASE_HANG_CENTER_Y = 1.5;
/** Large works are raised so their bottom edge stays at least this high off the floor. */
export const SHOWCASE_MIN_BOTTOM = 0.7;

const [W, D] = SHOWCASE_ROOM_SIZE;
const NORTH_Z = -D / 2 + WALL_CLEARANCE;
const SOUTH_Z = D / 2 - WALL_CLEARANCE;
const EAST_X = W / 2 - WALL_CLEARANCE;
const WEST_X = -W / 2 + WALL_CLEARANCE;

/** Hang height: the shared centre line, or higher for a canvas that would otherwise sit too low. */
export function showcaseHangY(height: number): number {
  return Math.max(SHOWCASE_HANG_CENTER_Y, SHOWCASE_MIN_BOTTOM + height / 2);
}

type Wall = "north" | "south" | "east" | "west";

interface ShowcaseWork {
  /** The catalogue entry in artworks.ts it's a copy of (title, artist, year, medium, real size, image). */
  source: string;
  frame: FrameStyle;
  wall: Wall;
  /** Offset along the wall from its centre (metres, x for north/south walls, z for east/west). */
  along: number;
}

function hang(work: ShowcaseWork): Artwork {
  const base = ARTWORKS.find((a) => a.id === work.source);
  if (!base?.heightCm) throw new Error(`showcase: unknown or unsized artwork "${work.source}"`);
  // Real physical size: the canvas is exactly as tall as the catalogue's heightCm.
  const height = base.heightCm / 100;
  const y = showcaseHangY(height);
  const placement: Record<Wall, Pick<Artwork, "position" | "rotationY">> = {
    north: { position: [work.along, y, NORTH_Z], rotationY: 0 },
    south: { position: [work.along, y, SOUTH_Z], rotationY: Math.PI },
    east: { position: [EAST_X, y, work.along], rotationY: -Math.PI / 2 },
    west: { position: [WEST_X, y, work.along], rotationY: Math.PI / 2 },
  };
  return { ...base, id: `vitrin-${base.id}`, exhibitionId: SHOWCASE_ID, height, frame: work.frame, ...placement[work.wall] };
}

const WORKS: ShowcaseWork[] = [
  // North — the main wall, faced from the entrance and from the bench.
  { source: "birth-of-venus", frame: "gold", wall: "north", along: 0 },
  { source: "mona-lisa", frame: "gold", wall: "north", along: -5.2 },
  { source: "pearl-earring", frame: "gold", wall: "north", along: 5.2 },
  // East — one large work alone.
  { source: "the-kiss", frame: "gold", wall: "east", along: 0 },
  // West — a pair of mid-sized works.
  { source: "starry-night", frame: "walnut", wall: "west", along: -2.3 },
  { source: "the-scream", frame: "walnut", wall: "west", along: 2.3 },
  // South — behind the entrance view, the room's largest canvas.
  { source: "liberty-leading", frame: "gold", wall: "south", along: 0 },
];

export const SHOWCASE_ARTWORKS: Artwork[] = WORKS.map(hang);

/** Six fixtures in a 3 × 2 grid (the auto grid would give a 16 m room only four). */
export const SHOWCASE_CEILING_LIGHTS = [-5.3, 0, 5.3].flatMap((x) => [-2.2, 2.2].map((z) => ({ x, z })));

interface ShowcaseFurniture {
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

const FURNITURE: ShowcaseFurniture[] = [
  // Bench ~5 m in front of the main wall; rotationY π seats the visitor facing north (Player: yaw = rotationY + π).
  { modelUrl: "/furnitures/galeri_banki.glb", x: 0, z: -0.5, rotationY: Math.PI, width: 1.8, depth: 0.5, seating: true },
  // Plant in the north-east corner, in view from the entrance.
  { modelUrl: "/furnitures/buyuk_bitki.glb", x: 7.15, z: -4.65, rotationY: 0.6, width: 0.922, depth: 0.812, round: true },
];

export const SHOWCASE_FURNITURE_FOOTPRINTS: PlacedFurnitureInput[] = FURNITURE.map((f) => ({
  x: f.x,
  z: f.z,
  rotationY: f.rotationY,
  halfWidth: f.width / 2,
  halfDepth: f.depth / 2,
  round: f.round,
}));

const SEATS: SeatSpot[] = FURNITURE.flatMap((f, i) =>
  f.seating ? [{ id: String(i), x: f.x, z: f.z, rotationY: f.rotationY }] : []
);

export const SHOWCASE_EXHIBITION: Exhibition = {
  id: SHOWCASE_ID,
  name: "Vitrin Sergisi",
  subtitle: "Gerçek ölçülerde başyapıtlar, sakin bir müze salonu",
  roomSize: SHOWCASE_ROOM_SIZE,
  wallHeight: SHOWCASE_WALL_HEIGHT,
  theme: {
    wallColor: "#e4dfd5",
    wallRoughness: 0.92,
    floorColor: "#b08a5c",
    floorRoughness: 0.45,
    floorMetalness: 0.02,
    ceilingColor: "#efebe3",
    fogColor: "#e4dfd5",
    backgroundColor: "#e4dfd5",
    ambientColor: "#fff4e2",
    ambientIntensity: 0.36,
    hemisphereSkyColor: "#fff6e8",
    hemisphereGroundColor: "#b9a07c",
    spotColor: "#fff1d8",
    spotIntensity: 22,
    floorTextureId: "WoodFloor051",
    ceilingTextureId: "Plaster003",
  },
  customLayout: buildRoomLayout(
    SHOWCASE_ROOM_SIZE,
    SHOWCASE_WALL_HEIGHT,
    SHOWCASE_CEILING_LIGHTS,
    SHOWCASE_FURNITURE_FOOTPRINTS
  ),
  artworks: SHOWCASE_ARTWORKS,
  furniture: FURNITURE.map((f) => ({ modelUrl: f.modelUrl, position: [f.x, 0, f.z], rotationY: f.rotationY, scale: 1 })),
  seats: SEATS,
};
