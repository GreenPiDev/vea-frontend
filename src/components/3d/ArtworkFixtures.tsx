import { Fragment, useMemo } from "react";
import * as THREE from "three";
import { Instance, Instances } from "@react-three/drei";
import type { Artwork as ArtworkData } from "./artworks";
import { useExhibition } from "./ExhibitionContext";
import { CANONICAL_ARM_RADIUS, FIXTURE_BASE_LENGTH, computeFixtureTransform } from "./fixtureGeometry";

// The picture-light fixture's metal parts (base/arms/bar) use the same fixed color+roughness+metalness on
// every single painting in every exhibition — only their position/rotation differs. Previously each
// Artwork/ArtworkLight instance declared its own ~5 meshes for this (base, 2 arms, bar, LED strip), so a
// 40-painting room silently allocated ~200 GPU draw calls for visually identical geometry. Rendered once
// here as four shared InstancedMesh pools (one per part) instead — same visual result, a handful of draw
// calls instead of hundreds.
const FIXTURE_BASE_MATERIAL = new THREE.MeshStandardMaterial({ color: "#1a1a1a", roughness: 0.4, metalness: 0.6 });
const FIXTURE_ARM_MATERIAL = new THREE.MeshStandardMaterial({ color: "#1a1a1a", roughness: 0.35, metalness: 0.6 });
const FIXTURE_BAR_MATERIAL = new THREE.MeshStandardMaterial({ color: "#1c1c1c", roughness: 0.3, metalness: 0.6 });

/** Every painting's swing-arm picture-light fixture (wall base + 2 curved arms + light bar + LED strip), batched into shared InstancedMesh pools instead of one set of meshes per painting. The actual spotLights are a separate, fixed-size pool (see ArtworkLightPool.tsx) reassigned to the nearest paintings each frame — lights can't be instanced, only the cosmetic geometry around them can. */
export default function ArtworkFixtures({ artworks }: { artworks: ArtworkData[] }) {
  const { exhibition, layout } = useExhibition();

  const transforms = useMemo(
    () => artworks.map((data) => computeFixtureTransform(data, layout.wallHeight)),
    [artworks, layout.wallHeight]
  );

  const ledMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#0a0a0a",
        emissive: exhibition.theme.spotColor,
        // This strip is always lit regardless of the real spotLight's distance-based fade/pool assignment
        // (ArtworkLightPool.tsx) — it's the only "is this lamp on" cue once a painting's own light has
        // faded out or isn't currently in the pool. Bumped from 1.4: at typical gallery viewing distance the strip only covers a
        // few screen pixels, and Bloom's mip-based downsampling loses weak sub-pixel bright spots, so a
        // modest intensity read as "off" from across a room even though the material itself never changes.
        // Free to raise — emissive intensity is a per-fragment material constant on an already-drawn,
        // already-instanced mesh, it doesn't add draw calls or touch the scene's real light count.
        emissiveIntensity: 3.5,
        roughness: 0.5,
      }),
    [exhibition.theme.spotColor]
  );

  if (transforms.length === 0) return null;

  return (
    <>
      {/* Wall-mounted bases — radialSegments dropped from 20 to 10, same reasoning as the rest of this
          fixture: at this radius and normal viewing distance the facets aren't distinguishable. */}
      <Instances limit={transforms.length} material={FIXTURE_BASE_MATERIAL}>
        <cylinderGeometry args={[0.055, 0.055, FIXTURE_BASE_LENGTH, 10]} />
        {transforms.map((t, i) => (
          <Instance key={i} position={t.basePosition} quaternion={t.baseQuaternion} />
        ))}
      </Instances>

      {/* Two curved support arms per painting — the torus geometry is built at the canonical (overwhelmingly
          common) ring radius; the rare painting whose lamp gets clamped against a low ceiling gets a uniform
          scale correction instead of its own geometry (see fixtureGeometry.ts's CANONICAL_ARM_RADIUS doc). */}
      <Instances limit={transforms.length * 2} material={FIXTURE_ARM_MATERIAL}>
        <torusGeometry args={[CANONICAL_ARM_RADIUS, 0.016, 6, 14, Math.PI]} />
        {transforms.map((t, i) => {
          const scale = t.armRadius / CANONICAL_ARM_RADIUS;
          return (
            <Fragment key={i}>
              <Instance position={t.armCenters[0]} quaternion={t.armQuaternion} scale={scale} />
              <Instance position={t.armCenters[1]} quaternion={t.armQuaternion} scale={scale} />
            </Fragment>
          );
        })}
      </Instances>

      {/* Light bars — unit-length shared geometry, stretched to each painting's actual bar length via a
          per-instance non-uniform Y scale (the cylinder's radius, unaffected by a Y-only scale, stays correct). */}
      <Instances limit={transforms.length} material={FIXTURE_BAR_MATERIAL}>
        <cylinderGeometry args={[0.032, 0.032, 1, 10]} />
        {transforms.map((t, i) => (
          <Instance key={i} position={t.barPosition} quaternion={t.barQuaternion} scale={[1, t.barLength, 1]} />
        ))}
      </Instances>

      {/* Glowing LED strip along each bar's underside — same unit-geometry + non-uniform-scale trick, along X. */}
      <Instances limit={transforms.length} material={ledMaterial}>
        <boxGeometry args={[1, 0.014, 0.02]} />
        {transforms.map((t, i) => (
          <Instance key={i} position={t.stripPosition} quaternion={t.stripQuaternion} scale={[t.stripLength, 1, 1]} />
        ))}
      </Instances>
    </>
  );
}
