import { useLayoutEffect } from "react";
import * as THREE from "three";
import { useExhibition } from "./ExhibitionContext";
import { ceilingLightsForLayout, setCeilingLights } from "./ceilingLight";
import { HEMISPHERE_INTENSITY, ROOM_FILL_SCALE } from "./sceneLighting";

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
 *  3. Per-painting picture lights (ArtworkLightPool.tsx), the brightest thing in view.
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
    setCeilingLights(ceilingLightsForLayout(layout.ceilingSpots, theme.ambientIntensity), theme.spotColor);
  }, [layout.ceilingSpots, theme.ambientIntensity, theme.spotColor]);

  return (
    <>
      {/* Room's own default lighting — the only real light source besides each painting's spot */}
      <ambientLight color={theme.ambientColor} intensity={theme.ambientIntensity * ROOM_FILL_SCALE} />
      <hemisphereLight
        args={[theme.hemisphereSkyColor, theme.hemisphereGroundColor, HEMISPHERE_INTENSITY * ROOM_FILL_SCALE]}
      />

      {/* Emissive fixture discs — the visible source of the analytic ceiling light (ceilingLight.ts) */}
      {layout.ceilingSpots.map(([x, , z], i) => (
        <mesh
          key={`fixture-${i}`}
          position={[x, layout.wallHeight - 0.05, z]}
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
