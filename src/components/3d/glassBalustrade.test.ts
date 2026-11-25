import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { buildRoomLayout } from "./galleryLayout";
import { FACADE_OFFSET, RAILING_HEIGHT, balconyGeometries } from "./balcony";
import {
  GLASS_BOTTOM,
  GLASS_POST_GAP,
  GLASS_TOP,
  HANDRAIL_RADIUS,
  POST_MAX_SPACING,
  POST_SIZE,
  BASE_PLATE,
  BalustradeBuilder,
  balustradeGeometry,
  chainRuns,
  glassPanels,
  postsPerSegment,
} from "./glassBalustrade";
import { SweepBuilder, arc } from "./profileSweep";
import { CONCEPT_EXHIBITIONS } from "./conceptRooms";

/** 12 × 8 room: a 3.2 × 1.8 m balcony on the south wall (+z), outer face z = 4.15. */
const layout = buildRoomLayout([12, 8], 3.6, undefined, undefined, [
  { id: "b", wallId: "south", alongFraction: 0.5, width: 1.4, height: 2.6, sillHeight: 0, styleId: "balcony", balconyWidth: 3.2, balconyDepth: 1.8 },
]);
const balcony = balconyGeometries(layout.windows)[0];
const FACE = 4.15;

const dist = (a: [number, number], b: [number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1]);

describe("glass balustrade layout", () => {
  it("chains the three runs into one line from the facade, round the edge, back to the facade", () => {
    const chains = chainRuns(balcony.railings);
    expect(chains).toHaveLength(1);
    expect(chains[0]).toHaveLength(4);
  });

  it("puts a post off the facade at each end, on every corner, and never more than 1.3 m apart", () => {
    const segments = postsPerSegment(chainRuns(balcony.railings)[0], FACADE_OFFSET, FACADE_OFFSET);
    expect(segments).toHaveLength(3);
    const first = segments[0][0];
    expect(first[1] - FACE).toBeGreaterThan(FACADE_OFFSET + POST_SIZE / 2);
    // Corners shared by neighbouring segments.
    expect(dist(segments[0][segments[0].length - 1], segments[1][0])).toBeCloseTo(0);
    for (const seg of segments) for (let i = 1; i < seg.length; i++) expect(dist(seg[i], seg[i - 1])).toBeLessThanOrEqual(POST_MAX_SPACING + 1e-9);
  });

  it("hangs glass between posts with a clamping gap, clear of the floor and under the handrail", () => {
    for (const seg of postsPerSegment(chainRuns(balcony.railings)[0], FACADE_OFFSET, FACADE_OFFSET)) {
      const panels = glassPanels(seg);
      expect(panels).toHaveLength(seg.length - 1);
      panels.forEach(([a, b], i) => {
        expect(dist(a, seg[i])).toBeCloseTo(POST_SIZE / 2 + GLASS_POST_GAP);
        expect(dist(b, seg[i + 1])).toBeCloseTo(POST_SIZE / 2 + GLASS_POST_GAP);
      });
    }
    expect(GLASS_BOTTOM).toBeLessThanOrEqual(0.1); // no gap a child's head fits through
    expect(GLASS_TOP).toBeLessThan(RAILING_HEIGHT - 2 * HANDRAIL_RADIUS);
  });

  it("stays on the platform, in front of the facade, and tops out at the railing height", () => {
    const g = balustradeGeometry(balcony.railings, { wallGapAt: () => FACADE_OFFSET })!;
    for (const geo of [g.solid, g.glass]) {
      geo.computeBoundingBox();
      const box = geo.boundingBox!;
      expect(box.min.z).toBeGreaterThanOrEqual(FACE + FACADE_OFFSET - 1e-6);
      expect(box.max.z).toBeLessThanOrEqual(balcony.floor.maxZ + 1e-6);
      expect(box.min.x).toBeGreaterThanOrEqual(balcony.floor.minX - 1e-6);
      expect(box.max.x).toBeLessThanOrEqual(balcony.floor.maxX + 1e-6);
      expect(box.min.y).toBeGreaterThanOrEqual(-1e-6);
      expect(box.max.y).toBeLessThanOrEqual(RAILING_HEIGHT + 0.02); // the wall flange stands a little proud of the tube
    }
    expect(g.solid.attributes.color).toBeDefined();
    expect(g.glass.attributes.position.count).toBeGreaterThan(0);
  });
});

describe("sweepPolyline", () => {
  it("mitres a 90° corner exactly: the tube's bounds are the path's grown by its radius", () => {
    const r = 0.05;
    const b = new SweepBuilder();
    b.sweepPolyline(
      [
        [0, 1, 0],
        [2, 1, 0],
        [2, 1, 3],
      ],
      arc(0, 0, r, 0, Math.PI * 2, 32),
      new THREE.Color(1, 1, 1),
      true
    );
    const g = b.toGeometry();
    const box = g.boundingBox!;
    expect(box.min.x).toBeCloseTo(0, 6); // capped ends: flat at the path's ends
    expect(box.max.x).toBeCloseTo(2 + r, 6);
    expect(box.min.z).toBeCloseTo(-r, 6);
    expect(box.max.z).toBeCloseTo(3, 6);
    expect(box.max.y).toBeCloseTo(1 + r, 6);
  });
});

describe("mezzanine balustrades (vitrin-11)", () => {
  const ex = CONCEPT_EXHIBITIONS.find((e) => e.id === "vitrin-11")!;
  const m = ex.customLayout!.mezzanine!;

  it("chains runs that meet end to end, whichever way round they were listed", () => {
    const chains = chainRuns([
      { from: [0, 0], to: [2, 0] },
      { from: [2, 3], to: [2, 0] },
    ]);
    expect(chains).toHaveLength(1);
    expect(chains[0]).toEqual([
      [0, 0],
      [2, 0],
      [2, 3],
    ]);
  });

  it("stands the slab balustrade on the slab, a flange at the wall, nothing hanging over the stair gap", () => {
    const [r] = m.railings;
    const xs = [r.from[0], r.to[0]];
    const wallEnd = Math.min(...xs); // the west wall's inner face
    const stairEnd = Math.max(...xs); // the free end at the stair
    const gap = (p: [number, number]) => (Math.abs(p[0] - wallEnd) < 1e-6 ? 0 : null);
    const [seg] = postsPerSegment(chainRuns(m.railings)[0], gap(chainRuns(m.railings)[0][0]), gap(chainRuns(m.railings)[0][1]));
    const ends = [seg[0][0], seg[seg.length - 1][0]].sort((a, b) => a - b);
    expect(ends[0] - wallEnd).toBeGreaterThan(POST_SIZE); // off the wall
    expect(stairEnd - ends[1]).toBeCloseTo(BASE_PLATE / 2); // its base plate flush with the free end

    const g = balustradeGeometry(m.railings, { baseY: m.top, wallGapAt: gap })!;
    g.solid.computeBoundingBox();
    const box = g.solid.boundingBox!;
    expect(box.min.y).toBeCloseTo(m.top, 6);
    expect(box.max.y).toBeLessThanOrEqual(m.top + RAILING_HEIGHT + 0.02);
    expect(box.min.x).toBeGreaterThanOrEqual(wallEnd - 1e-6);
    expect(box.max.x).toBeLessThanOrEqual(stairEnd + 1e-6);
  });

  it("runs the stair balustrade up the pitch: posts on the treads, glass and handrail parallel to the nosing line", () => {
    const rise = 3;
    const treads = 10;
    const riser = rise / (treads + 1);
    const nosing = (t: number) => riser + t * (rise - riser);
    const b = new BalustradeBuilder();
    b.addStair([0, 0], [treads * 0.28, 0], treads, nosing, (i) => (i + 1) * riser);
    const g = b.build()!;
    // Every glass vertex sits between GLASS_BOTTOM and GLASS_TOP above the nosing line at its x.
    const pos = g.glass.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const above = pos.getY(i) - nosing(pos.getX(i) / (treads * 0.28));
      expect(above).toBeGreaterThan(GLASS_BOTTOM - 1e-4);
      expect(above).toBeLessThan(GLASS_TOP + 1e-4);
    }
    g.solid.computeBoundingBox();
    expect(g.solid.boundingBox!.min.y).toBeCloseTo(riser, 6); // the foot post on the first tread
    expect(g.solid.boundingBox!.max.y).toBeLessThan(rise + RAILING_HEIGHT + 0.02);
  });
});
