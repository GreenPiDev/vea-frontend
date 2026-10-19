import { useRef } from "react";
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
      emissiveIntensity: 1.2,
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
 * from Scene.tsx/GalleryRoom.tsx/Baseboards.tsx/Artwork.tsx — don't
 * re-add shadow flags on a mesh without a shadow-casting light behind them,
 * that only pays the shader cost for nothing. The two directionalLights
 * added below are deliberately shadow-less too (no `castShadow`) — they
 * exist only to give walls/floor a light *direction* to shade their normal
 * maps (surfaceTextures.ts) against, not to look like a literal sun/window.
 * A single directional light isn't enough: a rectangular room only has 2
 * independent wall orientations (the X-facing pair and the Z-facing pair),
 * so one light's angle always leaves exactly one pair of adjacent walls at
 * near-identical brightness — their shared corner reads as a single flat
 * surface instead of two distinct walls. The second, dimmer light sits at a
 * ~90°-different horizontal angle from the first specifically to break that
 * symmetry, so every corner ends up with *some* brightness contrast.
 *
 * A third, grazing-angle light aimed at making the ceiling's normal map
 * readable was tried and reverted: a directional light affects every surface
 * at once, and the same shallow angle that would reveal ceiling bumps landed
 * right in the floor's specular reflection cone — the glossy, low-roughness
 * floor lit up with a dramatic highlight streak while the ceiling (much
 * rougher, see GalleryRoom.tsx's `theme.wallRoughness` reuse) barely changed.
 * Ceiling bump visibility is instead handled via `normalScale` on the
 * ceiling's own material (GalleryRoom.tsx) — a per-material knob that
 * exaggerates existing normal-map shading without adding or redirecting any
 * light, so it can't leak onto an unrelated surface like this did.
 */
export default function GalleryLights() {
  const { layout, exhibition } = useExhibition();
  const { theme } = exhibition;
  const skylightTarget = useRef<THREE.Object3D>(null);
  const [centerX, centerZ] = layout.room.center;

  return (
    <>
      {/* Room's own default lighting — the only real light source besides each painting's spot */}
      <ambientLight color={theme.ambientColor} intensity={theme.ambientIntensity * ROOM_FILL_BOOST} />
      <hemisphereLight
        args={[theme.hemisphereSkyColor, theme.hemisphereGroundColor, 0.4 * ROOM_FILL_BOOST]}
      />

      {/* Angled "skylight" pair — no shadow casting, just gives normal maps a direction to shade against.
          Both share one target (room center); the second sits ~90° around from the first horizontally
          so no corner's two walls end up facing both lights at near-equal angles (see doc comment above). */}
      <object3D ref={skylightTarget} position={[centerX, layout.wallHeight / 2, centerZ]} />
      <directionalLight
        color={theme.hemisphereSkyColor}
        intensity={0.5}
        position={[centerX + 4, layout.wallHeight + 3, centerZ - 3]}
        target={skylightTarget.current ?? undefined}
      />
      <directionalLight
        color={theme.hemisphereSkyColor}
        intensity={0.3}
        position={[centerX - 3, layout.wallHeight + 3, centerZ - 4]}
        target={skylightTarget.current ?? undefined}
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
