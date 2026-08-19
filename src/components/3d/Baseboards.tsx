import { useMemo } from "react";
import * as THREE from "three";
import { useExhibition } from "./ExhibitionContext";

const BASEBOARD_HEIGHT = 0.12;

/** Thin skirting boards along every wall base — a small detail that keeps the room from reading as a flat CG box. */
export default function Baseboards() {
  const { layout } = useExhibition();
  const material = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#3a3733",
        roughness: 0.4,
        metalness: 0.05,
      }),
    []
  );

  return (
    <group>
      {layout.walls.map((wall) => (
        <mesh
          key={`baseboard-${wall.id}`}
          position={[wall.position[0], BASEBOARD_HEIGHT / 2, wall.position[2]]}
          material={material}
          receiveShadow
        >
          <boxGeometry args={[wall.size[0] + 0.02, BASEBOARD_HEIGHT, wall.size[2] + 0.02]} />
        </mesh>
      ))}
    </group>
  );
}
