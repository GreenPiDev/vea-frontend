// Pure geometry helpers for the seating interaction layer — no R3F/Three
// imports, so this is unit-testable in isolation (see galleryLayout.ts for
// the same convention). Consumed by backendAdapter.ts (producing SeatSpot[])
// and SeatProximityTracker.tsx (finding the nearest one each frame).

export interface SeatSpot {
  id: string;
  x: number;
  z: number;
  rotationY: number;
}

/** Floor-plane distance within which a seat's "Otur (Enter)" hint appears. */
export const SEAT_INTERACT_RADIUS = 1.5;

export function findNearestSeat(
  seats: SeatSpot[],
  x: number,
  z: number
): { seat: SeatSpot; distanceSq: number } | null {
  const radiusSq = SEAT_INTERACT_RADIUS * SEAT_INTERACT_RADIUS;
  let nearest: { seat: SeatSpot; distanceSq: number } | null = null;
  for (const seat of seats) {
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
