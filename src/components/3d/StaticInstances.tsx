import { useLayoutEffect, useRef } from "react";
import * as THREE from "three";
import { fillStaticInstances, type StaticInstance } from "./instanceMatrices";

/**
 * One InstancedMesh for copies of a geometry that never move (see instanceMatrices.ts for why this replaced
 * drei's <Instances>): one draw call, matrices written once when `instances` changes, nothing per frame.
 * `instances` should be memoised by the caller — a new array re-uploads the matrices.
 */
export default function StaticInstances({
  geometry,
  material,
  instances,
}: {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  instances: readonly StaticInstance[];
}) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const count = instances.length;

  useLayoutEffect(() => {
    if (ref.current) fillStaticInstances(ref.current, instances);
  }, [instances]);

  if (count === 0) return null;
  return (
    <instancedMesh
      // Instance capacity is fixed at construction, so a different count needs a fresh mesh.
      key={count}
      ref={ref}
      args={[geometry, material, count]}
      // Static: three doesn't need to recompute this object's own (identity) matrix every frame.
      matrixAutoUpdate={false}
      raycast={() => null}
    />
  );
}
