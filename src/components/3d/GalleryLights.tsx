import { useExhibition } from "./ExhibitionContext";

// Ceiling fixtures used to also cast real spotLights for room fill; now the room's own
// ambient/hemisphere fill carries that job alone, so their loss is compensated here rather
// than in every theme's data. Ceiling fixtures below are purely cosmetic (emissive discs).
const ROOM_FILL_BOOST = 1.8;

/**
 * Lighting rig for the current exhibition room: the room's own soft ambient
 * fill (themed) is the only real light source, boosted to cover the room
 * evenly on its own. A sparse grid of ceiling fixtures is layered on top for
 * looks only — glowing discs with no attached spotLight — so per-painting
 * spotlights (see Artwork.tsx's ArtworkLight) stay the sole visible "hot"
 * light source, like a real gallery's track-lit walls.
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
        <mesh key={`fixture-${i}`} position={[x, layout.wallHeight - 0.05, z]}>
          <cylinderGeometry args={[0.18, 0.18, 0.06, 20]} />
          <meshStandardMaterial
            color="#111111"
            emissive={theme.spotColor}
            emissiveIntensity={1.2}
            roughness={0.4}
          />
        </mesh>
      ))}
    </>
  );
}
