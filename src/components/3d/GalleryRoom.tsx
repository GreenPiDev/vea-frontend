import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { useTexture } from "@react-three/drei";
import { useExhibition } from "./ExhibitionContext";
import {
  CEILING_TEXTURES,
  FLOOR_TEXTURES,
  WALL_TEXTURES,
  findTexture,
  type SurfaceTexture,
} from "./surfaceTextures";
import type { WallSegment } from "./galleryLayout";
import { buildTexturedBoxGeometry } from "./textureUv";

/**
 * Static architecture of the current exhibition room: floor, ceiling and
 * walls. Pure geometry — no lights, no controls. Each surface is either a
 * flat theme color, or (when the exhibition picked one) a real photo-scanned
 * PBR texture — diffuse + roughness map only, no normal map, so the extra
 * realism doesn't add fragment-shader cost.
 */
export default function GalleryRoom() {
  const { layout, exhibition } = useExhibition();
  const { theme } = exhibition;
  const { room, walls, wallHeight } = layout;

  const floorTexture = findTexture(FLOOR_TEXTURES, theme.floorTextureId);
  const wallTexture = findTexture(WALL_TEXTURES, theme.wallTextureId);
  const ceilingTexture = findTexture(CEILING_TEXTURES, theme.ceilingTextureId);

  return (
    <group>
      {floorTexture ? (
        <TexturedPlane
          position={[room.center[0], 0, room.center[1]]}
          rotation={[-Math.PI / 2, 0, 0]}
          size={room.size}
          texture={floorTexture}
        />
      ) : (
        <ColorPlane
          position={[room.center[0], 0, room.center[1]]}
          rotation={[-Math.PI / 2, 0, 0]}
          size={room.size}
          color={theme.floorColor}
          roughness={theme.floorRoughness}
          metalness={theme.floorMetalness}
        />
      )}

      {ceilingTexture ? (
        <TexturedPlane
          position={[room.center[0], wallHeight, room.center[1]]}
          rotation={[Math.PI / 2, 0, 0]}
          size={room.size}
          texture={ceilingTexture}
        />
      ) : (
        <ColorPlane
          position={[room.center[0], wallHeight, room.center[1]]}
          rotation={[Math.PI / 2, 0, 0]}
          size={room.size}
          color={theme.ceilingColor}
          roughness={1}
          metalness={0}
        />
      )}

      {wallTexture ? (
        <TexturedWalls walls={walls} texture={wallTexture} />
      ) : (
        <ColorWalls walls={walls} color={theme.wallColor} roughness={theme.wallRoughness} />
      )}
    </group>
  );
}

// --- Flat-color surfaces (default, zero texture-memory cost) --------------

function ColorPlane({
  position,
  rotation,
  size,
  color,
  roughness,
  metalness,
}: {
  position: [number, number, number];
  rotation: [number, number, number];
  size: [number, number];
  color: string;
  roughness: number;
  metalness: number;
}) {
  const material = useMemo(
    () => new THREE.MeshStandardMaterial({ color, roughness, metalness }),
    [color, roughness, metalness]
  );
  return (
    <mesh position={position} rotation={rotation} receiveShadow material={material}>
      <planeGeometry args={size} />
    </mesh>
  );
}

function ColorWalls({
  walls,
  color,
  roughness,
}: {
  walls: WallSegment[];
  color: string;
  roughness: number;
}) {
  const material = useMemo(
    () => new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.0 }),
    [color, roughness]
  );
  return (
    <>
      {walls.map((wall) => (
        <mesh key={wall.id} position={wall.position} castShadow receiveShadow material={material}>
          <boxGeometry args={wall.size} />
        </mesh>
      ))}
    </>
  );
}

// --- Textured surfaces ------------------------------------------------------
// Each mounts only when its surface actually picked a texture, so the plain
// flat-color path (the common case) never touches useTexture/GPU uploads.

function useSurfaceMaps(texture: SurfaceTexture) {
  const [map, roughnessMap] = useTexture([texture.map, texture.roughnessMap]);
  useEffect(() => {
    for (const t of [map, roughnessMap]) {
      t.wrapS = THREE.RepeatWrapping;
      t.wrapT = THREE.RepeatWrapping;
      t.needsUpdate = true;
    }
  }, [map, roughnessMap]);
  return { map, roughnessMap };
}

function TexturedPlane({
  position,
  rotation,
  size,
  texture,
}: {
  position: [number, number, number];
  rotation: [number, number, number];
  size: [number, number];
  texture: SurfaceTexture;
}) {
  const { map, roughnessMap } = useSurfaceMaps(texture);

  // Plane UVs are 0..1 by default; scale via texture.repeat (safe here since
  // each plane is the sole user of this map instance's repeat setting).
  useEffect(() => {
    const repeatX = size[0] / texture.tileSize;
    const repeatY = size[1] / texture.tileSize;
    map.repeat.set(repeatX, repeatY);
    roughnessMap.repeat.set(repeatX, repeatY);
  }, [map, roughnessMap, size, texture.tileSize]);

  const material = useMemo(
    () => new THREE.MeshStandardMaterial({ map, roughnessMap, metalness: 0 }),
    [map, roughnessMap]
  );

  return (
    <mesh position={position} rotation={rotation} receiveShadow material={material}>
      <planeGeometry args={size} />
    </mesh>
  );
}

function TexturedWalls({ walls, texture }: { walls: WallSegment[]; texture: SurfaceTexture }) {
  const { map, roughnessMap } = useSurfaceMaps(texture);

  // Shared material with repeat left at the texture's default (1,1) — each
  // wall's own geometry carries pre-scaled UVs instead, so wall runs of
  // different lengths all tile at the same real-world meters-per-tile.
  useEffect(() => {
    map.repeat.set(1, 1);
    roughnessMap.repeat.set(1, 1);
  }, [map, roughnessMap]);

  const material = useMemo(
    () => new THREE.MeshStandardMaterial({ map, roughnessMap, metalness: 0 }),
    [map, roughnessMap]
  );

  const geometries = useMemo(
    () => walls.map((w) => buildTexturedBoxGeometry(w.size, texture.tileSize)),
    [walls, texture.tileSize]
  );

  useEffect(() => {
    return () => {
      for (const g of geometries) g.dispose();
    };
  }, [geometries]);

  return (
    <>
      {walls.map((wall, i) => (
        <mesh
          key={wall.id}
          position={wall.position}
          geometry={geometries[i]}
          material={material}
          castShadow
          receiveShadow
        />
      ))}
    </>
  );
}
