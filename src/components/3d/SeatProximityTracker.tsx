// Mirrors ArtworkIconProjector.tsx's throttle pattern (~10Hz, inside the
// Canvas for camera access), but deliberately skips the screen-space
// projection half (no vector.project(camera)/behindCamera/OFFSCREEN_MARGIN
// handling) — the seat hint is a fixed bottom-center HUD pill, not a
// floating marker anchored over the chair. v1 simplification, see
// seating.ts's design note.
import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { findNearestSeat, type SeatSpot } from "./seating";

const UPDATE_INTERVAL = 0.1;

interface SeatProximityTrackerProps {
  seats: SeatSpot[];
  /** True while already seated — no need to keep tracking proximity to the seat we're sitting in. */
  disabled: boolean;
  onNearestSeatChange: (seat: SeatSpot | null) => void;
}

export default function SeatProximityTracker({ seats, disabled, onNearestSeatChange }: SeatProximityTrackerProps) {
  const lastUpdate = useRef(0);
  const lastSeatId = useRef<string | null>(null);

  useFrame(({ camera, clock }) => {
    if (disabled) return;
    if (clock.elapsedTime - lastUpdate.current < UPDATE_INTERVAL) return;
    lastUpdate.current = clock.elapsedTime;

    const nearest = findNearestSeat(seats, camera.position.x, camera.position.z);
    const nextId = nearest?.seat.id ?? null;
    if (nextId === lastSeatId.current) return;
    lastSeatId.current = nextId;
    onNearestSeatChange(nearest?.seat ?? null);
  });

  return null;
}
