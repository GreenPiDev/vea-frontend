// A hung artwork as the 3D scene renders it (built from backend data by backendAdapter.ts).

export type FrameStyle = "gold" | "walnut" | "modernBlack";

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
  /** A moulded frame mesh (frameProfile.ts) — only test fixtures set one. Backend-sourced artworks are always null (backendAdapter.ts's toRenderableArtwork): `framed: true` — the uploaded image already shows its own frame; `framed: false` — it hangs as a bare stretched canvas (frameProfile.ts's buildStretchedCanvasGeometry), we don't add a frame the artist didn't. */
  frame?: FrameStyle | null;
  /** Center position of the canvas face, flush against the wall surface. */
  position: [number, number, number];
  /** Yaw so the painting's front faces into the room. */
  rotationY: number;
  /** Floor height the work is seen from (m): the mezzanine's top for a work hung on the mezzanine, else 0/unset. */
  floorY?: number;

  // The fields below are only populated for backend-sourced artworks (see
  // backendAdapter.ts's toRenderableArtwork) — ArtworkDetailCard hides the
  // offer form when they're missing.
  /** Real backend Artwork.id — distinct from `id` above, which for a backend artwork is the ExhibitionArtwork join-row id. Needed to POST an offer against the right artwork. */
  artworkId?: string;
  technique?: string | null;
  /** Mirrors ApiArtwork.framed — drives ArtworkDetailCard.tsx's "framed"/"unframed" line, independent of `frame` above (which is what the 3D scene actually renders, "modernBlack" or null). */
  framed?: boolean;
  /** Mirrors ApiArtwork.category — ArtworkDetailCard.tsx shows a localized label. */
  category?: "PAINTING" | "SCULPTURE" | "PHOTOGRAPHY" | "OTHER";
  /** Physical size in cm, mirrors ApiArtwork.heightCm/widthCm — shown as "H x W cm" in ArtworkDetailCard.tsx. Distinct from `height`, which is the on-wall render height in meters. */
  heightCm?: number;
  widthCm?: number;
  /** Mirrors ApiArtwork.story ("Manifesto" in the artist panel form) — the artist's own statement about the piece. */
  story?: string | null;
  /** Mirrors ApiArtwork.note ("Özel Notlar" in the artist panel form) — free-text caretaking/condition notes. */
  note?: string | null;
  /** Minor-unit price (e.g. kuruş/cent), mirrors ApiArtwork.priceAmount. */
  priceAmount?: number;
  currency?: string;
  /** Mirrors ApiArtwork.maxDiscountPercent — ArtworkDetailCard.tsx uses this + priceAmount to disable the offer button and warn below the artist's set floor. Backend also enforces this independently (OffersService.create). */
  maxDiscountPercent?: number | null;
  status?: "DRAFT" | "LISTED" | "IN_EXHIBITION" | "SOLD" | "ARCHIVED";
  /** The artist's User.id (ArtistProfile.userId) — lets the UI proactively hide the offer form on the viewer's own artwork instead of only relying on the backend's 403. */
  sellerId?: string;
  /** Mirrors ApiArtwork.hasApprovedOffer — true once the artist has recorded an informal "approved" decision on an offer for this artwork. Treated the same as status === 'SOLD' by ArtworkDetailCard, even though the real Artwork.status may not have flipped. */
  hasApprovedOffer?: boolean;
}
