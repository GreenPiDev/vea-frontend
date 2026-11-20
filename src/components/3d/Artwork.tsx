import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { useTexture } from "@react-three/drei";
import type { Artwork as ArtworkData, FrameStyle } from "./artworks";
import { FRAME_TEXTURES } from "./frameTextures";
import { canvasZ, getFrameGeometry } from "./frameProfile";
import { WEAVE_TILE_METERS, getCanvasWeaveNormalMap } from "./canvasWeave";
import { cropToUvTransform, measureImageCrop } from "./artworkImageCrop";
import WallLabel from "./WallLabel";
import { LABEL_WALL_Z, type LabelLayout, type LabelPlacement } from "./wallLabelLayout";
import { applyDaylight } from "./ceilingLight";

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
export default function Artwork({
  data,
  label,
}: {
  data: ArtworkData;
  /** Museum wall label, typeset and placed by GalleryArtworks (wallLabel.ts) — it needs the whole wall's layout. */
  label?: { layout: LabelLayout; placement: LabelPlacement };
}) {
  const texture = useTexture(data.image);

  useMemo(() => {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
    // Skip flat scan margins (white mount board / scanner bed) baked into the photo — artworkImageCrop.ts.
    // The texture is cached per URL, so every copy of this image shares the same crop.
    const image = texture.image as (CanvasImageSource & { width: number; height: number }) | undefined;
    if (image?.width) {
      const { offset, repeat } = cropToUvTransform(measureImageCrop(data.image, image));
      texture.offset.set(...offset);
      texture.repeat.set(...repeat);
    }
  }, [texture, data.image]);

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

  // Receives window daylight and sun patches, not the ceiling fixtures (applyDaylight, ceilingLight.ts).
  const canvasMaterial = useMemo(() => {
    const material = new THREE.MeshStandardMaterial({
      map: texture,
      roughness: CANVAS_ROUGHNESS,
      metalness: 0,
      normalMap: getCanvasWeaveNormalMap(),
      normalScale: CANVAS_NORMAL_SCALE,
    });
    applyDaylight(material);
    return material;
  }, [texture]);
  useEffect(() => () => canvasMaterial.dispose(), [canvasMaterial]);

  return (
    <group position={data.position} rotation={[0, data.rotationY, 0]}>
      {/* Frame — skipped when the artist marked their uploaded image as already framed (see artworks.ts's `frame` doc comment). "modernBlack" is the default for unframed backend artworks, all styles now render as real photo-scanned material. */}
      {data.frame ? <FrameMesh style={data.frame} canvasWidth={width} canvasHeight={data.height} /> : null}

      {/* Canvas — in the frame's rebate, 1.4 cm behind its face (frameProfile.ts) */}
      <mesh position={[0, 0, canvasZ(data.frame)]} geometry={canvasGeometry} material={canvasMaterial} />

      {/* Wall label — its back flat on the wall face. */}
      {label ? (
        <WallLabel
          layout={label.layout}
          position={[label.placement.x, label.placement.y, LABEL_WALL_Z]}
        />
      ) : null}
    </group>
  );
}

/** Moulded frame swept from its style's profile (frameProfile.ts), with the real photo-scanned material (gold/walnut scans, or the same gold scan re-tinted for "modernBlack" — see frameTextures.ts) following the moulding at real-world scale. */
function FrameMesh({ style, canvasWidth, canvasHeight }: { style: FrameStyle; canvasWidth: number; canvasHeight: number }) {
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
    applyDaylight(created);
    frameMaterialCache.set(style, created);
    return created;
  }, [style, map, roughnessMap, metalnessMap, frameStyle.metalness, frameStyle.roughness, frameStyle.color]);

  // Shared per style + size (cached in frameProfile.ts, not disposed per mesh). Front face at z = 0, back at
  // −FRAME_DEPTH — the same volume the old box filled, so the wall shadow and picking still match.
  const geometry = getFrameGeometry(style, canvasWidth, canvasHeight, frameStyle.tileSize);

  return <mesh geometry={geometry} material={material} />;
}
