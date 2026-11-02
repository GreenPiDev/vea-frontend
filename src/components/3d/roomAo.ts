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
//   G — occlusion from the nearest FURNITURE footprint (floor only: a bench next to a wall must not
//       darken that wall all the way up to the ceiling, which it would if both lived in one channel)
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
  /** Tighter and slightly weaker than walls: furniture is low, so its contact shadow is a small pool. */
  furniture: AoFalloff;
}

export const DEFAULT_AO_FIELD_OPTIONS: AoFieldOptions = {
  texelSize: 0.1,
  maxResolution: 512,
  wall: { radius: 0.7, strength: 0.6 },
  furniture: { radius: 0.35, strength: 0.55 },
};

export interface AoField {
  /** Interleaved RG bytes (wall, furniture), row-major, row 0 = minZ, column 0 = minX. 255 = unoccluded. */
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

/** Smooth falloff: `1 - strength` at the footprint, 1 at `radius` and beyond. Mirrors the shader's band function. */
export function occlusionAtDistance(distance: number, radius: number, strength: number): number {
  const t = Math.min(Math.max(distance / radius, 0), 1);
  const smooth = t * t * (3 - 2 * t);
  return 1 - strength * (1 - smooth);
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

      let nearestFurniture = Infinity;
      for (const piece of furniture) {
        const d = distanceToFurnitureFootprint(x, z, piece);
        if (d < nearestFurniture) nearestFurniture = d;
        if (nearestFurniture === 0) break;
      }

      const o = (j * width + i) * 2;
      data[o] = Math.round(occlusionAtDistance(nearestWall, options.wall.radius, options.wall.strength) * 255);
      data[o + 1] = Math.round(
        occlusionAtDistance(nearestFurniture, options.furniture.radius, options.furniture.strength) * 255
      );
    }
  }

  return { data, width, height, minX, minZ, sizeX, sizeZ };
}
