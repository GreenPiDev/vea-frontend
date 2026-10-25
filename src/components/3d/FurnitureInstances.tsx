import { useMemo } from "react";
import * as THREE from "three";
import { useGLTF, Instance, Instances } from "@react-three/drei";

export interface FurniturePlacementTransform {
  position: [number, number, number];
  rotationY: number;
}

interface SubMeshPart {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
}

// Rebuilds an attribute as a plain, non-interleaved, non-normalized
// Float32BufferAttribute by reading through getComponent() (which always
// correctly decodes stride/offset/int-normalization, regardless of the
// source layout) instead of touching the backing array directly. Needed
// because some real-world GLTF exports (e.g. this app's heavier furniture
// models) use KHR_mesh_quantization — interleaved, int16-backed, `normalized:
// true` attributes — and BufferGeometry.applyMatrix4()'s in-place
// position.setXYZ()/normal.applyNormalMatrix() writes on an interleaved
// quantized buffer corrupt the mesh (every placed instance of that part
// renders as shredded/garbled geometry) instead of cleanly transforming it.
// Plain float attributes have none of these failure modes.
function materializeAttribute(attr: THREE.BufferAttribute | THREE.InterleavedBufferAttribute): THREE.BufferAttribute {
  const array = new Float32Array(attr.count * attr.itemSize);
  for (let i = 0; i < attr.count; i++) {
    for (let c = 0; c < attr.itemSize; c++) {
      array[i * attr.itemSize + c] = attr.getComponent(i, c);
    }
  }
  return new THREE.BufferAttribute(array, attr.itemSize);
}

/**
 * Traverses a loaded GLTF scene once and bakes each mesh's own local
 * transform (its position/rotation/scale relative to the model's root node
 * — a real asset is rarely one single mesh at the origin, e.g. the antique
 * canape's frame/cushions/trim are separate child meshes) directly into a
 * safe, plain-float copy of its geometry via matrixWorld (see
 * materializeAttribute above for why a plain geometry.clone() isn't safe to
 * transform in place). `scene.updateMatrixWorld` here computes "world"
 * relative to the scene itself as root, since this GLTF scene is never
 * actually parented into the real Three.js scene graph — exactly the frame
 * we want. Once baked, every part can be instanced with nothing but the
 * room-placement transform on top, instead of having to reproduce the
 * model's internal node hierarchy per placed copy.
 */
function extractParts(scene: THREE.Object3D): SubMeshPart[] {
  scene.updateMatrixWorld(true);
  const parts: SubMeshPart[] = [];
  scene.traverse((child) => {
    if (child instanceof THREE.Mesh && !Array.isArray(child.material)) {
      const geometry = new THREE.BufferGeometry();
      for (const name of ["position", "normal", "uv"] as const) {
        const attr = child.geometry.getAttribute(name);
        if (attr) geometry.setAttribute(name, materializeAttribute(attr));
      }
      if (child.geometry.index) geometry.setIndex(child.geometry.index.clone());
      geometry.applyMatrix4(child.matrixWorld);
      parts.push({ geometry, material: child.material });
    }
  });
  return parts;
}

interface FurnitureInstancesProps {
  modelUrl: string;
  scale?: number;
  placements: FurniturePlacementTransform[];
}

/**
 * One furniture model, however many times a curator placed it in the room,
 * rendered as one InstancedMesh per sub-part (drei's Instances/Instance —
 * same GPU-instancing pattern ArtworkFixtures.tsx already uses for picture-
 * light fixtures) instead of one full scene graph clone per placement. A
 * curator can't control how many copies end up in a room, so draw calls
 * must stay flat (one per *model part*, not per placed instance) regardless
 * of count — useGLTF's url-keyed cache also means the model itself is only
 * downloaded/parsed once no matter how many FurnitureInstances mount it.
 */
export default function FurnitureInstances({ modelUrl, scale = 1, placements }: FurnitureInstancesProps) {
  const { scene } = useGLTF(modelUrl);
  const parts = useMemo(() => extractParts(scene), [scene]);

  if (placements.length === 0) return null;

  return (
    <>
      {parts.map((part, i) => (
        <Instances key={i} limit={placements.length} geometry={part.geometry} material={part.material}>
          {placements.map((p, j) => (
            <Instance key={j} position={p.position} rotation={[0, p.rotationY, 0]} scale={scale} />
          ))}
        </Instances>
      ))}
    </>
  );
}
