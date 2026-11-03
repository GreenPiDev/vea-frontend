import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { useTexture, Text } from "@react-three/drei";
import type { Artwork as ArtworkData, FrameStyle } from "./artworks";
import { FRAME_TEXTURES } from "./frameTextures";
import { buildTexturedBoxGeometry } from "./textureUv";
import { FRAME_BORDER, FRAME_DEPTH } from "./artworkShadow";
import { WEAVE_TILE_METERS, getCanvasWeaveNormalMap } from "./canvasWeave";

// Paint surface: a painting isn't a matte print. A thin varnish layer gives it a soft sheen the picture
// light can catch (0.65 read like paper), and the shared linen weave normal map breaks that sheen up the
// way real canvas does when seen close. Kept modest on purpose — glare must never hide the artwork,
// and the picture light comes from steeply above, so its mirror highlight lands toward the floor, not
// the visitor's eye. (No per-material envMapIntensity: three overrides it with scene.environmentIntensity
// whenever the env map comes from scene.environment, as RoomEnvironment.tsx's does.)
const CANVAS_ROUGHNESS = 0.5;
const CANVAS_NORMAL_SCALE = new THREE.Vector2(0.35, 0.35);

// Keyed by frame style — every painting using, say, "modernBlack" gets the exact same frame look, so
// there's no reason for each one to own its own MeshStandardMaterial (and its own
// map/roughnessMap/metalnessMap bindings) when they're all identical.
const frameMaterialCache = new Map<FrameStyle, THREE.MeshStandardMaterial>();

/** A single framed, lit, labeled painting mounted flush on a gallery wall. */
export default function Artwork({ data }: { data: ArtworkData }) {
  const texture = useTexture(data.image);

  useMemo(() => {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
  }, [texture]);

  const width = data.height * data.aspect;

  // Second UV set in meters/tile for the weave (see canvasWeave.ts) — the color map keeps the 0..1 `uv`.
  const canvasGeometry = useMemo(() => {
    const geometry = new THREE.PlaneGeometry(width, data.height);
    const uv1 = geometry.attributes.uv.clone();
    for (let i = 0; i < uv1.count; i++) {
      uv1.setXY(i, (uv1.getX(i) * width) / WEAVE_TILE_METERS, (uv1.getY(i) * data.height) / WEAVE_TILE_METERS);
    }
    geometry.setAttribute("uv1", uv1);
    return geometry;
  }, [width, data.height]);
  useEffect(() => () => canvasGeometry.dispose(), [canvasGeometry]);

  const frameSize: [number, number, number] = [
    width + FRAME_BORDER * 2,
    data.height + FRAME_BORDER * 2,
    FRAME_DEPTH,
  ];

  return (
    <group position={data.position} rotation={[0, data.rotationY, 0]}>
      {/* Frame — skipped when the artist marked their uploaded image as already framed (see artworks.ts's `frame` doc comment). "modernBlack" is the default for unframed backend artworks, all styles now render as real photo-scanned material. */}
      {data.frame ? <FrameMesh style={data.frame} size={frameSize} /> : null}

      {/* Canvas */}
      <mesh position={[0, 0, 0.004]} geometry={canvasGeometry}>
        <meshStandardMaterial
          map={texture}
          roughness={CANVAS_ROUGHNESS}
          metalness={0}
          normalMap={getCanvasWeaveNormalMap()}
          normalScale={CANVAS_NORMAL_SCALE}
        />
      </mesh>

      {/* Wall label */}
      <group position={[0, -data.height / 2 - FRAME_BORDER - 0.16, 0.01]}>
        <mesh>
          <planeGeometry args={[0.62, 0.18]} />
          <meshStandardMaterial color="#f7f6f2" roughness={0.9} />
        </mesh>
        <Text
          position={[0, 0.035, 0.001]}
          fontSize={0.036}
          color="#1a1a1a"
          anchorX="center"
          anchorY="middle"
          maxWidth={0.56}
        >
          {data.title}
        </Text>
        <Text
          position={[0, -0.035, 0.001]}
          fontSize={0.028}
          color="#5a5a5a"
          anchorX="center"
          anchorY="middle"
          maxWidth={0.56}
        >
          {`${data.artist}, ${data.year}`}
        </Text>
      </group>
    </group>
  );
}

/** Real photo-scanned material on the frame box (gold/walnut scans, or the same gold scan re-tinted for "modernBlack" — see frameTextures.ts), tiled to the frame's own size (see textureUv.ts). */
function FrameMesh({ style, size }: { style: FrameStyle; size: [number, number, number] }) {
  const frameStyle = FRAME_TEXTURES[style];
  const urls = frameStyle.metalnessMap
    ? [frameStyle.map, frameStyle.roughnessMap, frameStyle.metalnessMap]
    : [frameStyle.map, frameStyle.roughnessMap];
  const [map, roughnessMap, metalnessMap] = useTexture(urls) as [
    THREE.Texture,
    THREE.Texture,
    THREE.Texture | undefined,
  ];

  useEffect(() => {
    map.colorSpace = THREE.SRGBColorSpace;
    for (const t of [map, roughnessMap, metalnessMap]) {
      if (!t) continue;
      t.wrapS = THREE.RepeatWrapping;
      t.wrapT = THREE.RepeatWrapping;
      t.needsUpdate = true;
    }
  }, [map, roughnessMap, metalnessMap]);

  const material = useMemo(() => {
    const cached = frameMaterialCache.get(style);
    if (cached) return cached;
    const created = new THREE.MeshStandardMaterial({
      map,
      roughnessMap,
      metalnessMap,
      metalness: frameStyle.metalness,
      roughness: frameStyle.roughness,
      color: frameStyle.color ?? "#ffffff",
    });
    frameMaterialCache.set(style, created);
    return created;
  }, [style, map, roughnessMap, metalnessMap, frameStyle.metalness, frameStyle.roughness, frameStyle.color]);

  const geometry = useMemo(
    () => buildTexturedBoxGeometry(size, frameStyle.tileSize),
    [size, frameStyle.tileSize]
  );
  useEffect(() => () => geometry.dispose(), [geometry]);

  return <mesh position={[0, 0, -FRAME_DEPTH / 2]} geometry={geometry} material={material} />;
}
