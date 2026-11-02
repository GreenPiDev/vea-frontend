import { useMemo } from "react";
import * as THREE from "three";
import { Environment, Lightformer } from "@react-three/drei";
import { useExhibition } from "./ExhibitionContext";
import { EYE_HEIGHT } from "./galleryLayout";

// How strongly the environment map lights/reflects on every MeshStandardMaterial in the scene. It adds on
// top of GalleryLights.tsx's ambient/hemisphere fill. Raised from 0.6 when GalleryLights' two directional
// "skylights" were removed (they caused a sourceless glare on glossy floors): the env map is the better
// place to make up that lost brightness, since its light comes from the real ceiling fixtures and is
// shaped by the room AO — a flat ambient boost would wash the corners back out.
const ENVIRONMENT_INTENSITY = 1.0;
// Cubemap face size. Reflections on this scene's surfaces are all rough enough to be blurred by PMREM
// anyway, so a higher resolution would only cost VRAM/startup time without visible gain.
const ENVIRONMENT_RESOLUTION = 128;
const CEILING_FIXTURE_INTENSITY = 6;
const CEILING_FIXTURE_RADIUS = 0.35;

function scaled(color: string, factor: number) {
  return new THREE.Color(color).multiplyScalar(factor);
}

/**
 * Procedural environment map for the current room, rendered ONCE (frames=1) into a small cubemap —
 * no HDRI download, no per-frame cost.
 *
 * Without any environment map, three's MeshStandardMaterial has nothing to reflect: a polished floor
 * with roughness 0.15 renders as matte as a carpet, and metal fixtures/frames go flat dark. This builds
 * a stand-in "room as seen from its center at eye height": a box tinted with the room's own wall/floor/
 * ceiling colors, plus a bright emissive disc at each real ceiling fixture position, so the floor
 * picks up soft reflections of the actual light layout.
 *
 * Known approximation: a cubemap is "infinitely far away", so reflections are exact from the room
 * center and drift slightly as the visitor walks — invisible on rough surfaces, subtle on glossy ones.
 */
export default function RoomEnvironment() {
  const { layout, exhibition } = useExhibition();
  const { theme } = exhibition;
  const { room, wallHeight, ceilingSpots } = layout;
  const [cx, cz] = room.center;
  const [w, d] = room.size;

  const colors = useMemo(
    () => ({
      walls: scaled(theme.wallColor, 0.55),
      floor: scaled(theme.floorColor, 0.35),
      ceiling: scaled(theme.ceilingColor, 0.7),
    }),
    [theme.wallColor, theme.floorColor, theme.ceilingColor]
  );

  // Positions relative to the cube camera (room center, eye height).
  const floorY = -EYE_HEIGHT;
  const ceilingY = wallHeight - EYE_HEIGHT;

  return (
    // Keyed so a changed room/theme re-renders the cubemap (frames=1 only renders on mount).
    <Environment
      key={`${exhibition.id}-${w}-${d}-${wallHeight}`}
      frames={1}
      resolution={ENVIRONMENT_RESOLUTION}
      environmentIntensity={ENVIRONMENT_INTENSITY}
    >
      <mesh position={[0, (floorY + ceilingY) / 2, 0]}>
        <boxGeometry args={[w, wallHeight, d]} />
        <meshBasicMaterial color={colors.walls} side={THREE.BackSide} toneMapped={false} />
      </mesh>
      <mesh position={[0, floorY + 0.01, 0]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[w, d]} />
        <meshBasicMaterial color={colors.floor} toneMapped={false} />
      </mesh>
      <mesh position={[0, ceilingY - 0.01, 0]} rotation-x={Math.PI / 2}>
        <planeGeometry args={[w, d]} />
        <meshBasicMaterial color={colors.ceiling} toneMapped={false} />
      </mesh>
      {ceilingSpots.map(([x, , z], i) => (
        <Lightformer
          key={i}
          form="circle"
          color={theme.spotColor}
          intensity={CEILING_FIXTURE_INTENSITY}
          scale={CEILING_FIXTURE_RADIUS}
          position={[x - cx, ceilingY - 0.03, z - cz]}
          rotation-x={Math.PI / 2}
        />
      ))}
    </Environment>
  );
}
