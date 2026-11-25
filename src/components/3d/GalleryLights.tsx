import { useLayoutEffect, useMemo } from "react";
import * as THREE from "three";
import { useExhibition } from "./ExhibitionContext";
import { ceilingLightsForLayout, setCeilingBounce, setCeilingLights, setCeilingSlab } from "./ceilingLight";
import { ceilingBounceIrradiance } from "./ceilingBounce";
import { HEMISPHERE_INTENSITY, ROOM_FILL_SCALE, SPOT_INTENSITY_SCALE } from "./sceneLighting";
import { setPictureLightColor } from "./pictureLight";
import { setWindowLights, windowLightsFor } from "./windowLight";
import { setSunLight, sunSetupFor } from "./sunLight";
import { daylightFill, linearAlbedo, sunBounceLights } from "./daylightBounce";
import { DEFAULT_OUTDOOR_PANORAMA } from "./outdoorPanoramas";
import { artworkOccluder, removeSunOccluderSource, setSunOccluderSource } from "./sunOccluders";
import { useWallLabels } from "./useWallLabels";
import { FRAME_BORDER } from "./artworkShadow";
import { canvasZ } from "./frameProfile";
import { WALL_CLEARANCE, WALL_THICKNESS } from "./galleryLayout";

// Fill strength is set in sceneLighting.ts (the scene's single exposure dial), not here.

// Every ceiling fixture disc in a given room shares the exact same material (same theme,
// same emissive color) — one per theme color, not one per disc, same reasoning as
// Artwork.tsx's fixture material cache.
const ceilingFixtureMaterialCache = new Map<string, THREE.MeshStandardMaterial>();
function getCeilingFixtureMaterial(spotColor: string) {
  let material = ceilingFixtureMaterialCache.get(spotColor);
  if (!material) {
    material = new THREE.MeshStandardMaterial({
      color: "#111111",
      emissive: spotColor,
      // Above display white (and Scene.tsx's bloom threshold of 1.0) so the disc reads as an actual light
      // source with a soft glow, now that tone mapping rolls it off instead of hard-clipping it.
      emissiveIntensity: 3,
      roughness: 0.4,
    });
    ceilingFixtureMaterialCache.set(spotColor, material);
  }
  return material;
}

/**
 * Lighting rig for the current exhibition room. Three layers:
 *  1. The ceiling fixtures — emissive discs that are ALSO the room's main, directional light, through
 *     the analytic downlight term in ceilingLight.ts (floor pools, walls fading in below the ceiling,
 *     a lit and a shaded side on furniture). Not three.js lights: fixed cost, no recompiles.
 *  2. A dim themed ambient/hemisphere fill (sceneLighting.ts) — only there so corners never go black.
 *  3. Per-painting picture lights (pictureLight.ts), the brightest thing in view — always on: baked on the
 *     walls (pictureLightBake.ts), evaluated live only on each painting and its label (pictureLightMaterial.ts).
 *
 * No light in this rig casts real shadows — a one-time baked directional
 * "skylight" shadow was tried and dropped (didn't read as correct gallery
 * lighting), so `shadows`/`castShadow`/`receiveShadow` were also stripped
 * from Scene.tsx/GalleryRoom.tsx/Artwork.tsx — don't
 * re-add shadow flags on a mesh without a shadow-casting light behind them,
 * that only pays the shader cost for nothing.
 *
 * No directionalLights either (2026-11-02). Two shadow-less ones used to
 * live here purely to give normal maps a light direction and to break the
 * equal brightness of a corner's two walls. Their job is now covered by
 * RoomEnvironment.tsx (env map lit from the real ceiling fixtures above)
 * and roomAo.ts (corner/junction occlusion) — and keeping them was actively
 * harmful: a directional light has no visible source in the room, yet a
 * glossy floor (marble, polished concrete) mirrors it as a bright "sun"
 * highlight that matches nothing on the ceiling. Don't re-add a
 * directional/point light without a visible fixture behind it — on glossy
 * floors its specular reflection gives it away.
 */
export default function GalleryLights() {
  const { layout, exhibition } = useExhibition();
  const { theme } = exhibition;

  // The fixture discs below are also the room's directional light source (ceilingLight.ts): push their
  // positions into the shared uniforms before the first frame. Uniforms are read at draw time, so no
  // material recompiles when the room changes.
  useLayoutEffect(() => {
    const lights = ceilingLightsForLayout(layout.ceilingSpots, theme.ambientIntensity, layout.mezzanine);
    setCeilingLights(lights, theme.spotColor);
    // A mezzanine slab shadows the fixtures on its other side (always written: clears the previous room's).
    setCeilingSlab(layout.mezzanine);
    // What floor + walls reflect back onto the ceiling (ceilingBounce.ts) — once per room, a few k samples.
    setCeilingBounce(ceilingBounceIrradiance(layout, lights, linearAlbedo(theme.floorColor), linearAlbedo(theme.wallColor)));
  }, [layout, theme.ambientIntensity, theme.spotColor, theme.floorColor, theme.wallColor]);

  // Every picture lamp's colour × intensity — one shared uniform (the wall bake stores light per unit intensity).
  useLayoutEffect(() => {
    setPictureLightColor(theme.spotColor, theme.spotIntensity * SPOT_INTENSITY_SCALE);
  }, [theme.spotColor, theme.spotIntensity]);

  // Daylight through the windows (windowLight.ts), coloured by the view outside. Always written — a room
  // without windows clears the previous room's.
  const panoramaId = exhibition.outdoor?.panoramaId ?? DEFAULT_OUTDOOR_PANORAMA.id;
  const panoramaRotation = exhibition.outdoor?.rotationY ?? 0;
  const daylight = useMemo(() => {
    const windows = windowLightsFor(layout.windows ?? [], panoramaId, panoramaRotation);
    // Sun patches through the same windows, from the panorama's sun (none when overcast).
    const sun = sunSetupFor(layout.windows ?? [], panoramaId, panoramaRotation);
    // The patches' floor bounce rides in the same area-light arrays, after the windows (daylightBounce.ts).
    const bounce = sunBounceLights(windows, sun, layout, linearAlbedo(theme.floorColor));
    const fill = daylightFill(windows, sun, layout);
    return { areaLights: [...windows, ...bounce], sun, fill: new THREE.Color(...fill) };
  }, [layout, panoramaId, panoramaRotation, theme.floorColor]);
  useLayoutEffect(() => {
    setWindowLights(daylight.areaLights);
    setSunLight(daylight.sun);
  }, [daylight]);

  // Paintings throw sun shadows on their wall (sunOccluders.ts; furniture registers its own in
  // FurnitureInstances.tsx). Packed after the furniture, and only those the sun can reach.
  const { artworks } = useWallLabels();
  useLayoutEffect(() => {
    const wallGap = WALL_CLEARANCE - WALL_THICKNESS / 2;
    const occluders = artworks.map((a) => {
      const border = a.frame ? 2 * FRAME_BORDER : 0;
      return artworkOccluder(a.position, a.rotationY, a.height * a.aspect + border, a.height + border, wallGap, a.frame ? 0 : canvasZ(null));
    });
    setSunOccluderSource("artworks", occluders, 1);
    return () => removeSunOccluderSource("artworks");
  }, [artworks]);

  return (
    <>
      {/* Room's own default lighting — the only real three.js lights in the room (the picture lamps aren't any) */}
      <ambientLight color={theme.ambientColor} intensity={theme.ambientIntensity * ROOM_FILL_SCALE} />
      <hemisphereLight
        args={[theme.hemisphereSkyColor, theme.hemisphereGroundColor, HEMISPHERE_INTENSITY * ROOM_FILL_SCALE]}
      />
      {/* Daylight inter-reflected around the room (split-flux estimate, daylightBounce.ts) — zero without windows. */}
      {daylight.fill.r + daylight.fill.g + daylight.fill.b > 0 && <ambientLight color={daylight.fill} intensity={1} />}

      {/* Emissive fixture discs — the visible source of the analytic ceiling light (ceilingLight.ts) */}
      {layout.ceilingSpots.map(([x, y, z], i) => (
        <mesh
          key={`fixture-${i}`}
          // Spots sit 10 cm under their ceiling (the room's, or a mezzanine's underside): the disc hangs from it.
          position={[x, y + 0.05, z]}
          material={getCeilingFixtureMaterial(theme.spotColor)}
        >
          {/* radialSegments dropped from 20 to 10 — same reasoning as Artwork.tsx's fixture geometry: this disc
              is small, cosmetic, and viewed from a few meters away, so the facets aren't visible either way. */}
          <cylinderGeometry args={[0.18, 0.18, 0.06, 10]} />
        </mesh>
      ))}
    </>
  );
}
