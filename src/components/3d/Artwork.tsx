import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { useTexture, Text } from "@react-three/drei";
import type { Artwork as ArtworkData, FrameStyle } from "./artworks";
import { useExhibition } from "./ExhibitionContext";
import { FRAME_TEXTURES } from "./frameTextures";
import { buildTexturedBoxGeometry } from "./textureUv";

const FRAME_BORDER = 0.07;
const FRAME_DEPTH = 0.05;

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
      {/* Frame — skipped when the artist marked their uploaded image as already framed (see artworks.ts's `frame` doc comment). "modernBlack" is a flat solid-color default for unframed backend artworks, everything else is a real photo-scanned material. */}
      {data.frame === "modernBlack" ? (
        <SolidFrameMesh size={frameSize} />
      ) : data.frame ? (
        <FrameMesh style={data.frame} size={frameSize} />
      ) : null}


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

/** Flat matte-black box, no texture — the default frame given to a backend artwork whose artist marked their uploaded image as unframed. Deliberately simple/cheap (no useTexture load) since it's the common case for real user-uploaded content, unlike the two curated demo materials below. */
function SolidFrameMesh({ size }: { size: [number, number, number] }) {
  return (
    <mesh position={[0, 0, -FRAME_DEPTH / 2]} castShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial color="#111111" roughness={0.35} metalness={0.15} />
    </mesh>
  );
}

/** Real photo-scanned gold/walnut material on the frame box, tiled to the frame's own size (see textureUv.ts) so every painting shares just two textures total. */
function FrameMesh({
  style,
  size,
}: {
  style: Exclude<FrameStyle, "modernBlack">;
  size: [number, number, number];
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

  const material = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        map,
        roughnessMap,
        metalnessMap,
        metalness: frameStyle.metalness,
        roughness: frameStyle.roughness,
      }),
    [map, roughnessMap, metalnessMap, frameStyle.metalness, frameStyle.roughness]
  );

  const geometry = useMemo(
    () => buildTexturedBoxGeometry(size, frameStyle.tileSize),
    [size, frameStyle.tileSize]
  );
  useEffect(() => () => geometry.dispose(), [geometry]);

  return <mesh position={[0, 0, -FRAME_DEPTH / 2]} geometry={geometry} material={material} castShadow />;
}

export function ArtworkLight({ data }: { data: ArtworkData }) {
  const { exhibition, layout } = useExhibition();
  // Fixed rail height for every fixture on this wall (independent of the artwork's own hanging height) —
  // like a real museum track, only the aim angle changes per painting, not the lamp row's height.
  const lightY = layout.wallHeight - 0.4;
  const normal = useMemo(
    () => new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), data.rotationY),
    [data.rotationY]
  );
  const lightPosition = useMemo<[number, number, number]>(
    () => [data.position[0] + normal.x * 1.9, lightY, data.position[2] + normal.z * 1.9],
    [data.position, normal, lightY]
  );
  const target = useMemo(() => {
    const obj = new THREE.Object3D();
    obj.position.set(...data.position);
    return obj;
  }, [data.position]);

  // Orients the visible housing so its lens faces the painting, matching the spotLight's own aim.
  const fixtureQuaternion = useMemo(() => {
    const direction = new THREE.Vector3(...data.position).sub(new THREE.Vector3(...lightPosition)).normalize();
    return new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), direction);
  }, [lightPosition, data.position]);

  // Arm sticks straight out of the wall (horizontal, along the wall normal) from a bracket just above the
  // painting, rather than dropping from the ceiling — reads as a picture light mounted on the wall itself.
  const armQuaternion = useMemo(
    () => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal),
    [normal]
  );
  const wallOffset = 0.05;
  const armLength = 1.9 - wallOffset;
  const wallAnchor: [number, number, number] = [
    data.position[0] + normal.x * wallOffset,
    lightY,
    data.position[2] + normal.z * wallOffset,
  ];

  return (
    <>
      <primitive object={target} />
      <spotLight
        position={lightPosition}
        target={target}
        angle={0.32}
        penumbra={0.45}
        intensity={exhibition.theme.spotIntensity}
        distance={7}
        decay={2}
        color={exhibition.theme.spotColor}
      />

      {/* Visible wall-mounted picture light so the glow on the canvas reads as coming from a real lamp, not thin air */}
      <mesh position={wallAnchor}>
        <boxGeometry args={[0.12, 0.09, 0.06]} />
        <meshStandardMaterial color="#1a1a1a" roughness={0.4} metalness={0.6} />
      </mesh>
      <group position={[wallAnchor[0] + normal.x * (armLength / 2), lightY, wallAnchor[2] + normal.z * (armLength / 2)]} quaternion={armQuaternion}>
        <mesh>
          <cylinderGeometry args={[0.015, 0.015, armLength, 8]} />
          <meshStandardMaterial color="#1a1a1a" roughness={0.4} metalness={0.6} />
        </mesh>
      </group>
      <group position={lightPosition} quaternion={fixtureQuaternion}>
        <mesh castShadow>
          <cylinderGeometry args={[0.09, 0.11, 0.22, 16]} />
          <meshStandardMaterial color="#1c1c1c" roughness={0.35} metalness={0.5} />
        </mesh>
        <mesh position={[0, -0.12, 0]}>
          <circleGeometry args={[0.095, 16]} />
          <meshStandardMaterial
            color="#0a0a0a"
            emissive={exhibition.theme.spotColor}
            emissiveIntensity={1.4}
            roughness={0.5}
          />
        </mesh>
      </group>
    </>
  );
}
