import { useExhibition } from "./ExhibitionContext";

/**
 * Lighting rig for the current exhibition room: soft ambient fill (themed)
 * plus a sparse grid of recessed ceiling spots. Kept modest in count to stay
 * cheap to render while still looking physically plausible.
 */
export default function GalleryLights() {
  const { layout, exhibition } = useExhibition();
  const { theme } = exhibition;

  return (
    <>
      {/* Soft overall fill so unlit corners don't go pure black */}
      <ambientLight color={theme.ambientColor} intensity={theme.ambientIntensity} />
      <hemisphereLight args={[theme.hemisphereSkyColor, theme.hemisphereGroundColor, 0.4]} />

      {layout.ceilingSpots.map(([x, y, z], i) => (
        <spotLight
          key={i}
          position={[x, y, z]}
          angle={0.58}
          penumbra={0.6}
          intensity={theme.spotIntensity}
          distance={14}
          decay={2}
          color={theme.spotColor}
          castShadow={i < 3}
          shadow-mapSize-width={512}
          shadow-mapSize-height={512}
          shadow-bias={-0.001}
        />
      ))}

      {/* Small emissive fixture discs so the light sources read visually */}
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
