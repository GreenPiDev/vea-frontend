import { useEffect, useMemo } from "react";
import * as THREE from "three";
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

  const material = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        map,
        roughnessMap,
        metalnessMap,
        metalness: frameStyle.metalness,
        roughness: frameStyle.roughness,
        color: frameStyle.color ?? "#ffffff",
      }),
    [map, roughnessMap, metalnessMap, frameStyle.metalness, frameStyle.roughness, frameStyle.color]
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
  // Lamp height follows each painting's own top edge (not a fixed rail shared by the whole wall) — a tall-ceiling
  // room would otherwise leave the fixed rail too far above a normally-hung painting for the beam to land on it.
  // placeArtworksAlongWall() guarantees CEILING_HEADROOM (0.73m) of clearance above every painting's top edge, so
  // LAMP_RISE sits comfortably under that; the wallHeight clamp is just a safety net for hand-authored static
  // artworks.ts entries that don't go through that placement math.
  const LAMP_RISE = 0.45;
  const CEILING_CLEARANCE = 0.15;
  const topEdge = data.position[1] + data.height / 2;
  const lightY = Math.min(topEdge + LAMP_RISE, layout.wallHeight - CEILING_CLEARANCE);
  // The actual (invisible) light-emitting point sits farther out from the wall than the visible fixture. With
  // the emitter close to the wall, its beam axis would be nearly parallel to the wall surface, so the cone's
  // outer rays would graze the wall and land near the fixture regardless of the target's height, instead of
  // converging where aimed. Pulling the real emission point out gives the beam a steep enough angle to land
  // squarely on each painting at its own height — the fixture mesh below is purely cosmetic.
  const beamStandoff = 1.6;
  const normal = useMemo(
    () => new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), data.rotationY),
    [data.rotationY]
  );
  // Horizontal direction along the wall (perpendicular to the normal) — the picture-light bar and its mounting
  // arms run along this axis, parallel to the painting's own top edge.
  const tangent = useMemo(() => new THREE.Vector3(normal.z, 0, -normal.x), [normal]);
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

  // Visible fixture: a classic swing-arm picture light — a small wall-mounted base, two curved arms, and a
  // long horizontal bar sitting in front of (and lighting) the painting's upper edge.
  const width = data.height * data.aspect;
  const barLength = THREE.MathUtils.clamp(width * 0.55, 0.45, 1.3);
  const baseStandoff = 0.1;
  const barStandoff = 0.24;
  // The base mounts above the bar (not below it) — real picture lights hang the lit bar down from a higher wall
  // anchor via the arms, so light sheds downward onto the painting below; `lightY` is the bar's own height
  // (already clamped to clear the ceiling for the painting's own top edge), so the base is pushed up from there
  // and separately clamped so it doesn't poke through the ceiling in a low-headroom room.
  const barY = lightY;
  const baseY = Math.min(lightY + 0.26, layout.wallHeight - 0.05);
  const barRadius = 0.032;
  // Both arms attach close together, inboard enough to sit inside the base's own footprint below — otherwise
  // the arms visually disconnect from the base (the original bug: they landed ~0.2m past the base's edge).
  const armTangentOffset = 0.09;
  const baseLength = armTangentOffset * 2 + 0.12;

  const barPosition = useMemo<[number, number, number]>(
    () => [data.position[0] + normal.x * barStandoff, barY, data.position[2] + normal.z * barStandoff],
    [data.position, normal, barY]
  );
  const basePosition = useMemo<[number, number, number]>(
    () => [data.position[0] + normal.x * baseStandoff, baseY, data.position[2] + normal.z * baseStandoff],
    [data.position, normal, baseY]
  );
  const stripPosition = useMemo<[number, number, number]>(
    () => [barPosition[0], barY - barRadius - 0.006, barPosition[2]],
    [barPosition, barY]
  );
  const barQuaternion = useMemo(
    () => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), tangent),
    [tangent]
  );
  // The base is a short bar parallel to the main light bar (axis along tangent, like the bar) rather than
  // sticking straight out of the wall — so its ends sit directly under where the two arms attach.
  const baseQuaternion = useMemo(
    () => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), tangent),
    [tangent]
  );
  // The emissive strip's box needs its width (local X) along the bar, not its height (local Y, that's the
  // cylinder's convention) — a separate basis mapping local X/Y/Z to tangent/up/normal.
  const stripQuaternion = useMemo(() => {
    const m = new THREE.Matrix4().makeBasis(tangent, new THREE.Vector3(0, 1, 0), normal);
    return new THREE.Quaternion().setFromRotationMatrix(m);
  }, [tangent, normal]);

  // Two symmetric curved arms connecting the wall base to the bar, each a half-torus whose two ends land
  // exactly on the base/bar attach points by construction (radius = half their distance apart, rolled so the
  // 0/arc angles point at them) — see Artwork.tsx history for the derivation if this needs adjusting.
  const armGeometry = useMemo(() => {
    const aDiff = barStandoff - baseStandoff;
    const bDiff = barY - baseY;
    const radius = Math.hypot(aDiff, bDiff) / 2;
    // Two diametrically-opposite points on a circle admit two semicircle paths between them — this sign picks
    // the one that bulges away from the wall (into the room), not the one looping back toward/behind it.
    const angle0 = Math.atan2(bDiff, aDiff);
    // The basis's Z column only needs to make this a *proper* (right-handed, determinant +1) rotation matrix —
    // Quaternion.setFromRotationMatrix silently produces a garbage/flipped orientation for a left-handed one.
    // `tangent` itself is left-handed against (normal, up) here, so a dedicated normal×up is used instead; it
    // has zero effect on where the ring's points land since the ring itself lies entirely in the local XY
    // (normal/up) plane (z=0), only the X/Y columns (normal, up) actually matter for that.
    const properZ = new THREE.Vector3().crossVectors(normal, new THREE.Vector3(0, 1, 0));
    const basis = new THREE.Matrix4().makeBasis(normal, new THREE.Vector3(0, 1, 0), properZ);
    const quaternion = new THREE.Quaternion()
      .setFromRotationMatrix(basis)
      .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), angle0));
    return { radius, quaternion };
  }, [normal, barY, baseY]);
  const armCenters = useMemo<[number, number, number][]>(
    () =>
      [-1, 1].map((s) => {
        const t = s * armTangentOffset;
        const midStandoff = (baseStandoff + barStandoff) / 2;
        return [
          data.position[0] + normal.x * midStandoff + tangent.x * t,
          (baseY + barY) / 2,
          data.position[2] + normal.z * midStandoff + tangent.z * t,
        ];
      }),
    [data.position, normal, tangent, armTangentOffset, baseY, barY]
  );

  return (
    <>
      <primitive object={target} />
      <spotLight
        position={lightPosition}
        target={target}
        angle={0.42}
        penumbra={0.9}
        intensity={exhibition.theme.spotIntensity * SPOT_INTENSITY_SCALE}
        distance={7}
        decay={2}
        color={exhibition.theme.spotColor}
      />

      {/* Wall-mounted base — spans both arms' attach points so they read as one fixture, not two floating hooks */}
      <mesh position={basePosition} quaternion={baseQuaternion}>
        <cylinderGeometry args={[0.055, 0.055, baseLength, 20]} />
        <meshStandardMaterial color="#1a1a1a" roughness={0.4} metalness={0.6} />
      </mesh>

      {/* Two curved support arms */}
      {armCenters.map((center, i) => (
        <mesh key={i} position={center} quaternion={armGeometry.quaternion}>
          <torusGeometry args={[armGeometry.radius, 0.016, 8, 24, Math.PI]} />
          <meshStandardMaterial color="#1a1a1a" roughness={0.35} metalness={0.6} />
        </mesh>
      ))}

      {/* Light bar */}
      <mesh position={barPosition} quaternion={barQuaternion} castShadow>
        <cylinderGeometry args={[barRadius, barRadius, barLength, 20]} />
        <meshStandardMaterial color="#1c1c1c" roughness={0.3} metalness={0.6} />
      </mesh>
      {/* Glowing LED strip along the bar's underside */}
      <mesh position={stripPosition} quaternion={stripQuaternion}>
        <boxGeometry args={[barLength * 0.88, 0.014, 0.02]} />
        <meshStandardMaterial
          color="#0a0a0a"
          emissive={exhibition.theme.spotColor}
          emissiveIntensity={1.4}
          roughness={0.5}
        />
      </mesh>
    </>
  );
}
