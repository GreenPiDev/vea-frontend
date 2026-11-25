import { useEffect, useLayoutEffect, useMemo } from "react";
import * as THREE from "three";
import { useTexture } from "@react-three/drei";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { useExhibition } from "./ExhibitionContext";
import { RAILING_GLASS_ABSORPTION, balustradeGeometry } from "./glassBalustrade";
import { createGlassMaterial } from "./glassMaterial";
import {
  BALCONY_SLAB,
  FACADE_OFFSET,
  balconyFacades,
  balconyGeometries,
  facadePanels,
  type BalconyGeometry,
  type Facade,
} from "./balcony";
import { applyOutdoorLight, outdoorLightFor, setOutdoorLight, spillLightsFor } from "./outdoorLight";
import { findOutdoorPanorama } from "./outdoorPanoramas";
import { FLOOR_TEXTURES, WALL_TEXTURES, findTexture, type SurfaceTexture } from "./surfaceTextures";

// Outside finishes: stone paving on the platform, render (plaster tinted warm grey) on the facade, a glass
// balustrade on anthracite steel posts (glassBalustrade.ts). Fixed, not themed: the room's colours are interior
// choices.
const PAVING = findTexture(FLOOR_TEXTURES, "PavingStones142")!;
const RENDER = findTexture(WALL_TEXTURES, "Plaster001")!;
const FACADE_COLOR = "#d8d1c4";
/** Powder coat is paint, not bare metal: dielectric, satin. Colours are in the vertex colours. */
const RAILING = { vertexColors: true, roughness: 0.42, metalness: 0 };

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
 * Every balcony of the room (balcony.ts): paved platform, glass balustrade and the facade skin around the
 * doors, all lit by the panorama (outdoorLight.ts) instead of the room's lights. The balustrade's steel and
 * glass reflect the panorama too (it's their env map — the room's env would put ceiling lamps in them).
 * Four draw calls in total.
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
  // Same URL as OutdoorPanorama.tsx: drei's cache hands back the very same texture (one upload, one PMREM).
  const sky = useTexture(panorama.url);

  const built = useMemo(() => {
    const slab = slabGeometry(balconies, PAVING.tileSize);
    const balustrade = balustradeGeometry(
      balconies.flatMap((b) => b.railings),
      { wallGapAt: () => FACADE_OFFSET }
    );
    const facade = facadeGeometry(facades, windows ?? [], RENDER.tileSize);

    const slabMaterial = new THREE.MeshStandardMaterial({ ...paving, normalScale: new THREE.Vector2(...PAVING.normalScale), roughness: 1 });
    const facadeMaterial = new THREE.MeshStandardMaterial({ ...render, color: FACADE_COLOR, roughness: 1 });
    const railingMaterial = new THREE.MeshStandardMaterial(RAILING);
    for (const m of [slabMaterial, facadeMaterial, railingMaterial]) applyOutdoorLight(m);
    const glassMaterial = createGlassMaterial(RAILING_GLASS_ABSORPTION);
    // OutdoorPanorama sets the same two fields on this shared texture; whichever runs first wins, same values.
    sky.mapping = THREE.EquirectangularReflectionMapping;
    sky.colorSpace = THREE.SRGBColorSpace;
    for (const m of [railingMaterial, glassMaterial]) {
      m.envMap = sky;
      m.envMapRotation.set(0, rotationY, 0);
      m.envMapIntensity = panorama.intensity;
    }
    return [
      { key: "slab", geometry: slab, material: slabMaterial, renderOrder: 0 },
      { key: "facade", geometry: facade, material: facadeMaterial, renderOrder: 0 },
      { key: "railing", geometry: balustrade?.solid ?? null, material: railingMaterial, renderOrder: 0 },
      { key: "glass", geometry: balustrade?.glass ?? null, material: glassMaterial, renderOrder: 1 },
    ];
  }, [balconies, facades, windows, paving, render, sky, rotationY, panorama.intensity]);

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
      {built.map((b) => (b.geometry ? <mesh key={b.key} geometry={b.geometry} material={b.material} renderOrder={b.renderOrder} /> : null))}
    </group>
  );
}
