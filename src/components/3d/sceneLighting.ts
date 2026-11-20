// The scene's exposure balance in one place: every global light dial that sets "how bright is the room vs.
// how bright is the art". Each theme (exhibitions.ts templates, backendAdapter.ts's custom-room theme)
// keeps its own relative ambientIntensity / spotIntensity; these multipliers sit on top, so static
// templates and backend exhibitions are re-balanced together from here instead of per theme.
//
// Target (sergi-gercekcilestirme.md Adım 2, 2026-11-20): like a real museum, the painting is the
// brightest thing in view — its centre ~3–5× the wall around it — and the room is dim but readable.
// Rough budget at a painting with a light-coloured custom theme: ambient (0.42 × fill) + hemisphere +
// env irradiance ≈ 1.0, picture light ≈ 4–5 at the canvas centre (intensity / d² · cosθ, d ≈ 1.7 m).
// Before this step the fill side was ~1.7, i.e. a ~2.5× ratio — everything sat in the mid-tones.
//
// Adım 6 (2026-11-20) moved most of the room's light to the ceiling fixtures (ceilingLight.ts): ~1.1
// on the floor under a lamp, ~0.5–0.7 on a wall near one. The directionless fill was cut again so it
// only keeps the corners from going black; a wall next to a painting now sits at ~1.0–1.2, the canvas
// at ~5, so the art keeps its ~4–5× lead.
//
// Adım 7 (2026-11-20): picture lights now come from the visible lamp bar with a designed, even window
// (pictureLight.ts): canvas top = intensity × PICTURE_LIGHT_GAIN (≈ 3.9–5.1 across themes), fading to 60 %
// at the bottom edge — no more hot spot above the frame, and more light over the canvas as a whole.

/** Multiplier on each theme's ambientIntensity and on HEMISPHERE_INTENSITY. Was 1.55, then 0.95 (Adım 2). */
export const ROOM_FILL_SCALE = 0.55;
/** Hemisphere (sky/ground) fill before ROOM_FILL_SCALE. */
export const HEMISPHERE_INTENSITY = 0.4;

/**
 * How strongly the procedural room env map (RoomEnvironment.tsx) lights and reflects on every
 * MeshStandardMaterial. Was 1.0, then 0.6 (Adım 2) — the env's room-coloured box is a second, even,
 * directionless fill.
 */
export const ENVIRONMENT_INTENSITY = 0.45;
/**
 * Ceiling fixtures' fixed-cost directional light (ceilingLight.ts): irradiance on the floor straight
 * below a fixture, for a theme with the reference ambient level (darker themes scale down with their own
 * ambientIntensity). Fixture power scales with ceiling height², so the pool looks alike in every room.
 */
export const CEILING_LIGHT_FLOOR_IRRADIANCE = 1.1;
/**
 * Brightness of each ceiling fixture's disc inside the env map. Raised together with the env cut above
 * (6 → 10 → 13, keeping ≈ the same absolute value as ENVIRONMENT_INTENSITY drops) so the lamps' reflections on glossy floors stay
 * bright while the room-coloured fill around them drops — the fixtures are small, so they add little to
 * the diffuse fill.
 */
export const ENV_CEILING_FIXTURE_INTENSITY = 13;

/** Multiplier on each theme's spotIntensity for the picture lights (ArtworkLightPool.tsx). Was 0.6. */
export const SPOT_INTENSITY_SCALE = 0.75;

/**
 * Share of the indirect fill (ambient + hemisphere + env map) the ceiling receives, relative to walls and
 * floor (Adım 3). In a real gallery the ceiling is the darkest surface — it only gets bounce light — so
 * the eye goes to the walls and the art; with equal fill a light ceiling was the brightest, most dominant
 * thing in view. Applied in roomAoMaterial.ts's ceiling branch (multiplies its occlusion term), so it
 * costs nothing extra. Direct light (picture spots) is unaffected.
 */
export const CEILING_FILL_SCALE = 0.55;
/**
 * Ceiling colour multiplier inside the env map (RoomEnvironment.tsx), i.e. how bright glossy floors
 * reflect the ceiling. Was 0.7; lowered with CEILING_FILL_SCALE so the reflection matches the darker
 * ceiling the visitor actually sees.
 */
export const ENV_CEILING_COLOR_SCALE = 0.4;
