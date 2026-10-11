// Pure math extracted from Artwork.tsx's ArtworkLight — originally every
// painting computed this inline (with its own useMemos) to build its own
// picture-light fixture meshes. Pulled out here so ArtworkFixtures.tsx can
// batch every painting's fixture transform into a handful of shared
// InstancedMesh pools instead of each painting mounting ~5 meshes of its
// own (a 40-painting room was allocating ~200 fixture meshes for visually
// identical geometry).
import * as THREE from "three";
import type { Artwork as ArtworkData } from "./artworks";

const LAMP_RISE = 0.45;
const CEILING_CLEARANCE = 0.15;
const BASE_STANDOFF = 0.1;
const BAR_STANDOFF = 0.24;
const ARM_TANGENT_OFFSET = 0.09;

/** Base cylinder length never varies per painting — same shared geometry for every instance, no per-instance scale needed. */
export const FIXTURE_BASE_LENGTH = ARM_TANGENT_OFFSET * 2 + 0.12;

/**
 * The arm torus's ring radius is `hypot(barStandoff-baseStandoff, barY-baseY)/2`.
 * `barY-baseY` is a constant -0.26 unless the painting's lamp is clamped
 * against a low ceiling (see baseY's `Math.min` below) — this canonical
 * value is the shared torus geometry's radius; the rare clamped case is
 * handled with a per-instance uniform scale correction instead of its own
 * geometry.
 */
export const CANONICAL_ARM_RADIUS = Math.hypot(BAR_STANDOFF - BASE_STANDOFF, 0.26) / 2;

export interface FixtureTransform {
  basePosition: [number, number, number];
  baseQuaternion: THREE.Quaternion;
  barPosition: [number, number, number];
  barQuaternion: THREE.Quaternion;
  barLength: number;
  armCenters: [[number, number, number], [number, number, number]];
  armQuaternion: THREE.Quaternion;
  /** Actual ring radius for this instance — equals CANONICAL_ARM_RADIUS unless the ceiling clamp kicked in. */
  armRadius: number;
  stripPosition: [number, number, number];
  stripQuaternion: THREE.Quaternion;
  stripLength: number;
}

/** Computes one painting's picture-light fixture transform (base/arms/bar/LED strip) — same geometry ArtworkLight used to build inline, now a pure function so it can be called for every painting up front and batched into instanced pools. */
export function computeFixtureTransform(data: ArtworkData, wallHeight: number): FixtureTransform {
  const topEdge = data.position[1] + data.height / 2;
  const lightY = Math.min(topEdge + LAMP_RISE, wallHeight - CEILING_CLEARANCE);

  const normal = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), data.rotationY);
  const tangent = new THREE.Vector3(normal.z, 0, -normal.x);

  const barY = lightY;
  const baseY = Math.min(lightY + 0.26, wallHeight - 0.05);

  const width = data.height * data.aspect;
  const barLength = THREE.MathUtils.clamp(width * 0.55, 0.45, 1.3);

  const barPosition: [number, number, number] = [
    data.position[0] + normal.x * BAR_STANDOFF,
    barY,
    data.position[2] + normal.z * BAR_STANDOFF,
  ];
  const basePosition: [number, number, number] = [
    data.position[0] + normal.x * BASE_STANDOFF,
    baseY,
    data.position[2] + normal.z * BASE_STANDOFF,
  ];
  const stripPosition: [number, number, number] = [barPosition[0], barY - 0.032 - 0.006, barPosition[2]];

  const barQuaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), tangent);
  const baseQuaternion = barQuaternion.clone();

  const stripBasis = new THREE.Matrix4().makeBasis(tangent, new THREE.Vector3(0, 1, 0), normal);
  const stripQuaternion = new THREE.Quaternion().setFromRotationMatrix(stripBasis);

  const aDiff = BAR_STANDOFF - BASE_STANDOFF;
  const bDiff = barY - baseY;
  const armRadius = Math.hypot(aDiff, bDiff) / 2;
  const angle0 = Math.atan2(bDiff, aDiff);
  const properZ = new THREE.Vector3().crossVectors(normal, new THREE.Vector3(0, 1, 0));
  const armBasis = new THREE.Matrix4().makeBasis(normal, new THREE.Vector3(0, 1, 0), properZ);
  const armQuaternion = new THREE.Quaternion()
    .setFromRotationMatrix(armBasis)
    .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), angle0));

  const midStandoff = (BASE_STANDOFF + BAR_STANDOFF) / 2;
  const armCenters = ([-1, 1] as const).map((s) => {
    const t = s * ARM_TANGENT_OFFSET;
    return [
      data.position[0] + normal.x * midStandoff + tangent.x * t,
      (baseY + barY) / 2,
      data.position[2] + normal.z * midStandoff + tangent.z * t,
    ] as [number, number, number];
  }) as [[number, number, number], [number, number, number]];

  return {
    basePosition,
    baseQuaternion,
    barPosition,
    barQuaternion,
    barLength,
    armCenters,
    armQuaternion,
    armRadius,
    stripPosition,
    stripQuaternion,
    stripLength: barLength * 0.88,
  };
}
