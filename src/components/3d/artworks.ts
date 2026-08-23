// Curated public-domain masterpieces (Wikimedia Commons) used to give each
// exhibition room a real, lived-in identity instead of bare walls. Each
// entry carries its true aspect ratio so the canvas never looks stretched,
// plus which exhibition it hangs in and its wall placement within that
// room's local coordinates (see exhibitions.ts for room size/theme).

import { WALL_CLEARANCE } from "./galleryLayout";

export type FrameStyle = "gold" | "walnut";

export interface Artwork {
  id: string;
  title: string;
  artist: string;
  year: string;
  /** Which exhibition (see exhibitions.ts) this painting is hung in. */
  exhibitionId: string;
  /** Path under /public */
  image: string;
  /** Real image aspect ratio (width / height), used to size the canvas. */
  aspect: number;
  /** Physical height of the canvas on the wall, in meters. */
  height: number;
  /** Undefined/null for backend-sourced artworks — the artist's uploaded image already includes its own frame, so no extra 3D frame mesh is rendered (see Artwork.tsx). Only the static demo ARTWORKS below use this. */
  frame?: FrameStyle | null;
  /** Center position of the canvas face, flush against the wall surface. */
  position: [number, number, number];
  /** Yaw so the painting's front faces into the room. */
  rotationY: number;

  // The fields below are only populated for backend-sourced artworks (see
  // backendAdapter.ts's toRenderableArtwork) — the static demo ARTWORKS
  // below never set them, which is exactly how ArtworkDetailCard tells a
  // demo painting (not purchasable) apart from a real one.
  /** Real backend Artwork.id — distinct from `id` above, which for a backend artwork is the ExhibitionArtwork join-row id. Needed to POST an offer against the right artwork. */
  artworkId?: string;
  technique?: string | null;
  /** Minor-unit price (e.g. kuruş/cent), mirrors ApiArtwork.priceAmount. */
  priceAmount?: number;
  currency?: string;
  status?: "DRAFT" | "LISTED" | "IN_EXHIBITION" | "SOLD" | "ARCHIVED";
  /** The artist's User.id (ArtistProfile.userId) — lets the UI proactively hide the offer form on the viewer's own artwork instead of only relying on the backend's 403. */
  sellerId?: string;
}

/** Standard museum hanging-line: center of artwork ~1.65m from the floor. */
const HANG_CENTER_Y = 1.65;

export const ARTWORKS: Artwork[] = [
  // --- Rönesans Ustaları (14x10 room) ---
  {
    id: "birth-of-venus",
    title: "Venüs'ün Doğuşu",
    artist: "Sandro Botticelli",
    year: "c. 1485",
    exhibitionId: "renaissance",
    image: "/artworks/birth_of_venus.jpg",
    aspect: 1920 / 1206,
    height: 1.8,
    frame: "gold",
    position: [0, HANG_CENTER_Y, -5 + WALL_CLEARANCE],
    rotationY: 0,
  },
  {
    id: "mona-lisa",
    title: "Mona Lisa",
    artist: "Leonardo da Vinci",
    year: "c. 1503",
    exhibitionId: "renaissance",
    image: "/artworks/mona_lisa.jpg",
    aspect: 1073 / 1600,
    height: 1.1,
    frame: "gold",
    position: [7 - WALL_CLEARANCE, HANG_CENTER_Y, 0],
    rotationY: -Math.PI / 2,
  },
  {
    id: "pearl-earring",
    title: "İnci Küpeli Kız",
    artist: "Johannes Vermeer",
    year: "c. 1665",
    exhibitionId: "renaissance",
    image: "/artworks/pearl_earring.jpg",
    aspect: 1351 / 1600,
    height: 1.3,
    frame: "gold",
    position: [-7 + WALL_CLEARANCE, HANG_CENTER_Y, 0],
    rotationY: Math.PI / 2,
  },

  // --- Empresyonizm ve Japon Sanatı (14x10 room) ---
  {
    id: "great-wave",
    title: "Kanagawa Açıklarında Büyük Dalga",
    artist: "Katsushika Hokusai",
    year: "c. 1831",
    exhibitionId: "impressionism",
    image: "/artworks/great_wave.jpg",
    aspect: 1920 / 1324,
    height: 2.2,
    frame: "walnut",
    position: [0, HANG_CENTER_Y, -5 + WALL_CLEARANCE],
    rotationY: 0,
  },
  {
    id: "starry-night",
    title: "Yıldızlı Gece",
    artist: "Vincent van Gogh",
    year: "1889",
    exhibitionId: "impressionism",
    image: "/artworks/starry_night.jpg",
    aspect: 1920 / 1520,
    height: 1.6,
    frame: "walnut",
    position: [7 - WALL_CLEARANCE, HANG_CENTER_Y, 0],
    rotationY: -Math.PI / 2,
  },
  {
    id: "the-kiss",
    title: "Öpücük",
    artist: "Gustav Klimt",
    year: "1908",
    exhibitionId: "impressionism",
    image: "/artworks/the_kiss.jpg",
    aspect: 1079 / 1080,
    height: 1.8,
    frame: "gold",
    position: [-7 + WALL_CLEARANCE, HANG_CENTER_Y, 0],
    rotationY: Math.PI / 2,
  },

  // --- Barok ve Dışavurumculuk (10x10 room) ---
  {
    id: "night-watch",
    title: "Gece Devriyesi",
    artist: "Rembrandt van Rijn",
    year: "1642",
    exhibitionId: "baroque",
    image: "/artworks/night_watch.jpg",
    aspect: 1920 / 1562,
    height: 2.2,
    frame: "gold",
    position: [0, HANG_CENTER_Y, -5 + WALL_CLEARANCE],
    rotationY: 0,
  },
  {
    id: "the-scream",
    title: "Çığlık",
    artist: "Edvard Munch",
    year: "1893",
    exhibitionId: "baroque",
    image: "/artworks/the_scream.jpg",
    aspect: 1289 / 1600,
    height: 1.3,
    frame: "walnut",
    position: [5 - WALL_CLEARANCE, HANG_CENTER_Y, 0],
    rotationY: -Math.PI / 2,
  },

  // --- Büyük Galeri (34x22 room, 13m ceiling, oversized canvases).
  // These are far taller than the shared HANG_CENTER_Y assumes, so each
  // gets its own hang center: height/2 + floor clearance + frame border,
  // otherwise the canvas bottom sinks below the floor plane. ---
  {
    id: "napoleon-coronation",
    title: "Napolyon'un Taç Giymesi",
    artist: "Jacques-Louis David",
    year: "1805–1807",
    exhibitionId: "grande-galerie",
    image: "/artworks/napoleon_coronation.jpg",
    aspect: 1920 / 1207,
    height: 5.5,
    frame: "gold",
    position: [0, 3.2, -11 + WALL_CLEARANCE],
    rotationY: 0,
  },
  {
    id: "raft-of-medusa",
    title: "Medusa'nın Salı",
    artist: "Théodore Géricault",
    year: "1818–1819",
    exhibitionId: "grande-galerie",
    image: "/artworks/raft_of_medusa.jpg",
    aspect: 1920 / 1305,
    height: 4.2,
    frame: "gold",
    position: [17 - WALL_CLEARANCE, 2.6, 0],
    rotationY: -Math.PI / 2,
  },
  {
    id: "liberty-leading",
    title: "Halka Yol Gösteren Özgürlük",
    artist: "Eugène Delacroix",
    year: "1830",
    exhibitionId: "grande-galerie",
    image: "/artworks/liberty_leading.jpg",
    aspect: 1920 / 1520,
    height: 3.6,
    frame: "gold",
    position: [-17 + WALL_CLEARANCE, 2.3, 0],
    rotationY: Math.PI / 2,
  },
];
