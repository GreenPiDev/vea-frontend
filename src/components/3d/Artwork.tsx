import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { useTexture } from "@react-three/drei";
import type { Artwork as ArtworkData, FrameStyle } from "./artworks";
import { FRAME_TEXTURES } from "./frameTextures";
import { buildStretchedCanvasGeometry, canvasZ, getFrameGeometry } from "./frameProfile";
import { WEAVE_TILE_METERS, getCanvasWeaveNormalMap } from "./canvasWeave";
import { frameBorderFraction } from "./artworkDisplayScale";
import { cropToUvTransform, measureImageCrop } from "./artworkImageCrop";
import WallLabel from "./WallLabel";
import { LABEL_WALL_Z, LABEL_WIDTH, type LabelLayout, type LabelPlacement } from "./wallLabelLayout";
import { ARTWORK_WALL_GAP, FRAME_BORDER } from "./artworkShadow";
import { applyPictureLight } from "./pictureLightMaterial";
import { lampsReaching, localBoxToWorld } from "./pictureLightBake";
import { usePictureLights } from "./usePictureLights";
import type { PictureLightPlacement } from "./pictureLight";

// Paint surface: a painting isn't a matte print. A thin varnish layer gives it a soft sheen the picture
// light can catch (0.65 read like paper), and the shared linen weave normal map breaks that sheen up the
// way real canvas does when seen close. Kept modest on purpose — glare must never hide the artwork,
// and the picture light comes from steeply above, so its mirror highlight lands toward the floor, not
// the visitor's eye. (No per-material envMapIntensity: three overrides it with scene.environmentIntensity
// whenever the env map comes from scene.environment, as RoomEnvironment.tsx's does.)
const CANVAS_ROUGHNESS = 0.5;
const CANVAS_NORMAL_SCALE = new THREE.Vector2(0.35, 0.35);

// Sides of an unframed (stretched) canvas: bare primed linen, warm off-white, matte, with the weave a bit
// stronger than on the varnished face.
const CANVAS_SIDE_COLOR = "#ddd3bf";
const CANVAS_SIDE_NORMAL_SCALE = new THREE.Vector2(0.6, 0.6);

// The photographed frame around a `framed: true` work's image: same photo, no canvas weave (it would show as
// linen on the moulding). A touch glossier than the canvas — most frames are lacquered/gilded.
const PHOTO_FRAME_ROUGHNESS = 0.4;

// Canvas, canvas sides, frame and label each own their material (sharing textures and the compiled
// program): it carries the lamps that light that one painting as uniforms (pictureLightMaterial.ts).

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

  // The lamps reaching this painting / its label (own first; a neighbour only if its wash spills over).
  const { lights, index } = usePictureLights();
  const own = index.get(data.id) ?? -1;
  const paintingLights = useMemo(() => {
    const halfW = (data.height * data.aspect) / 2 + FRAME_BORDER;
    const halfH = data.height / 2 + FRAME_BORDER;
    const box = localBoxToWorld(data.position, data.rotationY, [-halfW, -halfH, -ARTWORK_WALL_GAP], [halfW, halfH, 0.01]);
    return lampsReaching(box, lights, own).map((i) => lights[i]);
  }, [lights, own, data.position, data.rotationY, data.height, data.aspect]);
  const labelLights = useMemo(() => {
    if (!label) return [];
    const { x, y } = label.placement;
    const halfH = label.layout.height / 2;
    const box = localBoxToWorld(
      data.position,
      data.rotationY,
      [x - LABEL_WIDTH / 2, y - halfH, LABEL_WALL_Z],
      [x + LABEL_WIDTH / 2, y + halfH, LABEL_WALL_Z + 0.01]
    );
    return lampsReaching(box, lights, own).map((i) => lights[i]);
  }, [label, lights, own, data.position, data.rotationY]);

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
  // An unframed work is a stretched canvas with depth (frameProfile.ts), a framed one a plane in the rebate.
  const framed = Boolean(data.frame);
  // A backend `framed: true` work: the outer strip of its photo is the frame (same estimate that enlarged it).
  const border = useMemo(
    () => (data.heightCm && data.widthCm ? frameBorderFraction({ heightCm: data.heightCm, widthCm: data.widthCm, framed: data.framed }) : { x: 0, y: 0 }),
    [data.heightCm, data.widthCm, data.framed]
  );
  const hasPhotoFrame = !framed && (border.x > 0 || border.y > 0);
  const canvasGeometry = useMemo(() => {
    if (!framed)
      return buildStretchedCanvasGeometry(width, data.height, WEAVE_TILE_METERS, undefined, {
        x: border.x * width,
        y: border.y * data.height,
      });
    const geometry = new THREE.PlaneGeometry(width, data.height);
    const uv1 = geometry.attributes.uv.clone();
    for (let i = 0; i < uv1.count; i++) {
      uv1.setXY(i, (uv1.getX(i) * width) / WEAVE_TILE_METERS, (uv1.getY(i) * data.height) / WEAVE_TILE_METERS);
    }
    geometry.setAttribute("uv1", uv1);
    return geometry;
  }, [width, data.height, framed, border]);
  useEffect(() => () => canvasGeometry.dispose(), [canvasGeometry]);

  // Receives its picture lamp(s), window daylight and sun patches, not the ceiling fixtures (pictureLightMaterial.ts).
  const canvasMaterial = useMemo(() => {
    const material = new THREE.MeshStandardMaterial({
      map: texture,
      roughness: CANVAS_ROUGHNESS,
      metalness: 0,
      normalMap: getCanvasWeaveNormalMap(),
      normalScale: CANVAS_NORMAL_SCALE,
    });
    applyPictureLight(material, paintingLights, { ceiling: false });
    return material;
  }, [texture, paintingLights]);
  useEffect(() => () => canvasMaterial.dispose(), [canvasMaterial]);
  const sideMaterial = useMemo(() => {
    if (framed) return null;
    const material = new THREE.MeshStandardMaterial({
      color: CANVAS_SIDE_COLOR,
      roughness: 0.85,
      metalness: 0,
      normalMap: getCanvasWeaveNormalMap(),
      normalScale: CANVAS_SIDE_NORMAL_SCALE,
    });
    applyPictureLight(material, paintingLights, { ceiling: false });
    return material;
  }, [framed, paintingLights]);
  useEffect(() => () => sideMaterial?.dispose(), [sideMaterial]);
  const photoFrameMaterial = useMemo(() => {
    if (!hasPhotoFrame) return null;
    const material = new THREE.MeshStandardMaterial({ map: texture, roughness: PHOTO_FRAME_ROUGHNESS, metalness: 0 });
    applyPictureLight(material, paintingLights, { ceiling: false });
    return material;
  }, [hasPhotoFrame, texture, paintingLights]);
  useEffect(() => () => photoFrameMaterial?.dispose(), [photoFrameMaterial]);
  const canvasMaterials = useMemo(() => {
    if (!sideMaterial) return canvasMaterial;
    return photoFrameMaterial ? [canvasMaterial, sideMaterial, photoFrameMaterial] : [canvasMaterial, sideMaterial];
  }, [canvasMaterial, sideMaterial, photoFrameMaterial]);

  return (
    <group position={data.position} rotation={[0, data.rotationY, 0]}>
      {/* Frame — only works that have one (static demo rooms); backend works hang without (artworks.ts's `frame` doc comment). */}
      {data.frame ? <FrameMesh style={data.frame} canvasWidth={width} canvasHeight={data.height} lights={paintingLights} /> : null}

      {/* Canvas — in the frame's rebate, 1.4 cm behind its face; unframed: a bare stretched canvas just off the wall (frameProfile.ts) */}
      <mesh
        position={[0, 0, canvasZ(data.frame)]}
        geometry={canvasGeometry}
        material={canvasMaterials}
      />

      {/* Wall label — its back flat on the wall face. */}
      {label ? (
        <WallLabel
          layout={label.layout}
          position={[label.placement.x, label.placement.y, LABEL_WALL_Z]}
          lights={labelLights}
        />
      ) : null}
    </group>
  );
}

/** Moulded frame swept from its style's profile (frameProfile.ts), with the real photo-scanned material (gold/walnut scans, or the same gold scan re-tinted for "modernBlack" — see frameTextures.ts) following the moulding at real-world scale. */
function FrameMesh({
  style,
  canvasWidth,
  canvasHeight,
  lights,
}: {
  style: FrameStyle;
  canvasWidth: number;
  canvasHeight: number;
  lights: PictureLightPlacement[];
}) {
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

  // Its own material (the scans are shared through useTexture's cache): it carries this painting's lamps.
  const material = useMemo(() => {
    const created = new THREE.MeshStandardMaterial({
      map,
      roughnessMap,
      metalnessMap,
      metalness: frameStyle.metalness,
      roughness: frameStyle.roughness,
      color: frameStyle.color ?? "#ffffff",
    });
    applyPictureLight(created, lights, { ceiling: false });
    return created;
  }, [map, roughnessMap, metalnessMap, frameStyle.metalness, frameStyle.roughness, frameStyle.color, lights]);
  useEffect(() => () => material.dispose(), [material]);

  // Shared per style + size (cached in frameProfile.ts, not disposed per mesh). Front face at z = 0, back at
  // −FRAME_DEPTH — the same volume the old box filled, so the wall shadow and picking still match.
  const geometry = getFrameGeometry(style, canvasWidth, canvasHeight, frameStyle.tileSize);

  return <mesh geometry={geometry} material={material} />;
}
