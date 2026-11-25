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
 * Multiplier on the ceiling fixtures' first bounce onto the ceiling (ceilingBounce.ts, 2026-11-25): the light
 * the floor and walls reflect back up, which is what actually lights a real gallery ceiling. 1 = the
 * physical first-bounce estimate (view factor × albedo × average irradiance); 0.75 because walls and floor
 * get no bounce term of their own — at 1 a light ceiling caught up with the walls (light parquet + off-white
 * walls, 24 × 20 × 5 m: bounce ≈ 0.43 vs the cut fill's 0.17, walls ≈ 0.5–0.7). Added on top of the cut fill
 * above, so the ceiling stays a tone darker than the walls but no longer reads as a dark, muddy lid.
 */
export const CEILING_BOUNCE_SCALE = 0.75;
/**
 * Share of the ceiling bounce's colour pulled toward its own luminance. The first-bounce estimate carries the
 * floor's full tint (a light parquet gave a clearly brown ceiling); in a real room the further bounces
 * between off-white walls and ceiling wash most of it out. Same idea as the window light's 40 % desaturation.
 */
export const CEILING_BOUNCE_DESATURATION = 0.6;
/**
 * Ceiling colour multiplier inside the env map (RoomEnvironment.tsx), i.e. how bright glossy floors
 * reflect the ceiling. Was 0.7; lowered with CEILING_FILL_SCALE so the reflection matches the darker
 * ceiling the visitor actually sees.
 */
export const ENV_CEILING_COLOR_SCALE = 0.4;

// Daylight through windows (windowLight.ts). The panoramas are tonemapped LDR photos (sky ≈ 0.2–0.5 linear),
// far darker than real daylight next to the room's lamps, so this gain brings a window's radiance up to it.
// Calibrated against the ceiling fixtures (CEILING_LIGHT_FLOOR_IRRADIANCE = 1.1 under a lamp), vitrin-6
// (three 1.6 × 2.4 m classic windows): floor 1 m from the windows ≈ 1.1, room centre ≈ 0.2, the wall facing
// them ≈ 0.25; the reveals (right at the glass, ~π/2 × radiance) stay just under the bloom threshold.
// Independent of the theme's ambient level — daylight doesn't care how dark the walls are painted.
export const DAYLIGHT_WINDOW_GAIN = 20;
/** Pulls the window light's colour toward grey (0 = the panorama's own sky/grass tint, 1 = neutral). */
export const DAYLIGHT_DESATURATION = 0.4;
/**
 * Direct sun through a window at normal incidence (sunLight.ts). Real sun is ~5–10× the sky light; here a
 * sunlit patch on a light floor lands around ~1.0 output (the ceiling fixtures' pool is ~0.35), and on a
 * pale wall hit square-on just past the bloom threshold, so the brightest patches glow faintly like real ones.
 */
export const SUN_IRRADIANCE = 8;
/** Average reflectance of a gallery room's surfaces for the daylight fill (daylightBounce.ts, split-flux). */
export const DAYLIGHT_AVG_REFLECTANCE = 0.5;
/** Share of the split-flux estimate actually added (furniture, frames and dark floors absorb more than ρ says). */
export const DAYLIGHT_FILL_SCALE = 0.7;
/**
 * Cap on the daylight fill (luminance of the added ambient irradiance). A glass-walled room would otherwise
 * flatten everything: with this cap the picture-lit canvases stay ~2.5–3× their wall even in vitrin-7.
 */
export const DAYLIGHT_FILL_MAX = 0.45;
/** Window panels in the environment map: × the visible view's brightness, so reflections of a window read like the window. */
export const ENV_WINDOW_INTENSITY = 1;
/**
 * Balconies (outdoorLight.ts): outside surfaces are lit by the panorama itself, not by the room. Sky light =
 * the panorama's cosine-weighted mean around the surface normal × the background intensity × this, so a
 * balcony floor reads about as bright as the ground in the photo next to it. Tune by eye.
 */
export const OUTDOOR_SKY_GAIN = 1;
/** Direct sun on outside surfaces at normal incidence (no glass in the way). */
export const OUTDOOR_SUN_IRRADIANCE = 4;
/**
 * Room light spilling out through a balcony's door and the other openings on its wall (outdoorLight.ts): each
 * opening is a Lambertian rectangle on the wall's outer face with this linear radiance — roughly a lit gallery
 * interior seen through it. Negligible next to daylight on a sunny balcony, the main light on it at night.
 */
export const OUTDOOR_ROOM_SPILL: [number, number, number] = [0.2, 0.16, 0.11];
