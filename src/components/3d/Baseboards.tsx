import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { useExhibition } from "./ExhibitionContext";

const BASEBOARD_HEIGHT = 0.12;
// A sharp-edged box reads as a flat strip glued to the wall under any lighting — real moldings sell
// their shape through a highlight/shadow line along their edges, not their (usually plain-painted,
// untextured) surface. RoundedBoxGeometry bevels all edges uniformly in local space regardless of
// which world axis a given wall runs along, so it's a drop-in swap for the old boxGeometry with no
// per-wall orientation math needed. Kept small (1.5cm) and low-segment — cheap in triangle count, and
// the chamfer only needs to be a couple pixels wide on screen to read as a real profile.
const BASEBOARD_EDGE_RADIUS = 0.015;
const BASEBOARD_EDGE_SEGMENTS = 1;

/** Thin skirting boards along every wall base — a small detail that keeps the room from reading as a flat CG box. */
export default function Baseboards() {
  const { layout } = useExhibition();
  const material = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#3a3733",
        // Lowered from 0.4 — trim paint is usually semi-gloss, and a glossier surface is what actually
        // lets the chamfered edge above catch a visible highlight line instead of just a soft gradient.
        roughness: 0.3,
        metalness: 0.05,
      }),
    []
  );

  const geometries = useMemo(
    () =>
      layout.walls.map(
        (wall) =>
          new RoundedBoxGeometry(
            wall.size[0] + 0.02,
            BASEBOARD_HEIGHT,
            wall.size[2] + 0.02,
            BASEBOARD_EDGE_SEGMENTS,
            BASEBOARD_EDGE_RADIUS
          )
      ),
    [layout.walls]
  );

  useEffect(() => {
    return () => {
      for (const g of geometries) g.dispose();
    };
  }, [geometries]);

  return (
    <group>
      {layout.walls.map((wall, i) => (
        <mesh
          key={`baseboard-${wall.id}`}
          position={[wall.position[0], BASEBOARD_HEIGHT / 2, wall.position[2]]}
          geometry={geometries[i]}
          material={material}
        />
      ))}
    </group>
  );
}
