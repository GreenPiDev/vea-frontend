import { describe, expect, it } from "vitest";
import { findNearestSeat, SEAT_INTERACT_RADIUS, type SeatSpot } from "./seating";

describe("findNearestSeat", () => {
  it("returns null for an empty seat list", () => {
    expect(findNearestSeat([], 0, 0)).toBeNull();
  });

  it("returns null when the only seat is outside the interact radius", () => {
    const seats: SeatSpot[] = [{ id: "a", x: SEAT_INTERACT_RADIUS + 1, z: 0, rotationY: 0 }];
    expect(findNearestSeat(seats, 0, 0)).toBeNull();
  });

  it("returns the seat when just inside the interact radius", () => {
    const seats: SeatSpot[] = [{ id: "a", x: SEAT_INTERACT_RADIUS - 0.1, z: 0, rotationY: 0 }];
    const result = findNearestSeat(seats, 0, 0);
    expect(result?.seat.id).toBe("a");
  });

  it("picks the closer of two in-range seats", () => {
    const seats: SeatSpot[] = [
      { id: "far", x: 1, z: 0, rotationY: 0 },
      { id: "near", x: 0.3, z: 0, rotationY: 0 },
    ];
    const result = findNearestSeat(seats, 0, 0);
    expect(result?.seat.id).toBe("near");
  });

  it("ignores an out-of-range seat even if it's the only other option", () => {
    const seats: SeatSpot[] = [
      { id: "near", x: 0.3, z: 0, rotationY: 0 },
      { id: "far", x: SEAT_INTERACT_RADIUS + 5, z: 0, rotationY: 0 },
    ];
    const result = findNearestSeat(seats, 0, 0);
    expect(result?.seat.id).toBe("near");
  });

  it("is deterministic when two seats are equidistant (keeps the first encountered)", () => {
    const seats: SeatSpot[] = [
      { id: "first", x: 0.5, z: 0, rotationY: 0 },
      { id: "second", x: -0.5, z: 0, rotationY: 0 },
    ];
    const result = findNearestSeat(seats, 0, 0);
    expect(result?.seat.id).toBe("first");
  });
});
