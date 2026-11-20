// Geometry-derived ambient occlusion for the room's floor/ceiling/walls.
//
// Real rooms darken where surfaces meet (floor↔wall, wall↔wall, wall↔ceiling) and where objects rest on
// the floor, because those spots receive less bounced light. This scene has no global illumination and
// no shadow-casting lights (see GalleryLights.tsx), so without this every junction renders at the same
// flat brightness and furniture looks like it floats — the main reasons the room read as a "CG box".
//
// Screen-space AO (SSAO/GTAO) would work too, but costs a full-screen pass every frame. Instead this
// precomputes, once per layout, a small two-channel texture over the room's XZ footprint:
//   R — occlusion from the nearest WALL footprint (used by floor, ceiling and wall↔wall corners)
//   G — SIGNED DISTANCE to the nearest FURNITURE footprint (floor only: a bench next to a wall must not
//       darken that wall all the way up to the ceiling, which it would if both lived in one channel).
//       A distance rather than a baked occlusion value because the contact shadow needs a sharp, dark core
//       a few cm wide — far below the 10 cm texel — and a bilinearly filtered distance field stays exact
//       between texels where a filtered occlusion value would smear (sergi-gercekcilestirme.md Adım 11).
// The shader patch in roomAoMaterial.ts samples it by world position — zero per-frame CPU cost, one
// texture fetch per fragment, works identically on any room shape the builder can produce.
//
// Within a channel, distance is taken to the NEAREST footprint (min), not a product over all of them:
// custom rooms are built from many collinear wall segments, and a product would double-darken every seam.

import type { PlacedFurnitureInput, RoomFootprint, WallSegment } from "./galleryLayout";

export interface AoFalloff {
  /** Distance (m) from the footprint at which occlusion fades out completely. */
  radius: number;
  /** Occlusion right at/under the footprint: 0 = none, 1 = fully black indirect light. */
  strength: number;
}

export interface AoFieldOptions {
  /** Meters per texel. 0.1 m is well below every falloff radius, so bilinear filtering hides the grid. */
  texelSize: number;
  /** Upper bound on either texture dimension, so a huge room can't allocate a huge texture. */
  maxResolution: number;
  wall: AoFalloff;
}

export const DEFAULT_AO_FIELD_OPTIONS: AoFieldOptions = {
  texelSize: 0.1,
  maxResolution: 512,
  wall: { radius: 0.7, strength: 0.6 },
};

/** Signed-distance range (m) the G channel encodes: byte 0 = `inside` m under the piece, 255 = `outside` m away. */
export const FURNITURE_FIELD_RANGE = { inside: 0.25, outside: 0.55 };

/**
 * Two-layer furniture contact shadow (sergi-gercekcilestirme.md Adım 11). The old single 0.35 m band over the
 * full footprint read as a blurry rectangle the piece hovered above. Real contact shadows are dark and tight
 * where the object meets the floor and fade into a wide, faint pool. Distances are to the footprint shrunk by
 * `inset` (a model's bounding footprint is wider than what actually touches the floor — legs, tapered
 * bases), with rounded corners so no shadow reads as a rectangle; round pieces get a disc/stadium.
 */
export const FURNITURE_CONTACT = {
  /** Footprint shrink per side (m), never below `minHalf` half-extent. */
  inset: 0.04,
  minHalf: 0.03,
  /** Corner radius of a box footprint, as a fraction of its shorter half-extent (round pieces: 1). */
  boxCorner: 0.3,
  /** Narrow dark core: full `strength` at `inner` m inside the (inset) edge, gone `outer` m outside. */
  core: { strength: 0.5, inner: -0.05, outer: 0.08 },
  /** Wide soft pool around it. */
  soft: { strength: 0.3, inner: -0.1, outer: 0.5 },
  /**
   * Share of the contact shadow applied to the floor's ceiling-fixture light (ceilingLight.ts) — the fixtures
   * hang overhead, so a piece blocks their light from the floor right under it. Without this the direct
   * term, now the main light, washes the AO-only shadow out. Not 1: there's no real visibility test, and
   * fixtures off to the side still reach under a raised seat.
   */
  ceilingLightShare: 0.75,
};

export interface AoField {
  /** Interleaved RG bytes (wall occlusion, furniture signed distance), row-major, row 0 = minZ, column 0 = minX. 255 = unoccluded / far away. */
  data: Uint8Array;
  width: number;
  height: number;
  minX: number;
  minZ: number;
  sizeX: number;
  sizeZ: number;
}

/** Horizontal (XZ) distance from a point to a wall's footprint rectangle; 0 inside it. */
export function distanceToWallFootprint(x: number, z: number, wall: WallSegment): number {
  const dx = Math.max(Math.abs(x - wall.position[0]) - wall.size[0] / 2, 0);
  const dz = Math.max(Math.abs(z - wall.position[2]) - wall.size[2] / 2, 0);
  return Math.hypot(dx, dz);
}

/**
 * Horizontal distance from a point to a furniture piece's ROTATED footprint; 0 inside it. Uses the
 * exact oriented rectangle rather than the collider's AABB, which for a 45°-rotated bench would cast a
 * visibly square, oversized shadow.
 */
export function distanceToFurnitureFootprint(x: number, z: number, piece: PlacedFurnitureInput): number {
  const dx = x - piece.x;
  const dz = z - piece.z;
  // Inverse of three's Y rotation (local→world: x = lx·cos + lz·sin, z = −lx·sin + lz·cos).
  const cos = Math.cos(piece.rotationY);
  const sin = Math.sin(piece.rotationY);
  const lx = dx * cos - dz * sin;
  const lz = dx * sin + dz * cos;
  const ox = Math.max(Math.abs(lx) - piece.halfWidth, 0);
  const oz = Math.max(Math.abs(lz) - piece.halfDepth, 0);
  return Math.hypot(ox, oz);
}

/** Footprint half-extents and corner radius after FURNITURE_CONTACT's inset/rounding. */
export function contactFootprint(piece: PlacedFurnitureInput): { hw: number; hd: number; r: number } {
  const hw = Math.max(piece.halfWidth - FURNITURE_CONTACT.inset, FURNITURE_CONTACT.minHalf);
  const hd = Math.max(piece.halfDepth - FURNITURE_CONTACT.inset, FURNITURE_CONTACT.minHalf);
  const r = Math.min(hw, hd) * (piece.round ? 1 : FURNITURE_CONTACT.boxCorner);
  return { hw, hd, r };
}

/**
 * Signed horizontal distance to a piece's contact footprint (inset, rounded, rotated): negative under it.
 * Rounded-rectangle SDF; with `round` it's a disc (square footprint) or a stadium.
 */
export function signedDistanceToFurniture(x: number, z: number, piece: PlacedFurnitureInput): number {
  const dx = x - piece.x;
  const dz = z - piece.z;
  const cos = Math.cos(piece.rotationY);
  const sin = Math.sin(piece.rotationY);
  const lx = dx * cos - dz * sin;
  const lz = dx * sin + dz * cos;
  const { hw, hd, r } = contactFootprint(piece);
  const qx = Math.abs(lx) - (hw - r);
  const qz = Math.abs(lz) - (hd - r);
  return Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0) - r;
}

/** G-channel byte for a signed distance (clamped to FURNITURE_FIELD_RANGE). */
export function encodeFurnitureDistance(d: number): number {
  const { inside, outside } = FURNITURE_FIELD_RANGE;
  return Math.round(Math.min(Math.max((d + inside) / (inside + outside), 0), 1) * 255);
}

/** Inverse of encodeFurnitureDistance for a 0..1 texture value. Mirrored in roomAoMaterial.ts. */
export function decodeFurnitureDistance(value: number): number {
  const { inside, outside } = FURNITURE_FIELD_RANGE;
  return value * (inside + outside) - inside;
}

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
};

/** Floor occlusion from a signed furniture distance: core × soft layer. Mirrored in roomAoMaterial.ts. */
export function furnitureContact(d: number): number {
  const { core, soft } = FURNITURE_CONTACT;
  return (
    (1 - core.strength * (1 - smoothstep(core.inner, core.outer, d))) *
    (1 - soft.strength * (1 - smoothstep(soft.inner, soft.outer, d)))
  );
}

/** Smooth falloff: `1 - strength` at the footprint, 1 at `radius` and beyond. Mirrors the shader's band function. */
export function occlusionAtDistance(distance: number, radius: number, strength: number): number {
  const t = Math.min(Math.max(distance / radius, 0), 1);
  const smooth = t * t * (3 - 2 * t);
  return 1 - strength * (1 - smooth);
}

/**
 * Ceiling response to the wall channel (sergi-gercekcilestirme.md Adım 5). The floor uses the field as-is —
 * a wide, fairly strong band is the right "wall stands on the floor" contact cue there. On the ceiling the
 * same band read as ~1 m soot stains along the top of every free-standing partition; a real wall↔ceiling
 * junction is a thin, faint line. So the ceiling remaps the field to a much narrower, weaker band.
 */
export const CEILING_AO = {
  /** Occlusion right at the wall (floor: DEFAULT_AO_FIELD_OPTIONS.wall.strength = 0.6). */
  strength: 0.3,
  /** Exponent on the field's 0..1 proximity term — 3 shrinks the visible band from ~0.7 m to ~0.3 m. */
  sharpness: 3,
};

/**
 * Ceiling occlusion from a wall-channel field value (0..1, 1 = unoccluded). Recovers the 0..1 proximity
 * term the field encoded with `fieldStrength`, sharpens and re-weights it. Mirrored in roomAoMaterial.ts's
 * ceiling shader branch — keep the two in sync.
 */
export function ceilingOcclusion(fieldValue: number, fieldStrength = DEFAULT_AO_FIELD_OPTIONS.wall.strength): number {
  const proximity = Math.min(Math.max((1 - fieldValue) / fieldStrength, 0), 1);
  return 1 - CEILING_AO.strength * Math.pow(proximity, CEILING_AO.sharpness);
}

export function buildRoomAoField(
  room: RoomFootprint,
  walls: WallSegment[],
  furniture: PlacedFurnitureInput[] = [],
  options: AoFieldOptions = DEFAULT_AO_FIELD_OPTIONS
): AoField {
  const [sizeX, sizeZ] = room.size;
  const minX = room.center[0] - sizeX / 2;
  const minZ = room.center[1] - sizeZ / 2;
  const width = Math.max(2, Math.min(options.maxResolution, Math.ceil(sizeX / options.texelSize)));
  const height = Math.max(2, Math.min(options.maxResolution, Math.ceil(sizeZ / options.texelSize)));

  // Walls farther than `radius` from the room's bounding box can never influence any texel — skipping
  // them up front keeps the per-texel loop to just the walls that matter.
  const reach = options.wall.radius;
  const relevantWalls = walls.filter(
    (w) =>
      w.position[0] + w.size[0] / 2 >= minX - reach &&
      w.position[0] - w.size[0] / 2 <= minX + sizeX + reach &&
      w.position[2] + w.size[2] / 2 >= minZ - reach &&
      w.position[2] - w.size[2] / 2 <= minZ + sizeZ + reach
  );

  const data = new Uint8Array(width * height * 2);
  for (let j = 0; j < height; j++) {
    const z = minZ + ((j + 0.5) / height) * sizeZ;
    for (let i = 0; i < width; i++) {
      const x = minX + ((i + 0.5) / width) * sizeX;

      let nearestWall = Infinity;
      for (const wall of relevantWalls) {
        const d = distanceToWallFootprint(x, z, wall);
        if (d < nearestWall) nearestWall = d;
        if (nearestWall === 0) break;
      }

      // Union of SDFs = min. Starts at the encodable maximum, so an empty room is 255 (unoccluded).
      let nearestFurniture = FURNITURE_FIELD_RANGE.outside;
      for (const piece of furniture) {
        const d = signedDistanceToFurniture(x, z, piece);
        if (d < nearestFurniture) nearestFurniture = d;
      }

      const o = (j * width + i) * 2;
      data[o] = Math.round(occlusionAtDistance(nearestWall, options.wall.radius, options.wall.strength) * 255);
      data[o + 1] = encodeFurnitureDistance(nearestFurniture);
    }
  }

  return { data, width, height, minX, minZ, sizeX, sizeZ };
}
