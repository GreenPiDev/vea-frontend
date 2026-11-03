import * as THREE from "three";
import { useExhibition } from "./ExhibitionContext";

// Ceiling fixtures used to also cast real spotLights for room fill; now the room's own
// ambient/hemisphere fill carries that job alone, so their loss is compensated here rather
// than in every theme's data. Ceiling fixtures below are purely cosmetic (emissive discs).
const ROOM_FILL_BOOST = 1.55;

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
 * Lighting rig for the current exhibition room: the room's own soft ambient
 * fill (themed) is the only real light source, boosted to cover the room
 * evenly on its own. A sparse grid of ceiling fixtures is layered on top for
 * looks only — glowing discs with no attached spotLight — so per-painting
 * spotlights (see ArtworkLightPool.tsx) stay the sole visible "hot"
 * light source, like a real gallery's track-lit walls.
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

  return (
    <>
      {/* Room's own default lighting — the only real light source besides each painting's spot */}
      <ambientLight color={theme.ambientColor} intensity={theme.ambientIntensity * ROOM_FILL_BOOST} />
      <hemisphereLight
        args={[theme.hemisphereSkyColor, theme.hemisphereGroundColor, 0.4 * ROOM_FILL_BOOST]}
      />

      {/* Small emissive fixture discs — purely cosmetic, cast no light themselves */}
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
