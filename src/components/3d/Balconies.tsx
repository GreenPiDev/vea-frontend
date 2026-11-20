import { useEffect, useLayoutEffect, useMemo } from "react";
import * as THREE from "three";
import { useTexture } from "@react-three/drei";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { useExhibition } from "./ExhibitionContext";
import {
  BALCONY_SLAB,
  RAILING_HEIGHT,
  balconyFacades,
  balconyGeometries,
  facadePanels,
  type BalconyGeometry,
  type Facade,
} from "./balcony";
import { applyOutdoorLight, outdoorLightFor, setOutdoorLight, spillLightsFor } from "./outdoorLight";
import { findOutdoorPanorama } from "./outdoorPanoramas";
import { FLOOR_TEXTURES, WALL_TEXTURES, findTexture, type SurfaceTexture } from "./surfaceTextures";

// Outside finishes: stone paving on the platform, render (plaster tinted warm grey) on the facade, a powder-
// coated steel railing. Fixed, not themed: the room's colours are interior choices.
const PAVING = findTexture(FLOOR_TEXTURES, "PavingStones142")!;
const RENDER = findTexture(WALL_TEXTURES, "Plaster001")!;
const FACADE_COLOR = "#d8d1c4";
const RAILING = { color: "#2a2b2e", roughness: 0.45, metalness: 0.6 };

// Railing members (m): posts at the corners and every ≤ 1.5 m, a flat handrail, a bottom rail, square balusters.
const POST = 0.045;
const POST_SPACING = 1.5;
const HANDRAIL_W = 0.06;
const HANDRAIL_H = 0.04;
const BOTTOM_RAIL = 0.03;
const BOTTOM_RAIL_Y = 0.08;
const BALUSTER = 0.016;
const BALUSTER_SPACING = 0.12;

/** A box from two floor-plane points (a straight member), `w` thick across, spanning y0..y1. */
function member(from: [number, number], to: [number, number], w: number, y0: number, y1: number): THREE.BufferGeometry {
  const dx = to[0] - from[0];
  const dz = to[1] - from[1];
  const len = Math.hypot(dx, dz);
  const g = new THREE.BoxGeometry(len + w, y1 - y0, w);
  g.rotateY(-Math.atan2(dz, dx));
  g.translate((from[0] + to[0]) / 2, (y0 + y1) / 2, (from[1] + to[1]) / 2);
  return g;
}

function railingGeometry(balconies: BalconyGeometry[]): THREE.BufferGeometry | null {
  const parts: THREE.BufferGeometry[] = [];
  for (const b of balconies) {
    for (const { from, to } of b.railings) {
      const len = Math.hypot(to[0] - from[0], to[1] - from[1]);
      const at = (t: number): [number, number] => [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t];
      parts.push(member(from, to, HANDRAIL_W, RAILING_HEIGHT - HANDRAIL_H, RAILING_HEIGHT));
      parts.push(member(from, to, BOTTOM_RAIL, BOTTOM_RAIL_Y, BOTTOM_RAIL_Y + BOTTOM_RAIL));
      const posts = Math.max(1, Math.ceil(len / POST_SPACING));
      for (let i = 0; i <= posts; i++) {
        const p = at(i / posts);
        parts.push(member(p, p, POST, 0, RAILING_HEIGHT - HANDRAIL_H));
      }
      const n = Math.floor(len / BALUSTER_SPACING);
      for (let i = 1; i < n; i++) {
        const p = at(i / n);
        parts.push(member(p, p, BALUSTER, BOTTOM_RAIL_Y + BOTTOM_RAIL, RAILING_HEIGHT - HANDRAIL_H));
      }
    }
  }
  if (!parts.length) return null;
  const merged = mergeGeometries(parts.map((p) => p.toNonIndexed()));
  for (const p of parts) p.dispose();
  merged?.deleteAttribute("uv");
  return merged;
}

/** Platform slabs, UVs in world metres ÷ tile, so the paving runs on across balconies. */
function slabGeometry(balconies: BalconyGeometry[], tileSize: number): THREE.BufferGeometry | null {
  const parts = balconies.map(({ slab: r }) => {
    const g = new THREE.BoxGeometry(r.maxX - r.minX, BALCONY_SLAB, r.maxZ - r.minZ);
    g.translate((r.minX + r.maxX) / 2, -BALCONY_SLAB / 2, (r.minZ + r.maxZ) / 2);
    const pos = g.attributes.position;
    const nrm = g.attributes.normal;
    const uv = g.attributes.uv;
    for (let i = 0; i < pos.count; i++) {
      const [x, y, z] = [pos.getX(i), pos.getY(i), pos.getZ(i)];
      const ny = Math.abs(nrm.getY(i)) > 0.5;
      const nx = Math.abs(nrm.getX(i)) > 0.5;
      uv.setXY(i, (ny ? x : nx ? z : x) / tileSize, (ny ? z : y) / tileSize);
    }
    return g;
  });
  if (!parts.length) return null;
  const merged = mergeGeometries(parts);
  for (const p of parts) p.dispose();
  return merged;
}

/** One outward-facing quad per facade panel (holed around every opening on the wall). */
function facadeGeometry(facades: Facade[], openings: Parameters<typeof facadePanels>[1], tileSize: number): THREE.BufferGeometry | null {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  for (const f of facades) {
    for (const { a0, a1, y0, y1 } of facadePanels(f, openings)) {
      const corner = (a: number, y: number): [number, number, number] => (f.axis === "x" ? [a, y, f.plane] : [f.plane, y, a]);
      const quad = [corner(a0, y0), corner(a1, y0), corner(a1, y1), corner(a0, y1)];
      // Wind counter-clockwise seen from outside (along the normal).
      const e1 = new THREE.Vector3(...quad[1]).sub(new THREE.Vector3(...quad[0]));
      const e2 = new THREE.Vector3(...quad[3]).sub(new THREE.Vector3(...quad[0]));
      const n = new THREE.Vector3(f.normal[0], 0, f.normal[1]);
      const order = e1.cross(e2).dot(n) > 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2];
      const uvOf = (k: number) => [(k === 0 || k === 3 ? a0 : a1) / tileSize, (k < 2 ? y0 : y1) / tileSize];
      for (const k of order) {
        positions.push(...quad[k]);
        normals.push(n.x, 0, n.z);
        uvs.push(...uvOf(k));
      }
    }
  }
  if (!positions.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  return g;
}

/** Own copies of a scan (wrap + repeat 1, world-metre UVs) — the cached originals may be tiled by the room. */
function useOutdoorMaps(texture: SurfaceTexture) {
  const loaded = useTexture([texture.map, texture.roughnessMap, texture.normalMap]);
  const maps = useMemo(
    () =>
      loaded.map((t) => {
        const c = t.clone();
        c.wrapS = THREE.RepeatWrapping;
        c.wrapT = THREE.RepeatWrapping;
        c.repeat.set(1, 1);
        c.anisotropy = 4;
        c.needsUpdate = true;
        return c;
      }),
    [loaded]
  );
  useEffect(() => () => maps.forEach((m) => m.dispose()), [maps]);
  // Stable object: the materials below are rebuilt whenever it changes.
  return useMemo(() => ({ map: maps[0], roughnessMap: maps[1], normalMap: maps[2] }), [maps]);
}

/**
 * Every balcony of the room (balcony.ts): paved platform, steel railing and the facade skin around the doors,
 * all lit by the panorama (outdoorLight.ts) instead of the room's lights. Three draw calls in total.
 */
export default function Balconies() {
  const { layout, exhibition } = useExhibition();
  const { walls, windows } = layout;
  const balconies = useMemo(() => balconyGeometries(windows), [windows]);
  const facades = useMemo(() => balconyFacades(walls, windows), [walls, windows]);

  const panorama = findOutdoorPanorama(exhibition.outdoor?.panoramaId);
  const rotationY = exhibition.outdoor?.rotationY ?? 0;
  useLayoutEffect(() => {
    setOutdoorLight(outdoorLightFor(panorama.id, rotationY, panorama.intensity, facades, spillLightsFor(windows, facades)));
  }, [panorama, rotationY, facades, windows]);

  const paving = useOutdoorMaps(PAVING);
  const render = useOutdoorMaps(RENDER);

  const built = useMemo(() => {
    const slab = slabGeometry(balconies, PAVING.tileSize);
    const railing = railingGeometry(balconies);
    const facade = facadeGeometry(facades, windows ?? [], RENDER.tileSize);

    const slabMaterial = new THREE.MeshStandardMaterial({ ...paving, normalScale: new THREE.Vector2(...PAVING.normalScale), roughness: 1 });
    const facadeMaterial = new THREE.MeshStandardMaterial({ ...render, color: FACADE_COLOR, roughness: 1 });
    const railingMaterial = new THREE.MeshStandardMaterial(RAILING);
    for (const m of [slabMaterial, facadeMaterial, railingMaterial]) applyOutdoorLight(m);
    return [
      { key: "slab", geometry: slab, material: slabMaterial },
      { key: "facade", geometry: facade, material: facadeMaterial },
      { key: "railing", geometry: railing, material: railingMaterial },
    ];
  }, [balconies, facades, windows, paving, render]);

  useEffect(
    () => () => {
      for (const b of built) {
        b.geometry?.dispose();
        b.material.dispose();
      }
    },
    [built]
  );

  if (!balconies.length) return null;
  return (
    <group>
      {built.map((b) => (b.geometry ? <mesh key={b.key} geometry={b.geometry} material={b.material} /> : null))}
    </group>
  );
}
