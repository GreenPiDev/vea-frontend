import { useEffect, useMemo } from "react";
import * as THREE from "three";
import StaticInstances from "./StaticInstances";
import type { StaticInstance } from "./instanceMatrices";
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

// Shared by every room (never disposed). Wall bases and bars: radialSegments 10 (was 20) — at this radius
// and normal viewing distance the facets aren't distinguishable.
const BASE_GEOMETRY = new THREE.CylinderGeometry(0.055, 0.055, FIXTURE_BASE_LENGTH, 10);
const ARM_GEOMETRY = new THREE.TorusGeometry(CANONICAL_ARM_RADIUS, 0.016, 6, 14, Math.PI);
const BAR_GEOMETRY = new THREE.CylinderGeometry(0.032, 0.032, 1, 10);
const STRIP_GEOMETRY = new THREE.BoxGeometry(1, 0.014, 0.02);

/** Every painting's swing-arm picture-light fixture (wall base + 2 curved arms + light bar + LED strip), batched into shared InstancedMesh pools instead of one set of meshes per painting. The light itself isn't a three.js light: it's baked on the walls (pictureLightBake.ts) and evaluated on each painting/label (pictureLightMaterial.ts), always on. */
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
        // The visible "lamp is on" cue (the picture light itself is always on too, see pictureLight.ts). Bumped from 1.4: at typical gallery viewing distance the strip only covers a
        // few screen pixels, and Bloom's mip-based downsampling loses weak sub-pixel bright spots, so a
        // modest intensity read as "off" from across a room even though the material itself never changes.
        // Free to raise — emissive intensity is a per-fragment material constant on an already-drawn,
        // already-instanced mesh, it doesn't add draw calls or touch the scene's real light count.
        emissiveIntensity: 3.5,
        roughness: 0.5,
      }),
    [exhibition.theme.spotColor]
  );
  useEffect(() => () => ledMaterial.dispose(), [ledMaterial]);

  // Static instance lists (instanceMatrices.ts) — rebuilt only when the paintings or the wall height change.
  const instances = useMemo(
    () => ({
      bases: transforms.map((t): StaticInstance => ({ position: t.basePosition, quaternion: t.baseQuaternion })),
      // Two curved support arms per painting — the torus geometry is built at the canonical (overwhelmingly
      // common) ring radius; the rare painting whose lamp gets clamped against a low ceiling gets a uniform
      // scale correction instead of its own geometry (see fixtureGeometry.ts's CANONICAL_ARM_RADIUS doc).
      arms: transforms.flatMap((t): StaticInstance[] => {
        const scale = t.armRadius / CANONICAL_ARM_RADIUS;
        return t.armCenters.map((position) => ({ position, quaternion: t.armQuaternion, scale }));
      }),
      // Light bars — unit-length shared geometry, stretched to each painting's actual bar length via a
      // per-instance non-uniform Y scale (the cylinder's radius, unaffected by a Y-only scale, stays correct).
      bars: transforms.map((t): StaticInstance => ({ position: t.barPosition, quaternion: t.barQuaternion, scale: [1, t.barLength, 1] })),
      // Glowing LED strip along each bar's underside — same unit-geometry + non-uniform-scale trick, along X.
      strips: transforms.map((t): StaticInstance => ({ position: t.stripPosition, quaternion: t.stripQuaternion, scale: [t.stripLength, 1, 1] })),
    }),
    [transforms]
  );

  if (transforms.length === 0) return null;

  return (
    <>
      <StaticInstances geometry={BASE_GEOMETRY} material={FIXTURE_BASE_MATERIAL} instances={instances.bases} />
      <StaticInstances geometry={ARM_GEOMETRY} material={FIXTURE_ARM_MATERIAL} instances={instances.arms} />
      <StaticInstances geometry={BAR_GEOMETRY} material={FIXTURE_BAR_MATERIAL} instances={instances.bars} />
      <StaticInstances geometry={STRIP_GEOMETRY} material={ledMaterial} instances={instances.strips} />
    </>
  );
}
