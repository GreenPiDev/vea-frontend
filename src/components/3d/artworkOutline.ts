// Hover highlight around a painting or its wall label, shared by both navigation modes (ClickNavigation.tsx:
// whatever is under the mouse; WalkArtworkPicker.tsx: whatever is at the screen centre).
//
// The first version was a flat yellow band that popped on and off, and read as a game selection box. This one
// is meant to feel like gallery lighting:
// - a soft, warm halo on the wall, as if the work were gently backlit, fading out over ~9 cm from its edge;
// - a fine champagne hairline a little outside the frame, with slightly softened corners, kept at least
//   ~1 px wide on screen (fwidth) so it never shimmers away at a distance;
// - an eased fade-in/out (~200 ms) during which the hairline settles inward from a couple of cm out, and a
//   barely visible slow "breath" while hovered.
// Everything is masked off inside the target's rectangle: the quad sits a few mm in front of the wall, which
// is in front of a label's printed face, so it must never cover the label (or a frameless canvas edge).
//
// One quad and one shared ShaderMaterial (only one highlight is ever visible: the two modes are exclusive).
// Per-target size and animation state go through uniforms; values stay below the bloom threshold (1.5).

import * as THREE from "three";
import type { Artwork as ArtworkData } from "./artworks";
import { ARTWORK_WALL_GAP, FRAME_BORDER } from "./artworkShadow";

/** Hairline: gap from the target's edge when settled, extra gap it slides in from, and width (m). */
export const OUTLINE_GAP = 0.016;
export const OUTLINE_ENTRY_OFFSET = 0.02;
export const OUTLINE_LINE_WIDTH = 0.0025;
/** Corner radius of the hairline (m) — softened, not rounded off. */
export const OUTLINE_CORNER_RADIUS = 0.006;
/** Halo: e-folding distance from the target's edge, and how far the quad extends for it (m). */
export const OUTLINE_GLOW_FALLOFF = 0.03;
export const OUTLINE_GLOW_EXTENT = 0.1;
/** Peak opacities (straight alpha) of the hairline and halo. */
export const OUTLINE_LINE_ALPHA = 0.9;
export const OUTLINE_GLOW_ALPHA = 0.22;
/** Fade rate (1/s, exponential approach): ~95 % in 200 ms. */
export const OUTLINE_FADE_RATE = 15;
/** Breathing: period (s) and depth (fraction of the hairline's opacity). */
export const OUTLINE_BREATH_PERIOD = 2.8;
export const OUTLINE_BREATH_DEPTH = 0.12;

/** Champagne gold hairline, warm-white halo — for dark walls (tone-mapped by the composer). */
const LINE_ON_DARK = new THREE.Color("#ecd3a0");
const GLOW_ON_DARK = new THREE.Color("#ffe2b0");
/** Deep bronze hairline, amber halo — for light walls, where the champagne tones would vanish. */
const LINE_ON_LIGHT = new THREE.Color("#7a4d12");
const GLOW_ON_LIGHT = new THREE.Color("#a8721f");
/** Wall lightness (0..1, perceptual) range over which the palette crossfades from "dark" to "light". */
export const OUTLINE_PALETTE_DARK_BELOW = 0.35;
export const OUTLINE_PALETTE_LIGHT_ABOVE = 0.6;

/** Perceptual lightness of a wall colour in [0, 1] (Rec. 709 luma of the sRGB values). */
export function wallLightness(wallColor: string): number {
  const c = new THREE.Color(wallColor).getRGB({ r: 0, g: 0, b: 0 }, THREE.SRGBColorSpace);
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
}

/** Hairline + halo colours that stay visible against `wallColor`: light on dark walls, dark bronze on light ones. */
export function outlineColorsForWall(wallColor: string): { line: THREE.Color; glow: THREE.Color } {
  const x = (wallLightness(wallColor) - OUTLINE_PALETTE_DARK_BELOW) / (OUTLINE_PALETTE_LIGHT_ABOVE - OUTLINE_PALETTE_DARK_BELOW);
  const t = Math.min(1, Math.max(0, x));
  const k = t * t * (3 - 2 * t);
  return {
    line: LINE_ON_DARK.clone().lerp(LINE_ON_LIGHT, k),
    glow: GLOW_ON_DARK.clone().lerp(GLOW_ON_LIGHT, k),
  };
}

/** Retints the shared highlight for the current room's wall colour (call when the room/theme changes). */
export function setOutlineWallColor(wallColor: string): void {
  const { line, glow } = outlineColorsForWall(wallColor);
  outlineMaterial.uniforms.uLineColor.value.copy(line);
  outlineMaterial.uniforms.uGlowColor.value.copy(glow);
}

const f = (n: number) => n.toFixed(5);

export const outlineMaterial = new THREE.ShaderMaterial({
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform vec2 uQuadHalf;
    uniform vec2 uRectHalf;
    uniform float uGap;
    uniform float uOpacity;
    uniform float uBreath;
    uniform vec3 uLineColor;
    uniform vec3 uGlowColor;
    varying vec2 vUv;

    // Signed distance to a rounded rectangle (negative inside).
    float sdRoundRect(vec2 p, vec2 halfSize, float r) {
      vec2 q = abs(p) - halfSize + r;
      return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
    }

    void main() {
      vec2 p = (vUv - 0.5) * 2.0 * uQuadHalf;

      // Distance from the target's own (sharp) edge: masks the inside, drives the halo.
      vec2 qe = abs(p) - uRectHalf;
      float dEdge = length(max(qe, 0.0)) + min(max(qe.x, qe.y), 0.0);
      float aaEdge = fwidth(dEdge);
      float outside = smoothstep(0.0, aaEdge * 1.5, dEdge);

      // Hairline, at least ~1 px wide on screen.
      float dLine = sdRoundRect(p, uRectHalf + uGap, ${f(OUTLINE_CORNER_RADIUS)});
      float aa = fwidth(dLine);
      float halfW = max(${f(OUTLINE_LINE_WIDTH * 0.5)}, aa * 0.6);
      float line = 1.0 - smoothstep(halfW - aa * 0.5, halfW + aa * 0.5, abs(dLine));

      // Halo: exponential falloff from the edge, eased to zero at the quad border.
      float glow = exp(-max(dEdge, 0.0) / ${f(OUTLINE_GLOW_FALLOFF)});
      glow *= 1.0 - smoothstep(${f(OUTLINE_GLOW_EXTENT * 0.6)}, ${f(OUTLINE_GLOW_EXTENT)}, dEdge);

      float lineA = line * ${f(OUTLINE_LINE_ALPHA)} * uBreath;
      float glowA = glow * ${f(OUTLINE_GLOW_ALPHA)};
      float alpha = (lineA + glowA * (1.0 - lineA)) * outside * uOpacity;
      vec3 color = mix(uGlowColor, uLineColor, lineA / max(lineA + glowA, 1e-4));
      gl_FragColor = vec4(color, alpha);
    }
  `,
  uniforms: {
    uQuadHalf: { value: new THREE.Vector2(1, 1) },
    uRectHalf: { value: new THREE.Vector2(0.9, 0.9) },
    uGap: { value: OUTLINE_GAP },
    uOpacity: { value: 0 },
    uBreath: { value: 1 },
    uLineColor: { value: LINE_ON_DARK.clone() },
    uGlowColor: { value: GLOW_ON_DARK.clone() },
  },
  transparent: true,
  depthWrite: false,
  polygonOffset: true,
  polygonOffsetFactor: -2,
  polygonOffsetUnits: -2,
});
export const outlineGeometry = new THREE.PlaneGeometry(1, 1);

// --- Animation state (pure, tested) --------------------------------------------------------------------

export interface OutlineState {
  /** Identity of the highlighted target (painting id + kind), null when nothing is hovered. */
  key: string | null;
  opacity: number;
}

/** Eases the opacity toward 1 while something is hovered, toward 0 otherwise. Frame-rate independent. */
export function stepOutlineOpacity(opacity: number, hovered: boolean, dt: number): number {
  const target = hovered ? 1 : 0;
  const next = target + (opacity - target) * Math.exp(-OUTLINE_FADE_RATE * Math.max(dt, 0));
  return Math.abs(next - target) < 1e-3 ? target : next;
}

/** Hairline gap for an opacity: it settles inward from OUTLINE_ENTRY_OFFSET further out as it fades in. */
export function outlineGap(opacity: number): number {
  const eased = 1 - (1 - opacity) ** 3;
  return OUTLINE_GAP + OUTLINE_ENTRY_OFFSET * (1 - eased);
}

/** Hairline opacity multiplier for the slow breath, in [1 − depth, 1]. */
export function outlineBreath(time: number): number {
  return 1 - OUTLINE_BREATH_DEPTH * 0.5 * (1 - Math.cos((2 * Math.PI * time) / OUTLINE_BREATH_PERIOD));
}

function state(mesh: THREE.Mesh): OutlineState {
  return (mesh.userData.outline ??= { key: null, opacity: 0 }) as OutlineState;
}

/** Places the quad around a rectangle hung on `artwork`'s wall: centre (cx, cy) and half size, painting-local. */
function placeRect(mesh: THREE.Mesh, artwork: ArtworkData, cx: number, cy: number, halfW: number, halfH: number): void {
  const reach = OUTLINE_GAP + OUTLINE_ENTRY_OFFSET + OUTLINE_GLOW_EXTENT;
  outlineMaterial.uniforms.uRectHalf.value.set(halfW, halfH);
  outlineMaterial.uniforms.uQuadHalf.value.set(halfW + reach, halfH + reach);
  // On the wall face, just in front of it (same plane idea as the wall shadows).
  const back = -(ARTWORK_WALL_GAP - 0.004);
  const s = Math.sin(artwork.rotationY);
  const c = Math.cos(artwork.rotationY);
  const [px, py, pz] = artwork.position;
  // Painting-local right axis = (cos, 0, -sin).
  mesh.position.set(px + s * back + c * cx, py + cy, pz + c * back - s * cx);
  mesh.rotation.set(0, artwork.rotationY, 0);
  mesh.scale.set((halfW + reach) * 2, (halfH + reach) * 2, 1);
}

/** Highlight whatever wall target is hovered (painting or label), or fade the highlight out for null. */
export function applyWallTargetOutline(
  mesh: THREE.Mesh,
  target: { kind: "artwork" | "label"; artwork: ArtworkData } | null,
  labelRects: Map<string, { x: number; y: number; halfW: number; halfH: number }>
): void {
  const st = state(mesh);
  if (!target) {
    st.key = null; // keeps its last placement while it fades out
    return;
  }
  const key = `${target.kind}:${target.artwork.id}`;
  if (key === st.key) return;
  // Moving straight from one target to another restarts the entrance, so the highlight never slides across.
  st.key = key;
  st.opacity = 0;
  const rect = target.kind === "label" ? labelRects.get(target.artwork.id) : undefined;
  if (rect) placeRect(mesh, target.artwork, rect.x, rect.y, rect.halfW, rect.halfH);
  else {
    const a = target.artwork;
    const border = a.frame ? FRAME_BORDER : 0;
    placeRect(mesh, a, 0, 0, (a.height * a.aspect) / 2 + border, a.height / 2 + border);
  }
}

/** Advances the fade/settle/breath animation — call every frame from the picker's useFrame. */
export function tickOutline(mesh: THREE.Mesh, dt: number, time: number): void {
  const st = state(mesh);
  st.opacity = stepOutlineOpacity(st.opacity, st.key !== null, dt);
  mesh.visible = st.opacity > 0;
  if (!mesh.visible) return;
  const u = outlineMaterial.uniforms;
  u.uOpacity.value = st.opacity;
  u.uGap.value = outlineGap(st.opacity);
  u.uBreath.value = outlineBreath(time);
}
