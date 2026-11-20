import { describe, expect, it } from "vitest";
import { planRoute, routeSpeed, startRouteWalk, ROUTE_MAX_SPEED, ROUTE_MIN_SPEED, type PlannedRoute } from "./routePlanner";
import { collides, createNavigationRequest, wallBoxes, type ArtworkViewpoint, type FloorPoint } from "./clickNavigationGeometry";
import { buildRoomLayout, type ColliderBox } from "./galleryLayout";

// 10 × 10 m room, walls only (x, z ∈ [-5, 5]).
const room = buildRoomLayout([10, 10], 4);
const walls = wallBoxes(room);

/** True when walking every leg of the route in small steps never puts the visitor inside a collider. */
function routeIsClear(from: FloorPoint, route: PlannedRoute, colliders: ColliderBox[]): boolean {
  let prev = from;
  for (const p of route.points) {
    const len = Math.hypot(p.x - prev.x, p.z - prev.z);
    const steps = Math.max(1, Math.ceil(len / 0.02));
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      if (collides(prev.x + (p.x - prev.x) * t, prev.z + (p.z - prev.z) * t, colliders)) return false;
    }
    prev = p;
  }
  return true;
}

describe("planRoute", () => {
  it("walks straight when nothing is in the way", () => {
    const from = { x: 0, z: 3 };
    const to = { x: 2, z: -3 };
    const route = planRoute(from, to, walls, walls);
    expect(route.points).toEqual([to]);
    expect(route.passThrough).toBe(false);
  });

  it("goes around a bench standing between the visitor and the painting", () => {
    const bench: ColliderBox = { minX: -1, maxX: 1, minZ: -0.3, maxZ: 0.3 };
    const colliders = [...walls, bench];
    const from = { x: 0, z: 3 };
    const to = { x: 0, z: -3 };
    const route = planRoute(from, to, colliders, walls);
    expect(route.passThrough).toBe(false);
    expect(route.points.length).toBeGreaterThan(1);
    expect(route.points[route.points.length - 1]).toEqual(to);
    expect(routeIsClear(from, route, colliders)).toBe(true);
  });

  it("string-pulls the grid path down to a few corners", () => {
    const bench: ColliderBox = { minX: -1, maxX: 1, minZ: -0.3, maxZ: 0.3 };
    const route = planRoute({ x: 0, z: 3 }, { x: 0, z: -3 }, [...walls, bench], walls);
    // Round one end of the bench: a couple of corners, not a 0.2 m staircase.
    expect(route.points.length).toBeLessThanOrEqual(4);
  });

  it("finds the doorway in a partition wall", () => {
    // Partition across the room at z = 0 with a 1.4 m gap at x ∈ [2.5, 3.9].
    const left: ColliderBox = { minX: -5, maxX: 2.5, minZ: -0.1, maxZ: 0.1 };
    const right: ColliderBox = { minX: 3.9, maxX: 5, minZ: -0.1, maxZ: 0.1 };
    const colliders = [...walls, left, right];
    const from = { x: -3, z: 3 };
    const to = { x: -3, z: -3 };
    const route = planRoute(from, to, colliders, [...walls, left, right]);
    expect(route.passThrough).toBe(false);
    expect(routeIsClear(from, route, colliders)).toBe(true);
    // It has to cross z = 0 inside the gap.
    const crossing = route.points.some((p) => p.x > 2.5 && p.x < 3.9);
    expect(crossing).toBe(true);
  });

  it("passes through furniture when it fences the painting in completely", () => {
    // A U of benches closing off the area in front of the north wall around x = 0.
    const fence: ColliderBox[] = [
      { minX: -2, maxX: 2, minZ: -2.5, maxZ: -2.2 },
      { minX: -2, maxX: -1.7, minZ: -5, maxZ: -2.2 },
      { minX: 1.7, maxX: 2, minZ: -5, maxZ: -2.2 },
    ];
    const colliders = [...walls, ...fence];
    const route = planRoute({ x: 0, z: 3 }, { x: 0, z: -4 }, colliders, walls);
    expect(route.passThrough).toBe(true);
    expect(route.points[route.points.length - 1]).toEqual({ x: 0, z: -4 });
  });

  it("still plans a route when starting inside furniture (standing up from a seat)", () => {
    const bench: ColliderBox = { minX: -1, maxX: 1, minZ: 1.7, maxZ: 2.3 };
    const route = planRoute({ x: 0, z: 2 }, { x: 0, z: -3 }, [...walls, bench], walls);
    expect(route.points[route.points.length - 1]).toEqual({ x: 0, z: -3 });
    expect(route.passThrough).toBe(true);
  });

  it("falls back to a straight line when the walls leave no way through", () => {
    const sealed: ColliderBox = { minX: -5, maxX: 5, minZ: -0.1, maxZ: 0.1 };
    const route = planRoute({ x: 0, z: 3 }, { x: 0, z: -3 }, [...walls, sealed], [...walls, sealed]);
    expect(route).toEqual({ points: [{ x: 0, z: -3 }], passThrough: true });
  });
});

describe("routeSpeed", () => {
  it("is quick on short hops (well above the 2 m/s stroll) and quicker across a hall, within bounds", () => {
    expect(routeSpeed(1)).toBe(ROUTE_MIN_SPEED);
    expect(ROUTE_MIN_SPEED).toBeGreaterThan(2);
    expect(routeSpeed(7)).toBeGreaterThan(ROUTE_MIN_SPEED);
    expect(routeSpeed(7)).toBeLessThan(ROUTE_MAX_SPEED);
    expect(routeSpeed(200)).toBe(ROUTE_MAX_SPEED);
  });
});

describe("startRouteWalk", () => {
  const viewpoint: ArtworkViewpoint = { artworkId: "a", marker: { x: 0, z: -4.4 }, x: 0, z: -3, yaw: 0, pitch: -0.05 };

  it("turns to the painting straight away on a direct walk", () => {
    const nav = createNavigationRequest();
    startRouteWalk(nav, { x: 0, z: 3 }, viewpoint, walls, walls);
    expect(nav.target).toEqual({ x: 0, z: -3 });
    expect(nav.waypoints).toEqual([]);
    expect(nav.look).toEqual({ yaw: 0, pitch: -0.05 });
    expect(nav.mustArrive).toBe(true);
    expect(nav.faceHeading).toBe(false);
  });

  it("follows the walking direction around corners and keeps the painting view for the last leg", () => {
    const bench: ColliderBox = { minX: -1, maxX: 1, minZ: -0.3, maxZ: 0.3 };
    const nav = createNavigationRequest();
    startRouteWalk(nav, { x: 0, z: 3 }, viewpoint, [...walls, bench], walls);
    expect(nav.waypoints.length).toBeGreaterThan(0);
    expect(nav.look).toBeNull();
    expect(nav.arrivalLook).toEqual({ yaw: 0, pitch: -0.05 });
    expect(nav.faceHeading).toBe(true);
  });

  it("replaces a walk already in progress", () => {
    const nav = createNavigationRequest();
    nav.target = { x: 4, z: 4 };
    nav.waypoints = [{ x: 1, z: 1 }];
    nav.arrivalLook = { yaw: 1, pitch: 0 };
    startRouteWalk(nav, { x: 0, z: 3 }, viewpoint, walls, walls);
    expect(nav.waypoints).toEqual([]);
    expect(nav.arrivalLook).toBeNull();
  });
});
