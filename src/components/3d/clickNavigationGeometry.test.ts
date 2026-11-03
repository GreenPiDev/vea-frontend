import { describe, expect, it } from "vitest";
import {
  angleDelta,
  collides,
  computeArtworkViewpoint,
  floorPointFromRay,
  hasLineOfSight,
  pickViewpoint,
  segmentEntryT,
  stepToward,
  wallBoxes,
  pickArtwork,
  walkableFloorPoint,
  estimateLookVelocity,
  zoomedFov,
  MAX_ZOOM,
  MARKER_DISTANCE,
} from "./clickNavigationGeometry";
import { EYE_HEIGHT, WALL_CLEARANCE, buildRoomLayout, type ColliderBox } from "./galleryLayout";
import type { Artwork } from "./artworks";

const room = buildRoomLayout([10, 10], 4);
const walls = wallBoxes(room);

const painting: Artwork = {
  id: "p",
  exhibitionId: "e",
  title: "t",
  artist: "a",
  year: "1900",
  image: "/a.jpg",
  aspect: 1.5,
  height: 1,
  position: [0, 1.6, -5 + WALL_CLEARANCE],
  rotationY: 0,
  frame: "gold",
} as Artwork;

describe("floorPointFromRay", () => {
  it("hits the floor for a downward ray", () => {
    const p = floorPointFromRay({ x: 0, y: 1.7, z: 0 }, { x: 0, y: -1, z: -1 });
    expect(p!.x).toBeCloseTo(0);
    expect(p!.z).toBeCloseTo(-1.7);
  });

  it("returns null at or above the horizon (walls, ceiling)", () => {
    expect(floorPointFromRay({ x: 0, y: 1.7, z: 0 }, { x: 1, y: 0.2, z: 0 })).toBeNull();
    expect(floorPointFromRay({ x: 0, y: 1.7, z: 0 }, { x: 1, y: 0, z: 0 })).toBeNull();
  });
});

describe("wall clipping", () => {
  const box: ColliderBox = { minX: 2, maxX: 3, minZ: -1, maxZ: 1 };

  it("finds where a segment enters a box", () => {
    expect(segmentEntryT({ x: 0, z: 0 }, { x: 4, z: 0 }, box)).toBeCloseTo(0.5);
    expect(segmentEntryT({ x: 0, z: 2 }, { x: 4, z: 2 }, box)).toBeNull();
    expect(segmentEntryT({ x: 0, z: 0 }, { x: 1, z: 0 }, box)).toBeNull();
  });

  it("checks line of sight against walls", () => {
    expect(hasLineOfSight({ x: 0, z: 0 }, { x: 3, z: 3 }, walls)).toBe(true);
    expect(hasLineOfSight({ x: 0, z: 0 }, { x: 8, z: 0 }, walls)).toBe(false);
  });
});

describe("walkableFloorPoint", () => {
  const eye = { x: 0, y: EYE_HEIGHT, z: 0 };

  it("accepts open floor", () => {
    const p = walkableFloorPoint(eye, { x: 0, y: -1, z: -1 }, walls, room.colliders);
    expect(p!.z).toBeCloseTo(-EYE_HEIGHT);
  });

  it("rejects a click on a wall (ray hits the wall before the floor)", () => {
    // Shallow downward ray toward the east wall (x = 5): it would only reach the floor at x ≈ 17.
    expect(walkableFloorPoint(eye, { x: 1, y: -0.1, z: 0 }, walls, room.colliders)).toBeNull();
  });

  it("rejects clicks above the horizon", () => {
    expect(walkableFloorPoint(eye, { x: 1, y: 0.3, z: 0 }, walls, room.colliders)).toBeNull();
  });

  it("rejects a click on furniture", () => {
    const bench: ColliderBox = { minX: -1, maxX: 1, minZ: -2.2, maxZ: -1.2 };
    expect(walkableFloorPoint(eye, { x: 0, y: -1, z: -1 }, walls, [...room.colliders, bench])).toBeNull();
  });
});

describe("computeArtworkViewpoint", () => {
  it("stands straight in front of the painting, facing it", () => {
    const vp = computeArtworkViewpoint(painting, room.colliders);
    expect(vp.x).toBeCloseTo(0);
    expect(vp.z).toBeGreaterThan(painting.position[2] + 1.2);
    expect(vp.z).toBeLessThanOrEqual(painting.position[2] + 3.2 + 1e-9);
    expect(vp.yaw).toBe(0);
    // Painting centre (1.6 m) is just below eye height → looking slightly down.
    expect(vp.pitch).toBeCloseTo(Math.atan2(1.6 - EYE_HEIGHT, vp.z - painting.position[2]));
    expect(collides(vp.x, vp.z, room.colliders)).toBe(false);
  });

  it("works on any wall (east wall, facing -X)", () => {
    const vp = computeArtworkViewpoint({ ...painting, position: [5 - WALL_CLEARANCE, 1.6, 1], rotationY: -Math.PI / 2 }, room.colliders);
    expect(vp.z).toBeCloseTo(1);
    expect(vp.x).toBeLessThan(5 - WALL_CLEARANCE - 1.2);
    expect(vp.yaw).toBe(-Math.PI / 2);
  });

  it("steps closer when furniture blocks the ideal spot", () => {
    const free = computeArtworkViewpoint(painting, room.colliders);
    const bench: ColliderBox = { minX: -1, maxX: 1, minZ: free.z - 0.3, maxZ: free.z + 0.3 };
    const vp = computeArtworkViewpoint(painting, [...room.colliders, bench]);
    expect(vp.z).toBeLessThan(free.z);
    expect(collides(vp.x, vp.z, [...room.colliders, bench])).toBe(false);
  });
});

describe("pickViewpoint", () => {
  const vp = computeArtworkViewpoint(painting, room.colliders);

  it("puts the marker at the painting's foot, the standing spot further back", () => {
    expect(vp.marker.x).toBeCloseTo(0);
    expect(vp.marker.z).toBeCloseTo(painting.position[2] + MARKER_DISTANCE);
    expect(vp.z).toBeGreaterThan(vp.marker.z + 0.5);
  });

  it("picks a marker the click lands on", () => {
    expect(pickViewpoint({ x: 0, z: 3 }, { x: vp.marker.x + 0.1, z: vp.marker.z }, [vp], 0.3, walls)).toBe(vp);
  });

  it("ignores clicks off the marker (including the standing spot itself)", () => {
    expect(pickViewpoint({ x: 0, z: 3 }, { x: vp.marker.x + 0.6, z: vp.marker.z }, [vp], 0.3, walls)).toBeNull();
    expect(pickViewpoint({ x: 0, z: 3 }, { x: vp.x, z: vp.z }, [vp], 0.3, walls)).toBeNull();
  });

  it("ignores markers hidden behind a wall", () => {
    const partition: ColliderBox = { minX: -2, maxX: 2, minZ: 0, maxZ: 0.3 };
    expect(pickViewpoint({ x: 0, z: 3 }, { x: vp.marker.x, z: vp.marker.z }, [vp], 0.3, [...walls, partition])).toBeNull();
  });
});

describe("angleDelta", () => {
  it("takes the short way round", () => {
    expect(angleDelta(0.1, Math.PI * 2 - 0.1)).toBeCloseTo(-0.2);
    expect(angleDelta(-3, 3)).toBeCloseTo(6 - Math.PI * 2);
    expect(angleDelta(1, 1)).toBe(0);
  });
});

describe("stepToward", () => {
  it("walks toward the target and arrives", () => {
    let pos = { x: 0, z: 0 };
    let arrived = false;
    for (let i = 0; i < 100 && !arrived; i++) {
      const r = stepToward(pos, { x: 2, z: 0 }, 0.1, room.colliders);
      pos = r;
      arrived = r.arrived;
    }
    expect(arrived).toBe(true);
    expect(pos).toMatchObject({ x: 2, z: 0 });
  });

  it("reports blocked when an obstacle sits square in the way", () => {
    const wall: ColliderBox = { minX: 1, maxX: 1.2, minZ: -3, maxZ: 3 };
    let pos = { x: 0, z: 0 };
    let blocked = false;
    for (let i = 0; i < 100 && !blocked; i++) {
      const r = stepToward(pos, { x: 3, z: 0 }, 0.1, [wall]);
      pos = r;
      blocked = r.blocked;
    }
    expect(blocked).toBe(true);
    expect(collides(pos.x, pos.z, [wall])).toBe(false);
  });
});

describe("estimateLookVelocity", () => {
  const swipe = [0, 20, 40, 60, 80].map((t) => ({ t, yaw: t * 0.002, pitch: 0 }));

  it("keeps the swipe's speed and direction on release", () => {
    const v = estimateLookVelocity(swipe, 90);
    expect(v.yaw).toBeCloseTo(2);
    expect(v.pitch).toBeCloseTo(0);
  });

  it("doesn't fling if the finger rested before lifting", () => {
    expect(estimateLookVelocity(swipe, 300)).toEqual({ yaw: 0, pitch: 0 });
  });

  it("only uses the last part of a slow-then-fast drag", () => {
    const samples = [
      { t: 0, yaw: 0, pitch: 0 },
      { t: 500, yaw: 0.01, pitch: 0 },
      { t: 550, yaw: 0.06, pitch: 0 },
    ];
    expect(estimateLookVelocity(samples, 555).yaw).toBeCloseTo(1);
  });

  it("caps very fast swipes", () => {
    const v = estimateLookVelocity([{ t: 0, yaw: 0, pitch: 0 }, { t: 20, yaw: 1, pitch: 0 }], 25);
    expect(Math.hypot(v.yaw, v.pitch)).toBeCloseTo(5);
  });
});

describe("zoomedFov", () => {
  const half = (deg: number) => Math.tan((deg * Math.PI) / 360);

  it("magnifies by the pinch scale", () => {
    const fov = zoomedFov(65, 65, 2);
    expect(half(65) / half(fov)).toBeCloseTo(2);
  });

  it("never zooms out past the normal view", () => {
    expect(zoomedFov(65, 50, 0.1)).toBeCloseTo(65);
  });

  it("stops at the maximum magnification", () => {
    const fov = zoomedFov(65, 65, 100);
    expect(half(65) / half(fov)).toBeCloseTo(MAX_ZOOM);
  });
});

describe("pickArtwork", () => {
  // `painting`: 1.5 × 1 m, centred at (0, 1.6) on the north wall, facing +Z.
  const eye = { x: 0, y: EYE_HEIGHT, z: 2 };
  const toward = (x: number, y: number, z: number) => {
    const d = { x: x - eye.x, y: y - eye.y, z: z - eye.z };
    const len = Math.hypot(d.x, d.y, d.z);
    return { x: d.x / len, y: d.y / len, z: d.z / len };
  };
  const pz = painting.position[2];

  it("hits a painting the ray points at", () => {
    const hit = pickArtwork(eye, toward(0.3, 1.5, pz), [painting], walls, 0.07);
    expect(hit?.artwork).toBe(painting);
    expect(hit!.distance).toBeGreaterThan(0);
  });

  it("counts the frame as part of the painting", () => {
    expect(pickArtwork(eye, toward(0.79, 1.6, pz), [painting], walls, 0.07)).not.toBeNull();
    expect(pickArtwork(eye, toward(0.79, 1.6, pz), [{ ...painting, frame: null } as Artwork], walls, 0.07)).toBeNull();
  });

  it("misses beside the painting", () => {
    expect(pickArtwork(eye, toward(1.2, 1.6, pz), [painting], walls, 0.07)).toBeNull();
    expect(pickArtwork(eye, toward(0, 2.4, pz), [painting], walls, 0.07)).toBeNull();
  });

  it("ignores paintings seen from behind", () => {
    const behind = { x: 0, y: EYE_HEIGHT, z: pz - 2 };
    const dir = { x: 0, y: 0, z: 1 };
    expect(pickArtwork(behind, dir, [painting], [], 0.07)).toBeNull();
  });

  it("ignores paintings hidden behind a wall", () => {
    const partition: ColliderBox = { minX: -2, maxX: 2, minZ: 0, maxZ: 0.3 };
    expect(pickArtwork(eye, toward(0, 1.6, pz), [painting], [...walls, partition], 0.07)).toBeNull();
  });

  it("picks the nearest of overlapping paintings", () => {
    const near = { ...painting, id: "near", position: [0, 1.6, -1] as [number, number, number] };
    expect(pickArtwork(eye, toward(0, 1.6, pz), [painting, near], walls, 0.07)?.artwork.id).toBe("near");
  });
});
