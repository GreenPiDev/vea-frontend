import * as THREE from "three";

// Static (never-moving) instancing, shared by ArtworkFixtures and FurnitureInstances.
//
// They used drei's <Instances>/<Instance>, which is built for *animated* instances: by default
// (`frames = Infinity`) every <Instances> runs a useFrame that, on every rendered frame, decomposes and
// recomposes every instance's matrix and re-uploads the whole instanceMatrix + instanceColor buffers to the
// GPU — and every <Instance> is a scene-graph Group whose matrix three recomputes every frame too. Picture
// lamps and furniture never move, so all of that was pure waste on every walking frame (4 pools × N
// paintings for the lamps, one pool per sub-mesh for each furniture model). `frames={1}` isn't a safe fix
// either: on the first frame the <Instance> groups' world matrices haven't been updated yet. Here the
// matrices are written once, when the placements change, and never touched again.

export interface StaticInstance {
  position: readonly [number, number, number];
  /** Full rotation; takes precedence over `rotationY`. */
  quaternion?: THREE.Quaternion;
  /** Rotation about +Y (radians) when no quaternion is given. */
  rotationY?: number;
  /** Uniform or per-axis scale (default 1). */
  scale?: number | readonly [number, number, number];
}

const _position = new THREE.Vector3();
const _quaternion = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const _matrix = new THREE.Matrix4();
const Y_AXIS = new THREE.Vector3(0, 1, 0);

/** Writes the instance's local matrix into `target` (16 floats at `offset`, column-major — InstancedMesh layout). */
export function writeInstanceMatrix(instance: StaticInstance, target: Float32Array | number[], offset: number): void {
  _position.set(...instance.position);
  if (instance.quaternion) _quaternion.copy(instance.quaternion);
  else _quaternion.setFromAxisAngle(Y_AXIS, instance.rotationY ?? 0);
  const s = instance.scale ?? 1;
  if (typeof s === "number") _scale.setScalar(s);
  else _scale.set(...s);
  _matrix.compose(_position, _quaternion, _scale).toArray(target, offset);
}

/**
 * Fills an InstancedMesh from `instances` once: matrices, draw count, upload flag, and the bounding sphere
 * three culls the whole mesh by (InstancedMesh computes it lazily *once*, so it must be refreshed here, after
 * the matrices are in place — otherwise it could be computed from identity matrices and cull the mesh away).
 */
export function fillStaticInstances(mesh: THREE.InstancedMesh, instances: readonly StaticInstance[]): void {
  const array = mesh.instanceMatrix.array as Float32Array;
  const count = Math.min(instances.length, mesh.instanceMatrix.count);
  for (let i = 0; i < count; i++) writeInstanceMatrix(instances[i], array, i * 16);
  mesh.count = count;
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
}
