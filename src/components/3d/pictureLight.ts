// Picture lights: the light comes out of the visible lamp bar above each painting (sergi-gercekcilestirme.md
// Adım 7, option B — "tablo lambası").
//
// Why not a plain three.js spot cone at the lamp: a point source 0.2–0.5 m off the wall lights the wall as
// standoff / d³, so with any round cone the brightest spot is right under the lamp — above the painting — and
// a 1.6 m canvas gets ~6 % at its bottom edge (measured with a CPU model of three's spot term over the whole
// parameter space, see the Adım 7 notes in CLAUDE.md). That's the trap the previous code fell into: it moved
// the real emitter 1.6 m out from the wall (BEAM_STANDOFF) so the cone could reach the canvas, which made the
// visible fixture and the light's real origin disagree and still left a round hot spot above the frame.
//
// What real picture lights do instead is use an asymmetric reflector that throws more light toward the far
// (lower) part of the canvas. That's modelled here exactly: the light leaves the lamp bar, and its intensity
// per direction is chosen so the *irradiance on the wall plane* follows a designed window — even across the
// canvas, fading gently from top (1.0) to bottom (BOTTOM_LEVEL) and toward the sides (EDGE_LEVEL), with a
// soft wall wash (SPILL) around it. For a ray that hits the wall s metres in front of the lamp after
// travelling d metres, wall irradiance = I·(s/d)/d², so I = gain·shape·d³/s and the light reaching any point
// at distance d' is I/d'². Surfaces off the wall plane (frame faces, a plinth top near the wall) get the
// physically consistent amount for that intensity distribution — the frame's top face is lit from above,
// not a sticker.
//
// It still runs on the fixed pool of real three.js spotLights (ArtworkLightPool.tsx — count never changes, no
// recompiles): installPictureLightShader() swaps three's getSpotLightInfo() for the version below, once, at
// module load, before any program compiles. The window parameters travel in the spot's own uniforms
// (encodePictureLight) — the only spot lights in the app are these picture lights. Pure math is mirrored on
// the CPU (pictureLightIrradiance) and tested in pictureLight.test.ts.

import * as THREE from "three";
import type { Artwork as ArtworkData } from "./artworks";
import { ARTWORK_WALL_GAP } from "./artworkShadow";
import { canvasZ } from "./frameProfile";

/** Lamp bar height above the canvas's top edge. placeArtworksAlongWall() leaves 0.73 m headroom. */
export const LAMP_RISE = 0.45;
/** Lamp never closer than this to the ceiling (hand-authored static rooms). */
export const CEILING_CLEARANCE = 0.15;
/** LED strip sits this far under the bar's axis — the actual emitting line. */
export const LAMP_STRIP_DROP = 0.038;
/**
 * Lamp arm length (bar distance from the wall), longer for bigger paintings like real picture lights. Also
 * keeps the light from arriving too grazing at the bottom of a tall canvas, where it would exaggerate the
 * canvas weave normal map.
 */
export function lampStandoff(paintingHeight: number): number {
  return THREE.MathUtils.clamp(0.2 + 0.15 * paintingHeight, 0.3, 0.9);
}

/** Irradiance at the canvas's top centre per unit spotLight intensity. With the brightest theme (spotIntensity 26 × 0.75) a white canvas top stays just under Scene.tsx's bloom threshold (1.5). */
export const PICTURE_LIGHT_GAIN = 0.26;
/** Relative irradiance at the canvas's bottom edge (top = 1) — a gentle fade, not a hot spot. */
export const BOTTOM_LEVEL = 0.6;
/** Relative irradiance at the canvas's side edges (centre = 1). */
export const EDGE_LEVEL = 0.8;
/** Width of the soft wall wash around the canvas (m). Covers the frame border (FRAME_BORDER) comfortably. */
export const SPILL = 0.3;
/**
 * Light stops this far past the painting's plane: the wall face is ARTWORK_WALL_GAP behind it, plus margin.
 * Anything farther (the floor on the other side of a partition) is behind the wall and gets nothing.
 */
const WALL_CUTOFF = ARTWORK_WALL_GAP + 0.05;

export interface PictureLightPlacement {
  /** Emitting point (centre of the LED strip), world space. */
  position: THREE.Vector3;
  /** Wall normal (horizontal, unit, points into the room). */
  normal: THREE.Vector3;
  /**
   * Lamp → canvas plane distance along the normal (m). The window is designed on the canvas plane, so the
   * canvas gets it exactly; the wall face a few cm behind receives it slightly dimmer.
   */
  standoff: number;
  /** Depth below the lamp of the canvas top / bottom edge (m). */
  topDepth: number;
  bottomDepth: number;
  /** Half the canvas width (m). */
  halfWidth: number;
}

/** Bar height for a painting (shared with fixtureGeometry.ts so the visible lamp and the light agree). */
export function lampBarY(data: ArtworkData, wallHeight: number): number {
  const topEdge = data.position[1] + data.height / 2;
  return Math.min(topEdge + LAMP_RISE, wallHeight - CEILING_CLEARANCE);
}

export function pictureLightPlacement(data: ArtworkData, wallHeight: number): PictureLightPlacement {
  const topEdge = data.position[1] + data.height / 2;
  const armLength = lampStandoff(data.height);
  // The window is designed on the canvas plane itself, which sits in the frame's rebate (frameProfile.ts).
  const standoff = armLength - canvasZ(data.frame);
  const y = lampBarY(data, wallHeight) - LAMP_STRIP_DROP;
  const normal = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), data.rotationY);
  const position = new THREE.Vector3(
    data.position[0] + normal.x * armLength,
    y,
    data.position[2] + normal.z * armLength
  );
  const topDepth = Math.max(y - topEdge, 0.05);
  return {
    position,
    normal,
    standoff,
    topDepth,
    bottomDepth: topDepth + data.height,
    halfWidth: (data.height * data.aspect) / 2,
  };
}

/**
 * Packs the window into a three.js SpotLight's own fields (its cone isn't used): standoff and topDepth into
 * cos(angle) / cos(angle·(1−penumbra)), bottomDepth into `distance`, halfWidth into `decay` — WebGLLights
 * passes those through unchanged. Decoded in PICTURE_LIGHT_GLSL.
 */
export function encodePictureLight(p: PictureLightPlacement) {
  const coneCos = p.standoff / 4; // ≤ 0.225
  const penumbraCos = 0.5 + Math.min(p.topDepth, 1.9) / 4; // 0.5…0.975 > coneCos
  const angle = Math.acos(coneCos);
  const penumbra = 1 - Math.acos(penumbraCos) / angle;
  return { angle, penumbra, distance: p.bottomDepth, decay: p.halfWidth };
}

/** Inverse of encodePictureLight, as the shader does it (for tests). */
export function decodePictureLight(angle: number, penumbra: number, distance: number, decay: number) {
  return {
    standoff: 4 * Math.cos(angle),
    topDepth: 4 * (Math.cos(angle * (1 - penumbra)) - 0.5),
    bottomDepth: distance,
    halfWidth: decay,
  };
}

const smoothstep = (a: number, b: number, x: number) => {
  const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

/** Relative wall irradiance at depth `t` below the lamp and horizontal offset `x` from the canvas centre. */
export function pictureLightShape(t: number, x: number, top: number, bottom: number, halfWidth: number): number {
  const a = THREE.MathUtils.clamp((t - top) / Math.max(bottom - top, 1e-3), 0, 1);
  let f = 1 + (BOTTOM_LEVEL - 1) * a;
  f *= 1 - smoothstep(0, SPILL, Math.max(top - t, 0) + Math.max(t - bottom, 0));
  f *= smoothstep(0, 0.1, t);
  const ax = Math.abs(x);
  const b = Math.min(ax / Math.max(halfWidth, 1e-3), 1);
  let g = 1 - (1 - EDGE_LEVEL) * b * b;
  g *= 1 - smoothstep(0, SPILL, Math.max(ax - halfWidth, 0));
  return f * g;
}

/** CPU mirror of the shader: irradiance at `p` (surface normal `n`) per unit spotLight intensity. */
export function pictureLightIrradiance(
  p: THREE.Vector3Like,
  n: THREE.Vector3Like,
  light: PictureLightPlacement
): number {
  const rx = p.x - light.position.x;
  const ry = p.y - light.position.y;
  const rz = p.z - light.position.z;
  const d = Math.hypot(rx, ry, rz);
  if (d < 1e-4) return 0;
  const toWall = -(rx * light.normal.x + rz * light.normal.z);
  if (toWall < 0.02 || toWall > light.standoff + WALL_CUTOFF) return 0;
  const k = light.standoff / toWall;
  const t = -ry * k;
  // side = up × normal
  const sideX = light.normal.z;
  const sideZ = -light.normal.x;
  const x = (rx * sideX + rz * sideZ) * k;
  const shape = pictureLightShape(t, x, light.topDepth, light.bottomDepth, light.halfWidth);
  if (shape <= 0) return 0;
  const color = (PICTURE_LIGHT_GAIN * shape * light.standoff * light.standoff * d) / (toWall * toWall * toWall);
  const nDotL = Math.max(-(n.x * rx + n.y * ry + n.z * rz) / d, 0);
  return color * nDotL;
}

// --- GPU side ------------------------------------------------------------------------------------------

const f = (v: number) => v.toFixed(4);

/** Replacement for three's getSpotLightInfo() (lights_pars_begin chunk). All vectors in view space. */
export const PICTURE_LIGHT_GLSL = /* glsl */ `
	float pictureLightShape( float t, float ax, float top, float bottom, float halfWidth ) {
		float a = clamp( ( t - top ) / max( bottom - top, 1e-3 ), 0.0, 1.0 );
		float fv = mix( 1.0, ${f(BOTTOM_LEVEL)}, a );
		fv *= 1.0 - smoothstep( 0.0, ${f(SPILL)}, max( top - t, 0.0 ) + max( t - bottom, 0.0 ) );
		fv *= smoothstep( 0.0, 0.1, t );
		float b = min( ax / max( halfWidth, 1e-3 ), 1.0 );
		float g = 1.0 - ${f(1 - EDGE_LEVEL)} * b * b;
		g *= 1.0 - smoothstep( 0.0, ${f(SPILL)}, max( ax - halfWidth, 0.0 ) );
		return fv * g;
	}

	// Picture light (pictureLight.ts): emitted from the lamp bar, intensity shaped so the wall plane gets a
	// designed window. spotLight.direction is the horizontal wall normal; the window rides in the spot's
	// cone/distance/decay fields (encodePictureLight).
	void getSpotLightInfo( const in SpotLight spotLight, const in vec3 geometryPosition, out IncidentLight light ) {

		vec3 lVector = spotLight.position - geometryPosition;
		float lightDistance = max( length( lVector ), 1e-4 );
		light.direction = lVector / lightDistance;

		float standoff = 4.0 * spotLight.coneCos;
		float topDepth = 4.0 * ( spotLight.penumbraCos - 0.5 );
		vec3 up = normalize( ( viewMatrix * vec4( 0.0, 1.0, 0.0, 0.0 ) ).xyz );
		vec3 side = cross( up, spotLight.direction );
		vec3 ray = - lVector;
		float toWall = - dot( ray, spotLight.direction );

		float shape = 0.0;
		if ( toWall > 0.02 && toWall < standoff + ${f(WALL_CUTOFF)} ) {
			float k = standoff / toWall;
			shape = pictureLightShape( - dot( ray, up ) * k, abs( dot( ray, side ) * k ), topDepth, spotLight.distance, spotLight.decay );
		}

		light.color = spotLight.color * ( ${f(PICTURE_LIGHT_GAIN)} * shape * standoff * standoff * lightDistance / max( toWall * toWall * toWall, 1e-6 ) );
		light.visible = shape > 0.0;

	}
`;

const SPOT_INFO_START = "void getSpotLightInfo(";

/** Swaps three's spot term for the picture light, once, before any program compiles. Idempotent. */
export function installPictureLightShader(): boolean {
  const chunk = THREE.ShaderChunk.lights_pars_begin;
  if (chunk.includes("pictureLightShape")) return true;
  const start = chunk.indexOf(SPOT_INFO_START);
  if (start < 0) {
    console.warn("[pictureLight] three's getSpotLightInfo not found — picture lights fall back to plain spots");
    return false;
  }
  // The function ends at the first line that is just a closing brace after its body.
  const end = chunk.indexOf("\n\t}\n", start);
  if (end < 0) return false;
  (THREE.ShaderChunk as Record<string, string>).lights_pars_begin =
    chunk.slice(0, start) + PICTURE_LIGHT_GLSL.trim() + chunk.slice(end + "\n\t}\n".length - 1);
  return true;
}

installPictureLightShader();
