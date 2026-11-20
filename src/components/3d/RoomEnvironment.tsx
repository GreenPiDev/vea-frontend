import { useMemo } from "react";
import * as THREE from "three";
import { Environment, Lightformer } from "@react-three/drei";
import { useExhibition } from "./ExhibitionContext";
import { EYE_HEIGHT, WALL_THICKNESS } from "./galleryLayout";
import { ENVIRONMENT_INTENSITY, ENV_CEILING_COLOR_SCALE, ENV_CEILING_FIXTURE_INTENSITY, ENV_WINDOW_INTENSITY } from "./sceneLighting";
import { windowViewRadiance } from "./windowLight";
import { facing } from "./windowGeometry";
import { findOutdoorPanorama } from "./outdoorPanoramas";

// Env strength and fixture brightness live in sceneLighting.ts with the rest of the exposure balance.
// Cubemap face size. Reflections on this scene's surfaces are all rough enough to be blurred by PMREM
// anyway, so a higher resolution would only cost VRAM/startup time without visible gain.
const ENVIRONMENT_RESOLUTION = 128;
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
 * A cubemap is "infinitely far away" on its own, so reflections would be exact only from the room
 * center and slide along as the visitor walks. roomAoMaterial.ts box-projects the lookup on the room's
 * floor/walls/ceiling against the same inner box built here (wall inner faces, floor to ceiling), which
 * pins the fixtures' reflections in place — keep the two boxes in sync.
 */
export default function RoomEnvironment() {
  const { layout, exhibition } = useExhibition();
  const { theme } = exhibition;
  const { room, wallHeight, ceilingSpots, windows } = layout;
  const [cx, cz] = room.center;
  // Inner wall faces — walls are centered on the footprint edge (see galleryLayout.ts).
  const w = room.size[0] - WALL_THICKNESS;
  const d = room.size[1] - WALL_THICKNESS;

  const colors = useMemo(
    () => ({
      walls: scaled(theme.wallColor, 0.55),
      floor: scaled(theme.floorColor, 0.35),
      ceiling: scaled(theme.ceilingColor, ENV_CEILING_COLOR_SCALE),
    }),
    [theme.wallColor, theme.floorColor, theme.ceilingColor]
  );

  // Each window as a bright panel just inside its wall, as bright as the view through it — so glossy floors,
  // glass and metal reflect the windows, and the reflection matches what you see in the window itself.
  // Divided by ENVIRONMENT_INTENSITY because materials scale the whole env map by it.
  const panorama = findOutdoorPanorama(exhibition.outdoor?.panoramaId);
  const rotation = exhibition.outdoor?.rotationY ?? 0;
  const windowPanels = useMemo(
    () =>
      (windows ?? []).map((o) => {
        const rgb = windowViewRadiance(o, panorama.id, rotation, panorama.intensity);
        const peak = Math.max(...rgb, 1e-6);
        return {
          id: o.id,
          color: new THREE.Color(rgb[0] / peak, rgb[1] / peak, rgb[2] / peak),
          intensity: (peak * ENV_WINDOW_INTENSITY) / ENVIRONMENT_INTENSITY,
          position: [
            o.center[0] + o.inward[0] * (o.depth / 2 + 0.02) - cx,
            o.center[1] - EYE_HEIGHT,
            o.center[2] + o.inward[1] * (o.depth / 2 + 0.02) - cz,
          ] as [number, number, number],
          rotationY: facing(o.inward),
          scale: [o.width, o.height, 1] as [number, number, number],
        };
      }),
    [windows, panorama.id, panorama.intensity, rotation, cx, cz]
  );

  // Positions relative to the cube camera (room center, eye height).
  const floorY = -EYE_HEIGHT;
  const ceilingY = wallHeight - EYE_HEIGHT;

  return (
    // Keyed so a changed room/theme re-renders the cubemap (frames=1 only renders on mount).
    <Environment
      key={`${exhibition.id}-${w}-${d}-${wallHeight}-${windowPanels.length}`}
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
      {ceilingSpots.map(([x, y, z], i) => (
        <Lightformer
          key={i}
          form="circle"
          color={theme.spotColor}
          intensity={ENV_CEILING_FIXTURE_INTENSITY}
          scale={CEILING_FIXTURE_RADIUS}
          // At the fixture's own height (spots hang 10 cm under their ceiling — a mezzanine's underside too).
          position={[x - cx, y + 0.07 - EYE_HEIGHT, z - cz]}
          rotation-x={Math.PI / 2}
        />
      ))}
      {windowPanels.map((p) => (
        <Lightformer
          key={p.id}
          form="rect"
          color={p.color}
          intensity={p.intensity}
          scale={p.scale}
          position={p.position}
          rotation-y={p.rotationY}
        />
      ))}
    </Environment>
  );
}
