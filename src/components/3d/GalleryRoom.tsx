import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { useTexture } from "@react-three/drei";
import { useExhibition } from "./ExhibitionContext";
import {
  CEILING_TEXTURES,
  DEFAULT_CEILING_TEXTURE,
  DEFAULT_FLOOR_TEXTURE,
  DEFAULT_WALL_TEXTURE,
  FLOOR_TEXTURES,
  WALL_TEXTURES,
  findTexture,
  type SurfaceTexture,
} from "./surfaceTextures";
import type { WallSegment } from "./galleryLayout";
import { buildTexturedBoxGeometry } from "./textureUv";

/**
 * Static architecture of the current exhibition room: floor, ceiling and
 * walls. Pure geometry — no lights, no controls. Every surface renders as a
 * real photo-scanned PBR texture — diffuse + roughness map only, no normal
 * map, so the extra realism doesn't add fragment-shader cost. When the
 * exhibition picked an explicit preset (a `*TextureId`), that scan renders
 * as-is; when it only picked a flat RGB color (the custom room builder's
 * color mode), the color tints a neutral base scan (plaster/concrete)
 * instead of painting a perfectly flat material — a flat color with zero
 * surface variation reads as an artificial paint swatch, not a real room.
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
      <TexturedPlane
        position={[room.center[0], 0, room.center[1]]}
        rotation={[-Math.PI / 2, 0, 0]}
        size={room.size}
        texture={floorTexture ?? DEFAULT_FLOOR_TEXTURE}
        color={floorTexture ? undefined : theme.floorColor}
        roughness={floorTexture ? undefined : theme.floorRoughness}
        metalness={floorTexture ? undefined : theme.floorMetalness}
      />

      <TexturedPlane
        position={[room.center[0], wallHeight, room.center[1]]}
        rotation={[Math.PI / 2, 0, 0]}
        size={room.size}
        texture={ceilingTexture ?? DEFAULT_CEILING_TEXTURE}
        color={ceilingTexture ? undefined : theme.ceilingColor}
      />

      <TexturedWalls
        walls={walls}
        texture={wallTexture ?? DEFAULT_WALL_TEXTURE}
        color={wallTexture ? undefined : theme.wallColor}
        roughness={wallTexture ? undefined : theme.wallRoughness}
      />
    </group>
  );
}

// --- Textured surfaces ------------------------------------------------------
// Every surface goes through these (see module doc comment for why there's no
// separate flat-color path anymore).

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
  color,
  roughness,
  metalness,
}: {
  position: [number, number, number];
  rotation: [number, number, number];
  size: [number, number];
  texture: SurfaceTexture;
  /** Tints the color map — set when the exhibition picked a flat RGB color instead of this (fallback,
   * neutral) preset, so the chosen color still reads with the scan's surface variation. Undefined (no tint,
   * white multiply) when the exhibition explicitly chose this texture. */
  color?: string;
  roughness?: number;
  metalness?: number;
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
    () =>
      new THREE.MeshStandardMaterial({
        map,
        roughnessMap,
        metalness: metalness ?? 0,
        roughness: roughness ?? 1,
        color: color ?? "#ffffff",
      }),
    [map, roughnessMap, color, roughness, metalness]
  );

  return (
    <mesh position={position} rotation={rotation} receiveShadow material={material}>
      <planeGeometry args={size} />
    </mesh>
  );
}

function TexturedWalls({
  walls,
  texture,
  color,
  roughness,
}: {
  walls: WallSegment[];
  texture: SurfaceTexture;
  /** See TexturedPlane's `color` doc — same tint-over-neutral-scan fallback for custom room colors. */
  color?: string;
  roughness?: number;
}) {
  const { map, roughnessMap } = useSurfaceMaps(texture);

  // Shared material with repeat left at the texture's default (1,1) — each
  // wall's own geometry carries pre-scaled UVs instead, so wall runs of
  // different lengths all tile at the same real-world meters-per-tile.
  useEffect(() => {
    map.repeat.set(1, 1);
    roughnessMap.repeat.set(1, 1);
  }, [map, roughnessMap]);

  const material = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        map,
        roughnessMap,
        metalness: 0,
        roughness: roughness ?? 1,
        color: color ?? "#ffffff",
      }),
    [map, roughnessMap, color, roughness]
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
