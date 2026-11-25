import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { useTexture } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { useExhibition } from "./ExhibitionContext";
import { isTouchPrimaryDevice } from "../../lib/navigationMode";
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
import { buildTexturedBoxGeometry, buildWorldUvBoxGeometry } from "./textureUv";
import { splitWallsAroundOpenings } from "./windowOpenings";
import WindowFixtures from "./WindowFixtures";
import { BASEBOARD_ROUGHNESS, baseboardColor, buildBaseboardGeometry } from "./baseboard";
import { DEFAULT_AO_FIELD_OPTIONS, buildRoomAoField } from "./roomAo";
import {
  applyRoomAo,
  createRoomAoUniforms,
  type DaylightBakeUniforms,
  type RoomAoSurface,
  type RoomAoUniforms,
  type RoomDaylight,
} from "./roomAoMaterial";
import { addDaylightUv, buildDaylightAtlas, createDaylightTarget, rectUv, type DaylightAtlas } from "./daylightBake";
import DaylightBaker from "./DaylightBaker";
import { onSlab, type Mezzanine } from "./mezzanine";

// The ceiling scan's own baked depth, unexaggerated. It used to be boosted to 2.5 to make the bump
// shading read under near head-on light, but that turned plaster into a blotchy, marble-like surface
// that pulled the eye up (sergi-gercekcilestirme.md Adım 3) — a gallery ceiling should be calm.
const CEILING_NORMAL_SCALE: [number, number] = [1, 1];

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
  const { room, walls, wallHeight, furniture, windows, mezzanine } = layout;
  // Walls with windows are drawn as solid pieces around the openings (colliders/AO keep the whole wall). A
  // mezzanine's exposed slab edges render (and bake) as extra wall pieces.
  const renderWalls = useMemo(
    () => [...splitWallsAroundOpenings(walls, windows ?? []), ...(mezzanine?.edgeFaces ?? [])],
    [walls, windows, mezzanine]
  );
  // Contact shadows per level: the room floor's field only knows the furniture standing on it.
  const groundFurniture = useMemo(() => (mezzanine ? furniture?.filter((f) => !onSlab(f)) : furniture), [furniture, mezzanine]);

  const floorTexture = findTexture(FLOOR_TEXTURES, theme.floorTextureId) ?? DEFAULT_FLOOR_TEXTURE;
  const wallTexture = findTexture(WALL_TEXTURES, theme.wallTextureId) ?? DEFAULT_WALL_TEXTURE;
  const ceilingTexture = findTexture(CEILING_TEXTURES, theme.ceilingTextureId);

  // Computed once per layout (a few ms even for a large custom room), see roomAo.ts.
  const aoUniforms = useMemo(
    () =>
      createRoomAoUniforms(
        buildRoomAoField(room, walls, groundFurniture),
        wallHeight,
        DEFAULT_AO_FIELD_OPTIONS.wall.radius
      ),
    [room, walls, wallHeight, groundFurniture]
  );
  useEffect(() => () => aoUniforms.uRoomAoMap.value?.dispose(), [aoUniforms]);
  // The slab's own field: same footprint and walls (wall AO + env box stay right), its own furniture.
  const slabAoUniforms = useMemo(
    () =>
      mezzanine
        ? createRoomAoUniforms(buildRoomAoField(room, walls, furniture?.filter(onSlab)), wallHeight, DEFAULT_AO_FIELD_OPTIONS.wall.radius)
        : null,
    [mezzanine, room, walls, wallHeight, furniture]
  );
  useEffect(() => () => slabAoUniforms?.uRoomAoMap.value?.dispose(), [slabAoUniforms]);

  // Windowed rooms: floor/ceiling/walls read their daylight from a baked atlas (daylightBake.ts) instead
  // of evaluating it per pixel; rooms without windows compile no daylight code at all.
  const bake = useMemo(() => {
    if (!windows?.length) return null;
    const atlas = buildDaylightAtlas(renderWalls, room, wallHeight);
    const target = createDaylightTarget(atlas);
    const uniforms: DaylightBakeUniforms = {
      uDaylightMap: { value: target.texture },
      uDaylightBounds: { value: new THREE.Vector4(...atlas.bounds) },
      uDaylightFloorRect: { value: new THREE.Vector4(...rectUv(atlas, atlas.floor)) },
      uDaylightCeilingRect: { value: new THREE.Vector4(...rectUv(atlas, atlas.ceiling)) },
    };
    return { atlas, target, daylight: { mode: "baked", uniforms } as RoomDaylight };
  }, [windows, renderWalls, room, wallHeight]);
  useEffect(() => () => bake?.target.dispose(), [bake]);
  const surfaceDaylight: RoomDaylight = bake?.daylight ?? NO_DAYLIGHT;
  // Baseboards aren't in the atlas: live terms where there are windows.
  const baseboardDaylight: RoomDaylight = bake ? LIVE_DAYLIGHT : NO_DAYLIGHT;

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
        aoSurface="floor"
        aoUniforms={aoUniforms}
        daylight={surfaceDaylight}
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
        aoSurface="ceiling"
        aoUniforms={aoUniforms}
        daylight={surfaceDaylight}
      />

      <TexturedWalls
        walls={renderWalls}
        texture={wallTexture}
        color={theme.wallTextureId ? undefined : theme.wallColor}
        roughness={theme.wallTextureId ? undefined : theme.wallRoughness}
        aoUniforms={aoUniforms}
        daylight={surfaceDaylight}
        atlas={bake?.atlas ?? null}
      />

      <Baseboards walls={renderWalls} wallColor={theme.wallColor} aoUniforms={aoUniforms} daylight={baseboardDaylight} />

      {mezzanine && slabAoUniforms && (
        <MezzanineSlab
          mezzanine={mezzanine}
          room={room}
          floorTexture={floorTexture}
          ceilingTexture={ceilingTexture ?? DEFAULT_CEILING_TEXTURE}
          theme={theme}
          ceilingTinted={!ceilingTexture}
          topAo={slabAoUniforms}
          undersideAo={aoUniforms}
          // Not in the daylight atlas (it's keyed by x/z, which the room floor/ceiling already use): live terms.
          daylight={bake ? LIVE_DAYLIGHT : NO_DAYLIGHT}
        />
      )}

      {bake && <DaylightBaker atlas={bake.atlas} target={bake.target} />}

      {windows && windows.length > 0 && <WindowFixtures windows={windows} />}
    </group>
  );
}

const NO_DAYLIGHT: RoomDaylight = { mode: "none" };
const LIVE_DAYLIGHT: RoomDaylight = { mode: "live" };

/** Skirting boards along every wall base, lit through the walls' own room-AO patch (see baseboard.ts). */
function Baseboards({
  walls,
  wallColor,
  aoUniforms,
  daylight,
}: {
  walls: WallSegment[];
  wallColor: string;
  aoUniforms: RoomAoUniforms;
  daylight: RoomDaylight;
}) {
  const geometry = useMemo(() => buildBaseboardGeometry(walls), [walls]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const material = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({
      color: baseboardColor(wallColor),
      roughness: BASEBOARD_ROUGHNESS,
      metalness: 0,
    });
    applyRoomAo(m, "wall", aoUniforms, undefined, daylight, { baseboard: true });
    return m;
  }, [wallColor, aoUniforms, daylight]);
  useEffect(() => () => material.dispose(), [material]);
  return <mesh geometry={geometry} material={material} />;
}

/**
 * A mezzanine's walk surface and underside: the room floor's and ceiling's own scans (same texture
 * instances, so their UVs are fractions of the room footprint, exactly like the room's floor/ceiling planes —
 * the parquet runs on unbroken from the floor plane's tiling). The edges are wall pieces (GalleryRoom).
 */
function MezzanineSlab({
  mezzanine,
  room,
  floorTexture,
  ceilingTexture,
  theme,
  ceilingTinted,
  topAo,
  undersideAo,
  daylight,
}: {
  mezzanine: Mezzanine;
  room: { center: [number, number]; size: [number, number] };
  floorTexture: SurfaceTexture;
  ceilingTexture: SurfaceTexture;
  theme: ReturnType<typeof useExhibition>["exhibition"]["theme"];
  ceilingTinted: boolean;
  topAo: RoomAoUniforms;
  undersideAo: RoomAoUniforms;
  daylight: RoomDaylight;
}) {
  // Individual textures as memo deps: useSurfaceMaps returns a fresh object every render (a material rebuilt
  // per render cost ~8 fps once, see the balcony perf note in CLAUDE.md).
  const { map: floorMap, roughnessMap: floorRough, normalMap: floorNormal } = useSurfaceMaps(floorTexture);
  const { map: ceilingMap, roughnessMap: ceilingRough, normalMap: ceilingNormal } = useSurfaceMaps(ceilingTexture);
  const { rect, top, underside } = mezzanine;

  const geometries = useMemo(() => {
    const minX = room.center[0] - room.size[0] / 2;
    const minZ = room.center[1] - room.size[1] / 2;
    const plane = (y: number, faceUp: boolean) => {
      const g = new THREE.PlaneGeometry(rect.maxX - rect.minX, rect.maxZ - rect.minZ);
      g.rotateX(faceUp ? -Math.PI / 2 : Math.PI / 2);
      g.translate((rect.minX + rect.maxX) / 2, y, (rect.minZ + rect.maxZ) / 2);
      // Same mapping as the room's floor (rotated −π/2: v runs north) / ceiling (+π/2: v runs south) planes.
      const pos = g.attributes.position;
      const uv = g.attributes.uv;
      for (let i = 0; i < pos.count; i++) {
        const u = (pos.getX(i) - minX) / room.size[0];
        const fz = (pos.getZ(i) - minZ) / room.size[1];
        uv.setXY(i, u, faceUp ? 1 - fz : fz);
      }
      return g;
    };
    return { top: plane(top, true), underside: plane(underside, false) };
  }, [rect, top, underside, room]);
  useEffect(() => () => {
    geometries.top.dispose();
    geometries.underside.dispose();
  }, [geometries]);

  const materials = useMemo(() => {
    const topMat = new THREE.MeshStandardMaterial({
      map: floorMap,
      roughnessMap: floorRough,
      normalMap: floorNormal,
      normalScale: new THREE.Vector2(...floorTexture.normalScale),
      metalness: theme.floorTextureId ? 0 : (theme.floorMetalness ?? 0),
      roughness: theme.floorTextureId ? 1 : (theme.floorRoughness ?? 1),
      color: theme.floorTextureId ? "#ffffff" : theme.floorColor,
    });
    applyRoomAo(topMat, "floor", topAo, floorTexture.macroVariation, daylight);
    const underMat = new THREE.MeshStandardMaterial({
      map: ceilingMap,
      roughnessMap: ceilingRough,
      normalMap: ceilingNormal,
      normalScale: new THREE.Vector2(...CEILING_NORMAL_SCALE),
      metalness: 0,
      roughness: ceilingTinted ? theme.wallRoughness : 1,
      color: ceilingTinted ? theme.ceilingColor : "#ffffff",
    });
    applyRoomAo(underMat, "ceiling", undersideAo, undefined, daylight);
    return { top: topMat, underside: underMat };
  }, [floorMap, floorRough, floorNormal, ceilingMap, ceilingRough, ceilingNormal, floorTexture, theme, ceilingTinted, topAo, undersideAo, daylight]);
  useEffect(() => () => {
    materials.top.dispose();
    materials.underside.dispose();
  }, [materials]);

  return (
    <>
      <mesh geometry={geometries.top} material={materials.top} />
      <mesh geometry={geometries.underside} material={materials.underside} />
    </>
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
    // Phones: capped at 4× — 16× on a floor filling half a high-resolution screen is a real fill-rate cost
    // on mobile GPUs, and 4× already removes the distance blur.
    const maxAnisotropy = Math.min(gl.capabilities.getMaxAnisotropy(), isTouchPrimaryDevice() ? 4 : Infinity);
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
  aoSurface,
  aoUniforms,
  daylight,
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
  aoSurface: RoomAoSurface;
  aoUniforms: RoomAoUniforms;
  daylight: RoomDaylight;
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

  const material = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({
      map,
      roughnessMap,
      normalMap,
      normalScale: new THREE.Vector2(...(normalScale ?? [1, 1])),
      metalness: metalness ?? 0,
      roughness: roughness ?? 1,
      color: color ?? "#ffffff",
    });
    // The ceiling keeps applyRoomAo's calmer default; floors use the scan's own amplitude.
    applyRoomAo(m, aoSurface, aoUniforms, aoSurface === "ceiling" ? undefined : texture.macroVariation, daylight);
    return m;
  }, [map, roughnessMap, normalMap, color, roughness, metalness, normalScale, aoSurface, aoUniforms, texture.macroVariation, daylight]);

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
  aoUniforms,
  daylight,
  atlas,
}: {
  walls: WallSegment[];
  texture: SurfaceTexture;
  /** See TexturedPlane's `color` doc — same tint-over-neutral-scan fallback for custom room colors. */
  color?: string;
  roughness?: number;
  aoUniforms: RoomAoUniforms;
  daylight: RoomDaylight;
  /** Daylight atlas of a windowed room — each wall geometry gets its `daylightUv` into it. */
  atlas: DaylightAtlas | null;
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

  const material = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({
      map,
      roughnessMap,
      normalMap,
      normalScale: new THREE.Vector2(...texture.normalScale),
      metalness: 0,
      roughness: roughness ?? 1,
      color: color ?? "#ffffff",
    });
    applyRoomAo(m, "wall", aoUniforms, texture.macroVariation, daylight);
    return m;
  }, [map, roughnessMap, normalMap, color, roughness, texture.normalScale, texture.macroVariation, aoUniforms, daylight]);

  const geometries = useMemo(
    () =>
      walls.map((w, i) => {
        // Pieces of a wall cut around a window (id "wall:n") share world-anchored UVs so the scan runs on
        // across the cut; whole walls keep their own UVs (unchanged look in rooms without windows).
        const geometry = w.id.includes(":")
          ? buildWorldUvBoxGeometry(w.size, w.position, texture.tileSize)
          : buildTexturedBoxGeometry(w.size, texture.tileSize);
        if (atlas) addDaylightUv(geometry, atlas, i, w.size);
        return geometry;
      }),
    [walls, texture.tileSize, atlas]
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
