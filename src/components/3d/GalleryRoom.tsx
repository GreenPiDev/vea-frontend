import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { useTexture } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
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

// Exaggerates the ceiling's normal map perturbation strength (MeshStandardMaterial's default
// normalScale is [1,1], i.e. the map's own baked depth, unmodified). The ceiling's own lighting
// is close to head-on (see GalleryLights.tsx's doc comment on why a grazing light was tried and
// reverted there instead of here) so its bump shading reads weaker than the walls' at matching
// roughness — boosting normalScale compensates without touching any light or other surface.
const CEILING_NORMAL_SCALE: [number, number] = [2.5, 2.5];

/**
 * Static architecture of the current exhibition room: floor, ceiling and
 * walls. Pure geometry — no lights, no controls. Every surface renders as a
 * real photo-scanned PBR texture — diffuse + roughness + normal map, so
 * light catches per-pixel surface detail instead of bouncing off a
 * perfectly flat plane. When the exhibition picked an explicit preset (a
 * `*TextureId`), that scan renders as-is; when it only picked a flat RGB
 * color (the custom room builder's color mode), the color tints a neutral
 * base scan (plaster/concrete) instead of painting a perfectly flat
 * material — a flat color with zero surface variation reads as an
 * artificial paint swatch, not a real room.
 */
export default function GalleryRoom() {
  const { layout, exhibition } = useExhibition();
  const { theme } = exhibition;
  const { room, walls, wallHeight } = layout;

  const floorTexture = findTexture(FLOOR_TEXTURES, theme.floorTextureId) ?? DEFAULT_FLOOR_TEXTURE;
  const wallTexture = findTexture(WALL_TEXTURES, theme.wallTextureId) ?? DEFAULT_WALL_TEXTURE;
  const ceilingTexture = findTexture(CEILING_TEXTURES, theme.ceilingTextureId);

  return (
    <group>
      <TexturedPlane
        position={[room.center[0], 0, room.center[1]]}
        rotation={[-Math.PI / 2, 0, 0]}
        size={room.size}
        texture={floorTexture}
        color={theme.floorTextureId ? undefined : theme.floorColor}
        roughness={theme.floorTextureId ? undefined : theme.floorRoughness}
        metalness={theme.floorTextureId ? undefined : theme.floorMetalness}
        normalScale={floorTexture.normalScale}
      />

      <TexturedPlane
        position={[room.center[0], wallHeight, room.center[1]]}
        rotation={[Math.PI / 2, 0, 0]}
        size={room.size}
        texture={ceilingTexture ?? DEFAULT_CEILING_TEXTURE}
        color={ceilingTexture ? undefined : theme.ceilingColor}
        // No dedicated ceilingRoughness field on the theme — reuses wallRoughness (same
        // painted-surface assumption) so a colored ceiling isn't stuck at the default
        // MeshStandardMaterial roughness of 1, which leaves dark colors (near-black especially)
        // with almost no diffuse or specular response and reads as a flat void instead of a surface.
        roughness={ceilingTexture ? undefined : theme.wallRoughness}
        normalScale={CEILING_NORMAL_SCALE}
      />

      <TexturedWalls
        walls={walls}
        texture={wallTexture}
        color={theme.wallTextureId ? undefined : theme.wallColor}
        roughness={theme.wallTextureId ? undefined : theme.wallRoughness}
      />
    </group>
  );
}

// --- Textured surfaces ------------------------------------------------------
// Every surface goes through these (see module doc comment for why there's no
// separate flat-color path anymore).

function useSurfaceMaps(texture: SurfaceTexture) {
  const [map, roughnessMap, normalMap] = useTexture([
    texture.map,
    texture.roughnessMap,
    texture.normalMap,
  ]);
  const gl = useThree((state) => state.gl);
  useEffect(() => {
    // Floor/walls are viewed at a steep grazing angle (a ground plane stretching to the
    // horizon) — mipmapping alone blurs those pixels far more than the near ones since it
    // picks one mip level per pixel regardless of direction. Anisotropic filtering samples
    // more texels along the foreshortened axis instead, fixing the "distance looks out of
    // focus" look. GPU/driver-side sampling cost only — no extra geometry or textures — so
    // it's effectively free on any GPU this scene already targets.
    const maxAnisotropy = gl.capabilities.getMaxAnisotropy();
    for (const t of [map, roughnessMap, normalMap]) {
      t.wrapS = THREE.RepeatWrapping;
      t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = maxAnisotropy;
      t.needsUpdate = true;
    }
  }, [map, roughnessMap, normalMap, gl]);
  return { map, roughnessMap, normalMap };
}

function TexturedPlane({
  position,
  rotation,
  size,
  texture,
  color,
  roughness,
  metalness,
  normalScale,
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
  /** Multiplies the normal map's baked perturbation strength; defaults to [1,1] (unmodified) if unset. */
  normalScale?: [number, number];
}) {
  const { map, roughnessMap, normalMap } = useSurfaceMaps(texture);

  // Plane UVs are 0..1 by default; scale via texture.repeat (safe here since
  // each plane is the sole user of this map instance's repeat setting).
  useEffect(() => {
    const repeatX = size[0] / texture.tileSize;
    const repeatY = size[1] / texture.tileSize;
    map.repeat.set(repeatX, repeatY);
    roughnessMap.repeat.set(repeatX, repeatY);
    normalMap.repeat.set(repeatX, repeatY);
  }, [map, roughnessMap, normalMap, size, texture.tileSize]);

  const material = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        map,
        roughnessMap,
        normalMap,
        normalScale: new THREE.Vector2(...(normalScale ?? [1, 1])),
        metalness: metalness ?? 0,
        roughness: roughness ?? 1,
        color: color ?? "#ffffff",
      }),
    [map, roughnessMap, normalMap, color, roughness, metalness, normalScale]
  );

  return (
    <mesh position={position} rotation={rotation} material={material}>
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
  const { map, roughnessMap, normalMap } = useSurfaceMaps(texture);

  // Shared material with repeat left at the texture's default (1,1) — each
  // wall's own geometry carries pre-scaled UVs instead, so wall runs of
  // different lengths all tile at the same real-world meters-per-tile.
  useEffect(() => {
    map.repeat.set(1, 1);
    roughnessMap.repeat.set(1, 1);
    normalMap.repeat.set(1, 1);
  }, [map, roughnessMap, normalMap]);

  const material = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        map,
        roughnessMap,
        normalMap,
        normalScale: new THREE.Vector2(...texture.normalScale),
        metalness: 0,
        roughness: roughness ?? 1,
        color: color ?? "#ffffff",
      }),
    [map, roughnessMap, normalMap, color, roughness, texture.normalScale]
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
        />
      ))}
    </>
  );
}
