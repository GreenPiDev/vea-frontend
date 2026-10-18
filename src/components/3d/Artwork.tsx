import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { useTexture, Text } from "@react-three/drei";
import type { Artwork as ArtworkData, FrameStyle } from "./artworks";
import { useExhibition } from "./ExhibitionContext";
import { FRAME_TEXTURES } from "./frameTextures";
import { buildTexturedBoxGeometry } from "./textureUv";

const FRAME_BORDER = 0.07;
const FRAME_DEPTH = 0.05;
// Applied on top of each theme's own spotIntensity (exhibitions.ts/backendAdapter.ts) — one shared dial instead of
// re-tuning every theme's value by hand.
const SPOT_INTENSITY_SCALE = 0.6;

// Every real spotLight in the scene is evaluated per-fragment by every shaded surface regardless of
// whether it's in range — a spotLight's own `distance` falloff makes it contribute zero past that
// range, but doesn't remove it from the shader's light loop, so a big exhibition (one spotLight per
// artwork) pays a per-fragment cost that scales with the *total* artwork count, not how many are
// actually nearby. These three distances turn that into a smooth fade-then-unmount: intensity ramps
// down to 0 between NEAR and FAR (so nothing visibly pops), and the light is only dropped from the
// scene graph entirely past UNMOUNT_DISTANCE — safely beyond where the fade already reached zero, so
// the unmount itself is never visible. A first attempt at this used a hard on/off distance threshold
// and was dropped — distant paintings read as dim, then visibly "switched on" as the player
// approached; the fade band here exists specifically to avoid that.
const SPOT_FADE_NEAR_DISTANCE = 9;
const SPOT_FADE_FAR_DISTANCE = 15;
const SPOT_UNMOUNT_DISTANCE = 17;

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
      <mesh position={[0, 0, 0.004]}>
        <planeGeometry args={[width, data.height]} />
        <meshStandardMaterial map={texture} roughness={0.65} metalness={0} />
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

export function ArtworkLight({ data }: { data: ArtworkData }) {
  const { exhibition, layout } = useExhibition();
  const { camera } = useThree();
  const spotLightRef = useRef<THREE.SpotLight>(null);
  const [mounted, setMounted] = useState(true);
  const baseIntensity = exhibition.theme.spotIntensity * SPOT_INTENSITY_SCALE;
  // Lamp height follows each painting's own top edge (not a fixed rail shared by the whole wall) — a tall-ceiling
  // room would otherwise leave the fixed rail too far above a normally-hung painting for the beam to land on it.
  // placeArtworksAlongWall() guarantees CEILING_HEADROOM (0.73m) of clearance above every painting's top edge, so
  // LAMP_RISE sits comfortably under that; the wallHeight clamp is just a safety net for hand-authored static
  // artworks.ts entries that don't go through that placement math.
  const LAMP_RISE = 0.45;
  const CEILING_CLEARANCE = 0.15;
  const topEdge = data.position[1] + data.height / 2;
  const lightY = Math.min(topEdge + LAMP_RISE, layout.wallHeight - CEILING_CLEARANCE);
  // The actual (invisible) light-emitting point sits farther out from the wall than the visible fixture (now
  // rendered separately, see ArtworkFixtures.tsx). With the emitter close to the wall, its beam axis would be
  // nearly parallel to the wall surface, so the cone's outer rays would graze the wall and land near the
  // fixture regardless of the target's height, instead of converging where aimed. Pulling the real emission
  // point out gives the beam a steep enough angle to land squarely on each painting at its own height.
  const beamStandoff = 1.6;
  const normal = useMemo(
    () => new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), data.rotationY),
    [data.rotationY]
  );
  const lightPosition = useMemo<[number, number, number]>(
    () => [
      data.position[0] + normal.x * beamStandoff,
      lightY,
      data.position[2] + normal.z * beamStandoff,
    ],
    [data.position, normal, lightY, beamStandoff]
  );
  // Aim at the upper third of the canvas (not its center) — a real picture light grazes down from just under the
  // frame top, it doesn't point square at the middle of the painting.
  const aimPoint = useMemo<[number, number, number]>(
    () => [data.position[0], topEdge - data.height * 0.15, data.position[2]],
    [data.position, topEdge, data.height]
  );
  const target = useMemo(() => {
    const obj = new THREE.Object3D();
    obj.position.set(...aimPoint);
    return obj;
  }, [aimPoint]);

  // Driven imperatively (not React state) so a swinging intensity value never triggers a re-render —
  // only crossing the mount/unmount boundary does. Distance is measured in the XZ plane against the
  // *painting's* position, not the light's standoff position — the player walks the floor, not the
  // light's offset point, so this is what actually tracks "how close is the viewer to this piece."
  useFrame(() => {
    const dx = camera.position.x - data.position[0];
    const dz = camera.position.z - data.position[2];
    const distance = Math.hypot(dx, dz);

    const shouldBeMounted = distance < SPOT_UNMOUNT_DISTANCE;
    if (shouldBeMounted !== mounted) setMounted(shouldBeMounted);

    if (spotLightRef.current) {
      const fade =
        1 -
        THREE.MathUtils.smoothstep(distance, SPOT_FADE_NEAR_DISTANCE, SPOT_FADE_FAR_DISTANCE);
      spotLightRef.current.intensity = baseIntensity * fade;
    }
  });

  return (
    <>
      <primitive object={target} />
      {mounted && (
        <spotLight
          ref={spotLightRef}
          position={lightPosition}
          target={target}
          angle={0.42}
          penumbra={0.9}
          intensity={baseIntensity}
          distance={7}
          decay={2}
          color={exhibition.theme.spotColor}
        />
      )}
    </>
  );
}
