// Window joinery for every style — swept profiles (profileSweep.ts), not boxes: the first boxed version read
// as a grid drawn into a hole. What makes a window read as real here:
//
// - a frame (kasa) with a rebate and a sash (kanat) sitting in it, slightly behind the frame face, with a
//   2 mm dark shadow gap between them; rounded/chamfered edges everywhere so the light catches them;
// - style-specific detail: classic = moulded glazing bars, centre mullion + transom light, a casing
//   (pervaz) on the room-side wall, a bull-nosed window board and a brass lever; modern = Crittall-style
//   steel T-bar grid with putty fillets and a black lever; panorama = aluminium curtain-wall mullions with
//   black gaskets;
// - glass that reflects (WindowFixtures.tsx) instead of a barely visible transparent plane.
//
// Local frame per window: x along the wall, y up from the opening's centre, z toward the room with z = 0 on
// the glass plane, which sits WINDOW_SETBACK behind the wall's centre plane (toward the outside), so a
// plastered reveal shows on the room side. buildWindowParts returns world-space geometry.

import * as THREE from "three";
import { SweepBuilder, arc, mirroredSection, type Profile } from "./profileSweep";
import type { WindowOpening, WindowStyleId } from "./windowOpenings";

/** Linear RGB share of light the glass absorbs on the way through (slight green-grey tint). */
export const GLASS_ABSORPTION: [number, number, number] = [0.13, 0.09, 0.11];

/** Glass plane, behind the wall's centre plane toward the outside. */
export const WINDOW_SETBACK = 0.06;

export interface WindowMaterialSpec {
  color: string;
  roughness: number;
  metalness: number;
}

export const WINDOW_STYLES: Record<WindowStyleId, { joinery: WindowMaterialSpec; hardware: WindowMaterialSpec | null }> = {
  // Painted timber (satin), brass lever.
  classic: { joinery: { color: "#ebe6dc", roughness: 0.5, metalness: 0 }, hardware: { color: "#b38b52", roughness: 0.32, metalness: 1 } },
  // Powder-coated steel, satin black.
  modern: { joinery: { color: "#232427", roughness: 0.55, metalness: 0.4 }, hardware: { color: "#18181a", roughness: 0.4, metalness: 0.6 } },
  // Anodised aluminium, dark bronze-grey.
  panorama: { joinery: { color: "#4a4c50", roughness: 0.38, metalness: 0.75 }, hardware: null },
};

/** Shade of a 2 mm shadow gap / rebate face (multiplies the paint colour). */
const GAP = 0.45;
/** Black EPDM gasket on a light/metal frame. */
const GASKET = 0.12;

export interface GlassPane {
  center: [number, number, number];
  width: number;
  height: number;
  /** Plane facing (codebase convention: 0 → +Z). */
  rotationY: number;
}

/** Axis-aligned rectangle in the window's local plane (x along the wall, y up, metres from the opening centre). */
export interface LocalRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface WindowParts {
  /** Frame, sashes, bars, casing, board — vertex-coloured, world space. */
  joinery: THREE.BufferGeometry;
  hardware: THREE.BufferGeometry | null;
  panes: GlassPane[];
  /** Glass rectangles and the glazing bars crossing them, in local coordinates (for the sun mask). */
  localPanes: LocalRect[];
  localBars: LocalRect[];
  /** World position of the local origin on the glass plane (opening centre) and of the local x axis. */
  origin: THREE.Vector3;
  xAxis: THREE.Vector3;
}

/** Evenly spaced bar centres splitting `span` into panes no larger than `maxPane`. */
export function barOffsets(span: number, maxPane: number, barWidth: number): number[] {
  const panes = Math.max(1, Math.ceil((span + barWidth) / (maxPane + barWidth) - 1e-9));
  const offsets: number[] = [];
  for (let i = 1; i < panes; i++) offsets.push(-span / 2 + (span * i) / panes);
  return offsets;
}

/** rotationY turning a plane's +Z normal toward `inward`. */
export function facing([ix, iz]: [number, number]): number {
  if (iz > 0.5) return 0;
  if (iz < -0.5) return Math.PI;
  return ix > 0 ? Math.PI / 2 : -Math.PI / 2;
}

interface Local {
  hw: number;
  hh: number;
  /** Local y of the floor. */
  floorY: number;
  /** Local z of the room-side wall face. */
  wallFaceZ: number;
  hasSill: boolean;
}

interface Out {
  joinery: SweepBuilder;
  hardware: SweepBuilder;
  panes: LocalRect[];
  /** Bars lying across glass (glazing bars) — mullions/transoms sit between panes and need no entry. */
  bars: LocalRect[];
  color: THREE.Color;
  hardwareColor: THREE.Color;
}

// --- Classic: painted timber casement ---------------------------------------------------------------

const C_FRAME = 0.07; // frame face width
const C_MULLION = 0.07;
const C_SASH = 0.055; // sash stile width
const C_SASH_LAP = 0.01; // how far the sash reaches into the frame rebate (rebate is 12 mm → 2 mm gap)
const C_FACE_START = 0.017; // r where the frame/mullion face begins (bars abut there)
const C_BOARD = 0.035; // window board thickness
const C_CASING = 0.09;
const C_BACK = -0.05;

/** Frame/mullion front: rebate floor + wall (dark gap), chamfer, flat face, optional rounded outer edge. */
function classicFront(width: number, roundOuter: boolean): Profile {
  const p: Profile = [
    [0, 0.01, GAP],
    [0.012, 0.01, GAP],
    [0.012, 0.03],
    [C_FACE_START, 0.035],
  ];
  if (roundOuter) p.push([width - 0.006, 0.035], ...arc(width - 0.006, 0.029, 0.006, Math.PI / 2, 0, 3));
  else p.push([width, 0.035]);
  return p;
}

const CLASSIC_FRAME: Profile = [...classicFront(C_FRAME, true), [C_FRAME, C_BACK], [0, C_BACK]];
const CLASSIC_MULLION: Profile = mirroredSection(classicFront(C_MULLION / 2, false), C_MULLION / 2, C_BACK);

/** Sash: ovolo glazing bead at the glass, chamfer to a flat face 7 mm behind the frame face, rounded edge, dark gap side. */
const CLASSIC_SASH: Profile = [
  [0, 0.006],
  ...arc(0.012, 0.006, 0.012, Math.PI, Math.PI / 2, 4),
  [0.016, 0.028],
  [C_SASH - 0.005, 0.028],
  ...arc(C_SASH - 0.005, 0.023, 0.005, Math.PI / 2, Math.PI * 0.1, 2),
  [C_SASH, 0.023, GAP],
  [C_SASH, -0.03],
  [0, -0.03],
];

/** Glazing bar: rounded (double ovolo) front, 22 mm wide. */
const CLASSIC_MUNTIN: Profile = mirroredSection([[0, 0.004], ...arc(0.011, 0.004, 0.011, Math.PI, Math.PI / 2, 4)], 0.011, -0.012);

function classicCasing(f: number): Profile {
  return [
    [0, f - 0.002],
    [0, f + 0.012],
    [0.005, f + 0.017],
    [0.02, f + 0.017],
    ...arc(0.045, f + 0.002, 0.03, Math.PI * 0.62, Math.PI * 0.38, 5),
    [C_CASING - 0.008, f + 0.02],
    ...arc(C_CASING - 0.008, f + 0.012, 0.008, Math.PI / 2, 0, 3),
    [C_CASING, f - 0.002],
  ];
}

function classicBoard(front: number): Profile {
  return [[0, C_BACK], [0, front - C_BOARD / 2], ...arc(C_BOARD / 2, front - C_BOARD / 2, C_BOARD / 2, Math.PI, 0, 6), [C_BOARD, C_BACK]];
}

function buildClassic(l: Local, out: Out) {
  const { joinery: j, color } = out;
  const lift = l.hasSill ? C_BOARD : 0;
  const cy = lift / 2;
  const hh = l.hh - lift / 2;
  j.sweepRect(0, cy, l.hw - C_FRAME, hh - C_FRAME, CLASSIC_FRAME, color);

  const x0 = -l.hw + C_FRAME;
  const x1 = l.hw - C_FRAME;
  const y0 = cy - hh + C_FRAME;
  const y1 = cy + hh - C_FRAME;

  const mullion = x1 - x0 > 1.0;
  const transom = y1 - y0 > 1.9;
  const ty = y1 - Math.min(0.6, (y1 - y0) * 0.28) - C_MULLION / 2;
  if (mullion) j.sweepBar("y", 0, y0 - C_FACE_START, y1 + C_FACE_START, CLASSIC_MULLION, color);
  if (transom) {
    const m = C_MULLION / 2 - C_FACE_START;
    const segs: [number, number][] = mullion ? [[x0 - C_FACE_START, -m], [m, x1 + C_FACE_START]] : [[x0 - C_FACE_START, x1 + C_FACE_START]];
    for (const [a, b] of segs) j.sweepBar("x", ty, a, b, CLASSIC_MULLION, color);
  }

  const cols: [number, number][] = mullion ? [[x0, -C_MULLION / 2], [C_MULLION / 2, x1]] : [[x0, x1]];
  const rows: [number, number][] = transom ? [[y0, ty - C_MULLION / 2], [ty + C_MULLION / 2, y1]] : [[y0, y1]];
  rows.forEach(([ry0, ry1], row) => {
    cols.forEach(([cx0, cx1], col) => {
      const ccx = (cx0 + cx1) / 2;
      const ccy = (ry0 + ry1) / 2;
      const shw = (cx1 - cx0) / 2 + C_SASH_LAP - C_SASH;
      const shh = (ry1 - ry0) / 2 + C_SASH_LAP - C_SASH;
      if (shw < 0.05 || shh < 0.05) {
        out.panes.push({ x: ccx, y: ccy, w: cx1 - cx0, h: ry1 - ry0 });
        return;
      }
      j.sweepRect(ccx, ccy, shw, shh, CLASSIC_SASH, color);
      out.panes.push({ x: ccx, y: ccy, w: 2 * shw, h: 2 * shh });
      // Glazing bars cross each other (rounded profiles, so the crossing reads as a coped joint) and run
      // 12 mm into the sash, where its bead is already higher than the bar.
      for (const u of barOffsets(2 * shw, 0.42, 0.022)) {
        j.sweepBar("y", ccx + u, ccy - shh - 0.012, ccy + shh + 0.012, CLASSIC_MUNTIN, color);
        out.bars.push({ x: ccx + u, y: ccy, w: 0.022, h: 2 * shh });
      }
      for (const v of barOffsets(2 * shh, 0.5, 0.022)) {
        j.sweepBar("x", ccy + v, ccx - shw - 0.012, ccx + shw + 0.012, CLASSIC_MUNTIN, color);
        out.bars.push({ x: ccx, y: ccy + v, w: 2 * shw, h: 0.022 });
      }
      // Lever on the opening sashes (bottom row), on the stile next to the mullion / the right stile.
      if (row === 0) {
        const latchRight = !mullion || col === 0;
        const hx = latchRight ? cx1 + C_SASH_LAP - C_SASH / 2 : cx0 - C_SASH_LAP + C_SASH / 2;
        const hy = Math.min(Math.max(l.floorY + 1.15, ry0 + 0.15), ry1 - 0.15);
        lever(out, hx, hy, 0.028, "down");
      }
    });
  });

  // Room-side casing around the opening and the window board under it.
  j.sweepRect(0, 0, l.hw, l.hh, classicCasing(l.wallFaceZ), color);
  if (l.hasSill) {
    const reach = l.hw + C_CASING + 0.025;
    j.sweepBar("x", -l.hh, -reach, reach, classicBoard(l.wallFaceZ + 0.045), color, true);
  }
}

// --- Modern: steel T-bar grid (Crittall style) --------------------------------------------------------

const M_FRAME = 0.045;
const M_FACE_START = 0.008;
const MODERN_FRAME: Profile = [
  [0, 0.012],
  [0.006, 0.012],
  [0.006, 0.028],
  [M_FACE_START, 0.03],
  [M_FRAME - 0.002, 0.03],
  [M_FRAME, 0.028],
  [M_FRAME, -0.03],
  [0, -0.03],
];

/** T-bar: 25 mm front flange, 6 mm web through the glass, putty fillets either side of the glass. */
function modernTBar(dz: number): Profile {
  const half: Profile = [
    [0, 0.03],
    [0, 0.026],
    [0.0095, 0.026],
    [0.0095, 0.008],
    [0.0035, 0.001],
    [0.0035, -0.001],
    [0.0095, -0.008],
    [0.0095, -0.02],
  ];
  const left = half.map(([a, z]) => [a - 0.0125, z + dz] as [number, number]);
  const right = [...half].reverse().map(([a, z]) => [0.0125 - a, z + dz] as [number, number]);
  return [...left, ...right];
}
const MODERN_VBAR = modernTBar(0);
// Horizontal bars sit 0.8 mm lower so the crossing flanges never share a plane (z-fighting).
const MODERN_HBAR = modernTBar(-0.0008);

function buildModern(l: Local, out: Out) {
  const { joinery: j, color } = out;
  j.sweepRect(0, 0, l.hw - M_FRAME, l.hh - M_FRAME, MODERN_FRAME, color);
  const x0 = -l.hw + M_FRAME;
  const x1 = l.hw - M_FRAME;
  const y0 = -l.hh + M_FRAME;
  const y1 = l.hh - M_FRAME;
  const vs = barOffsets(x1 - x0, 0.62, 0.025);
  const hs = barOffsets(y1 - y0, 0.52, 0.025);
  for (const u of vs) {
    j.sweepBar("y", u, y0 - M_FACE_START, y1 + M_FACE_START, MODERN_VBAR, color);
    out.bars.push({ x: u, y: (y0 + y1) / 2, w: 0.025, h: y1 - y0 });
  }
  for (const v of hs) {
    j.sweepBar("x", v, x0 - M_FACE_START, x1 + M_FACE_START, MODERN_HBAR, color);
    out.bars.push({ x: (x0 + x1) / 2, y: v, w: x1 - x0, h: 0.025 });
  }
  out.panes.push({ x: 0, y: 0, w: x1 - x0, h: y1 - y0 });
  const hx = vs.length ? vs[vs.length - 1] : x1 - 0.01;
  const hy = Math.min(Math.max(l.floorY + 1.1, y0 + 0.12), y1 - 0.12);
  lever(out, hx, hy, 0.03, "side");
}

// --- Panorama: aluminium curtain wall -----------------------------------------------------------------

const P_FRAME = 0.06;
const P_MULLION = 0.06;
const P_FACE_START = 0.011;
function panoramaFront(width: number, roundOuter: boolean): Profile {
  const p: Profile = [
    [0, 0.003, GASKET],
    [0.006, 0.003, GASKET],
    [0.006, 0.016],
    [0.009, 0.016],
    [P_FACE_START, 0.04],
  ];
  if (roundOuter) p.push([width - 0.002, 0.04], [width, 0.038]);
  else p.push([width, 0.04]);
  return p;
}
const PANORAMA_FRAME: Profile = [...panoramaFront(P_FRAME, true), [P_FRAME, -0.08], [0, -0.08]];
const PANORAMA_MULLION: Profile = mirroredSection(panoramaFront(P_MULLION / 2, false), P_MULLION / 2, -0.08);

function buildPanorama(l: Local, out: Out) {
  const { joinery: j, color } = out;
  j.sweepRect(0, 0, l.hw - P_FRAME, l.hh - P_FRAME, PANORAMA_FRAME, color);
  const x0 = -l.hw + P_FRAME;
  const x1 = l.hw - P_FRAME;
  const y0 = -l.hh + P_FRAME;
  const y1 = l.hh - P_FRAME;
  const ms = barOffsets(x1 - x0, 2.4, P_MULLION);
  for (const u of ms) j.sweepBar("y", u, y0 - P_FACE_START, y1 + P_FACE_START, PANORAMA_MULLION, color);

  const transom = y1 - y0 > 3.2;
  const ty = Math.min(Math.max(l.floorY + 2.75, y0 + 1), y1 - 0.5);
  const half = P_MULLION / 2;
  const cols: [number, number][] = [];
  let left = x0;
  for (const u of ms) {
    cols.push([left, u - half]);
    left = u + half;
  }
  cols.push([left, x1]);
  if (transom) {
    // Each segment runs into the frame / neighbouring mullions up to where their face begins.
    for (const [a, b] of cols) j.sweepBar("x", ty, a - P_FACE_START, b + P_FACE_START, PANORAMA_MULLION, color);
  }
  const rows: [number, number][] = transom ? [[y0, ty - half], [ty + half, y1]] : [[y0, y1]];
  for (const [a, b] of cols) for (const [c, d] of rows) out.panes.push({ x: (a + b) / 2, y: (c + d) / 2, w: b - a, h: d - c });
}

// --- Hardware -------------------------------------------------------------------------------------------

/** A lever handle on a backplate, mounted on the face at depth `z`. "down" = classic espagnolette, "side" = modern lever. */
function lever(out: Out, x: number, y: number, z: number, kind: "down" | "side") {
  const hw = out.hardware;
  const c = out.hardwareColor;
  const plate = new THREE.BoxGeometry(kind === "down" ? 0.024 : 0.018, kind === "down" ? 0.085 : 0.055, 0.005);
  plate.translate(x, y, z + 0.0025);
  hw.addGeometry(plate, c);
  const spindle = new THREE.CylinderGeometry(0.005, 0.005, 0.026, 10);
  spindle.rotateX(Math.PI / 2);
  spindle.translate(x, y + (kind === "down" ? 0.02 : 0), z + 0.018);
  hw.addGeometry(spindle, c);
  const grip =
    kind === "down" ? new THREE.CapsuleGeometry(0.0055, 0.085, 3, 8) : new THREE.CapsuleGeometry(0.005, 0.075, 3, 8);
  if (kind === "down") grip.translate(x, y + 0.02 - 0.05, z + 0.032);
  else {
    grip.rotateZ(Math.PI / 2);
    grip.translate(x - 0.04, y, z + 0.032);
  }
  hw.addGeometry(grip, c);
  for (const g of [plate, spindle, grip]) g.dispose();
}

// --- Entry ----------------------------------------------------------------------------------------------

const BUILDERS: Record<WindowStyleId, (l: Local, out: Out) => void> = {
  classic: buildClassic,
  modern: buildModern,
  panorama: buildPanorama,
};

export function buildWindowParts(opening: WindowOpening): WindowParts {
  const style = WINDOW_STYLES[opening.styleId];
  const out: Out = {
    joinery: new SweepBuilder(),
    hardware: new SweepBuilder(),
    panes: [],
    bars: [],
    color: new THREE.Color(style.joinery.color),
    hardwareColor: new THREE.Color(style.hardware?.color ?? "#000000"),
  };
  const local: Local = {
    hw: opening.width / 2,
    hh: opening.height / 2,
    floorY: -(opening.sill + opening.height / 2),
    wallFaceZ: opening.depth / 2 + WINDOW_SETBACK,
    hasSill: opening.sill > 0.01,
  };
  BUILDERS[opening.styleId](local, out);

  const rotationY = facing(opening.inward);
  const matrix = new THREE.Matrix4()
    .makeTranslation(...opening.center)
    .multiply(new THREE.Matrix4().makeRotationY(rotationY))
    .multiply(new THREE.Matrix4().makeTranslation(0, 0, -WINDOW_SETBACK));
  const v = new THREE.Vector3();
  const origin = new THREE.Vector3(0, 0, 0).applyMatrix4(matrix);
  const xAxis = new THREE.Vector3(1, 0, 0).transformDirection(matrix);
  return {
    joinery: out.joinery.toGeometry(matrix),
    hardware: out.hardware.empty ? null : out.hardware.toGeometry(matrix),
    panes: out.panes.map((p) => {
      v.set(p.x, p.y, 0).applyMatrix4(matrix);
      return { center: [v.x, v.y, v.z], width: p.w, height: p.h, rotationY };
    }),
    localPanes: out.panes,
    localBars: out.bars,
    origin,
    xAxis,
  };
}

// --- Transmission mask ------------------------------------------------------------------------------------

/** Area of overlap between [ax0, ax1] × [ay0, ay1] and a local rect. */
function overlap(ax0: number, ax1: number, ay0: number, ay1: number, r: LocalRect): number {
  const w = Math.min(ax1, r.x + r.w / 2) - Math.max(ax0, r.x - r.w / 2);
  const h = Math.min(ay1, r.y + r.h / 2) - Math.max(ay0, r.y - r.h / 2);
  return w > 0 && h > 0 ? w * h : 0;
}

/**
 * How much light each part of the opening lets through: a `res` × `res` grid over the whole opening
 * (row 0 = bottom, column 0 = local −x edge), 1 = clear glass, 0 = frame/bar, box-filtered per cell so a
 * 2 cm glazing bar still shows on a coarse grid. Used for the sun patches (sunLight.ts) and the soft
 * daylight's glass share (windowLight.ts) — both straight from the real joinery layout.
 */
export function windowTransmissionMask(opening: WindowOpening, parts: WindowParts, res: number): Float32Array {
  const mask = new Float32Array(res * res);
  const cw = opening.width / res;
  const ch = opening.height / res;
  const area = cw * ch;
  for (let j = 0; j < res; j++) {
    const y0 = -opening.height / 2 + j * ch;
    for (let i = 0; i < res; i++) {
      const x0 = -opening.width / 2 + i * cw;
      let glass = 0;
      for (const p of parts.localPanes) glass += overlap(x0, x0 + cw, y0, y0 + ch, p);
      let bar = 0;
      for (const b of parts.localBars) bar += overlap(x0, x0 + cw, y0, y0 + ch, b);
      mask[j * res + i] = Math.min(Math.max(glass - bar, 0) / area, 1);
    }
  }
  return mask;
}
