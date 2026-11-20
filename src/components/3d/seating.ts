// Pure geometry helpers for the seating interaction layer — no R3F/Three
// imports, so this is unit-testable in isolation (see galleryLayout.ts for
// the same convention). Consumed by backendAdapter.ts (producing SeatSpot[])
// and SeatProximityTracker.tsx (finding the nearest one each frame).

export interface SeatSpot {
  id: string;
  x: number;
  z: number;
  rotationY: number;
  /** Floor height of the seat (m): the mezzanine's top for a seat on it, else 0/unset. */
  y?: number;
}

/** Floor-plane distance within which a seat's "Otur (Enter)" hint appears. */
export const SEAT_INTERACT_RADIUS = 1.5;

export function findNearestSeat(
  seats: SeatSpot[],
  x: number,
  z: number,
  /** Visitor's floor height — a seat on another level (a mezzanine above/below) is never "nearest". */
  floorY = 0
): { seat: SeatSpot; distanceSq: number } | null {
  const radiusSq = SEAT_INTERACT_RADIUS * SEAT_INTERACT_RADIUS;
  let nearest: { seat: SeatSpot; distanceSq: number } | null = null;
  for (const seat of seats) {
    if (Math.abs((seat.y ?? 0) - floorY) > 1) continue;
    const dx = seat.x - x;
    const dz = seat.z - z;
    const distanceSq = dx * dx + dz * dz;
    if (distanceSq > radiusSq) continue;
    if (!nearest || distanceSq < nearest.distanceSq) {
      nearest = { seat, distanceSq };
    }
  }
  return nearest;
}
