// Static geometry rules shared by every exhibition room. Each exhibition is
// its own standalone rectangular room (see exhibitions.ts for per-exhibition
// size/theme), built on demand by buildRoomLayout() below so room geometry,
// collision and ceiling lighting all stay derived from one place instead of
// being hand-authored per room.

export const WALL_THICKNESS = 0.3;
export const EYE_HEIGHT = 1.7;
export const PLAYER_RADIUS = 0.4;

/** Clearance a wall-mounted artwork sits outside the wall's inner face. */
export const WALL_CLEARANCE = WALL_THICKNESS / 2 + 0.07;

export interface WallSegment {
  id: string;
  /** Center position [x, y, z] */
  position: [number, number, number];
  /** [width (x), height (y), depth (z)] */
  size: [number, number, number];
}

export interface RoomFootprint {
  id: string;
  /** Center position of the floor/ceiling plane [x, z] */
  center: [number, number];
  /** [width (x), depth (z)] */
  size: [number, number];
}

/** Axis-aligned collider boxes for the player controller. */
export interface ColliderBox {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface RoomLayout {
  wallHeight: number;
  room: RoomFootprint;
  walls: WallSegment[];
  colliders: ColliderBox[];
  ceilingSpots: [number, number, number][];
  playerStart: [number, number, number];
  /** Initial camera yaw in radians (0 = facing -Z, matching Three.js's default camera forward). */
  playerStartYaw: number;
}

/** Builds a fully enclosed single-room layout for a given [width, depth] and ceiling height. */
export function buildRoomLayout(size: [number, number], wallHeight: number): RoomLayout {
  const [W, D] = size;
  const H = wallHeight;
  const T = WALL_THICKNESS;

  const walls: WallSegment[] = [
    { id: "north", position: [0, H / 2, -D / 2], size: [W, H, T] },
    { id: "south", position: [0, H / 2, D / 2], size: [W, H, T] },
    { id: "east", position: [W / 2, H / 2, 0], size: [T, H, D] },
    { id: "west", position: [-W / 2, H / 2, 0], size: [T, H, D] },
  ];

  const colliders: ColliderBox[] = walls.map((w) => ({
    minX: w.position[0] - w.size[0] / 2,
    maxX: w.position[0] + w.size[0] / 2,
    minZ: w.position[2] - w.size[2] / 2,
    maxZ: w.position[2] + w.size[2] / 2,
  }));

  // Sparse ceiling grid for ambient fill only — per-painting spotlights (see
  // Artwork.tsx's ArtworkLight) do the actual highlighting, so this stays
  // deliberately light on light count for FPS headroom on modest devices.
  const cols = Math.min(3, Math.max(2, Math.round(W / 8)));
  const rows = Math.min(3, Math.max(2, Math.round(D / 8)));
  const ceilingSpots: [number, number, number][] = [];
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const x = -W / 2 + (W / cols) * (i + 0.5);
      const z = -D / 2 + (D / rows) * (j + 0.5);
      ceilingSpots.push([x, H - 0.1, z]);
    }
  }

  return {
    wallHeight: H,
    room: { id: "room", center: [0, 0], size: [W, D] },
    walls,
    colliders,
    ceilingSpots,
    playerStart: [0, EYE_HEIGHT, D / 2 - 2],
    playerStartYaw: 0,
  };
}

// --- Custom (user-drawn) room support -------------------------------------
// A custom room is a set of unit (1m x 1m) floor cells on an integer grid —
// cell (x, z) occupies world space [x, x+1] x [z, z+1]. Walls are derived by
// walking every occupied cell's four neighbors: any side whose neighbor cell
// is NOT occupied is a boundary edge, and adjacent boundary edges (same line,
// same facing) are merged into a single straight wall run. This lets the
// footprint be any orthogonal shape (L-shapes, notches, etc.), not just a
// rectangle, while reusing the exact same RoomLayout consumed by
// GalleryRoom/Baseboards/GalleryLights/Player.

export interface GridCell {
  x: number;
  z: number;
}

/** A merged straight wall run on the boundary of a custom footprint. */
export interface CustomWallRun extends WallSegment {
  orientation: "horizontal" | "vertical";
  /** Start/end coordinate along the run's axis (x for horizontal, z for vertical). */
  start: number;
  end: number;
  /** Fixed coordinate of the run's line (z for horizontal, x for vertical). */
  fixed: number;
  /** Which side the empty/exterior cell is on: -1 or +1 along the fixed axis. */
  outward: -1 | 1;
}

interface RawEdge {
  orientation: "horizontal" | "vertical";
  fixed: number;
  start: number;
  end: number;
  outward: -1 | 1;
}

function makeWallRun(e: RawEdge, id: number, wallHeight: number): CustomWallRun {
  const T = WALL_THICKNESS;
  const length = e.end - e.start;
  if (e.orientation === "horizontal") {
    const cx = (e.start + e.end) / 2;
    return {
      id: `wall-${id}`,
      position: [cx, wallHeight / 2, e.fixed],
      size: [length, wallHeight, T],
      orientation: "horizontal",
      start: e.start,
      end: e.end,
      fixed: e.fixed,
      outward: e.outward,
    };
  }
  const cz = (e.start + e.end) / 2;
  return {
    id: `wall-${id}`,
    position: [e.fixed, wallHeight / 2, cz],
    size: [T, wallHeight, length],
    orientation: "vertical",
    start: e.start,
    end: e.end,
    fixed: e.fixed,
    outward: e.outward,
  };
}

/** User-chosen spawn cell + facing, overriding the automatic centroid-nearest pick. */
export interface SpawnOverride {
  x: number;
  z: number;
  /** Yaw in radians: 0 = north (-Z), PI = south (+Z), PI/2 = west (-X), -PI/2 = east (+X). */
  yaw: number;
}

/** Builds a RoomLayout for an arbitrary orthogonal footprint made of unit cells. */
export function buildCustomRoomLayout(
  cells: GridCell[],
  wallHeight: number,
  spawnOverride?: SpawnOverride
): { layout: RoomLayout; wallRuns: CustomWallRun[] } {
  const occupied = new Set(cells.map((c) => `${c.x},${c.z}`));
  const edges: RawEdge[] = [];
  for (const { x, z } of cells) {
    if (!occupied.has(`${x},${z - 1}`))
      edges.push({ orientation: "horizontal", fixed: z, start: x, end: x + 1, outward: -1 });
    if (!occupied.has(`${x},${z + 1}`))
      edges.push({ orientation: "horizontal", fixed: z + 1, start: x, end: x + 1, outward: 1 });
    if (!occupied.has(`${x - 1},${z}`))
      edges.push({ orientation: "vertical", fixed: x, start: z, end: z + 1, outward: -1 });
    if (!occupied.has(`${x + 1},${z}`))
      edges.push({ orientation: "vertical", fixed: x + 1, start: z, end: z + 1, outward: 1 });
  }

  const groups = new Map<string, RawEdge[]>();
  for (const e of edges) {
    const key = `${e.orientation}|${e.fixed}|${e.outward}`;
    const list = groups.get(key);
    if (list) list.push(e);
    else groups.set(key, [e]);
  }

  const wallRuns: CustomWallRun[] = [];
  let runId = 0;
  for (const group of groups.values()) {
    group.sort((a, b) => a.start - b.start);
    let cur = { ...group[0] };
    for (let i = 1; i < group.length; i++) {
      const e = group[i];
      if (e.start === cur.end) {
        cur.end = e.end;
      } else {
        wallRuns.push(makeWallRun(cur, runId++, wallHeight));
        cur = { ...e };
      }
    }
    wallRuns.push(makeWallRun(cur, runId++, wallHeight));
  }

  const xs = cells.flatMap((c) => [c.x, c.x + 1]);
  const zs = cells.flatMap((c) => [c.z, c.z + 1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minZ = Math.min(...zs);
  const maxZ = Math.max(...zs);
  const W = maxX - minX;
  const D = maxZ - minZ;

  const colliders: ColliderBox[] = wallRuns.map((w) => ({
    minX: w.position[0] - w.size[0] / 2,
    maxX: w.position[0] + w.size[0] / 2,
    minZ: w.position[2] - w.size[2] / 2,
    maxZ: w.position[2] + w.size[2] / 2,
  }));

  // Sparse ceiling grid, same density rule as buildRoomLayout, but skipped
  // over any grid cell that falls outside the drawn footprint.
  const cols = Math.min(3, Math.max(1, Math.round(W / 8)));
  const rows = Math.min(3, Math.max(1, Math.round(D / 8)));
  const ceilingSpots: [number, number, number][] = [];
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const x = minX + (W / cols) * (i + 0.5);
      const z = minZ + (D / rows) * (j + 0.5);
      const cellX = Math.floor(x);
      const cellZ = Math.floor(z);
      if (occupied.has(`${cellX},${cellZ}`)) {
        ceilingSpots.push([x, wallHeight - 0.1, z]);
      }
    }
  }
  if (ceilingSpots.length === 0) {
    const [{ x, z }] = cells;
    ceilingSpots.push([x + 0.5, wallHeight - 0.1, z + 0.5]);
  }

  // Player starts on the occupied cell closest to the footprint's centroid,
  // unless the builder passed an explicit user-chosen spawn cell + facing.
  const centerX = (minX + maxX) / 2;
  const centerZ = (minZ + maxZ) / 2;
  let start = cells[0];
  let bestDist = Infinity;
  for (const c of cells) {
    const cx = c.x + 0.5;
    const cz = c.z + 0.5;
    const d = (cx - centerX) ** 2 + (cz - centerZ) ** 2;
    if (d < bestDist) {
      bestDist = d;
      start = c;
    }
  }
  if (spawnOverride) start = spawnOverride;

  const layout: RoomLayout = {
    wallHeight,
    room: { id: "room", center: [centerX, centerZ], size: [W, D] },
    walls: wallRuns.map(({ id, position, size }) => ({ id, position, size })),
    colliders,
    ceilingSpots,
    playerStart: [start.x + 0.5, EYE_HEIGHT, start.z + 0.5],
    playerStartYaw: spawnOverride?.yaw ?? 0,
  };

  return { layout, wallRuns };
}
