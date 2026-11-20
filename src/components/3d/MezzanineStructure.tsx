import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { useTexture } from "@react-three/drei";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { useExhibition } from "./ExhibitionContext";
import { COLUMN_SIZE, type Mezzanine as MezzanineData, type Stair } from "./mezzanine";
import { railingGeometry, stairRailingGeometry } from "./railingGeometry";
import { applyCeilingLight } from "./ceilingLight";
import { WALL_TEXTURES, findTexture, type SurfaceTexture } from "./surfaceTextures";
import { removeSunOccluderSource, setSunOccluderSource } from "./sunOccluders";

// Oak-look treads (a scanned wood veneer, not a flat colour) and powder-coated steel for everything
// structural: stringers, railings, columns — the same steel as the balcony railings.
const TREAD_WOOD = findTexture(WALL_TEXTURES, "Wood062")!;
const STEEL = { color: "#2a2b2e", roughness: 0.45, metalness: 0.6 };

/** Tread thickness and how far each tread's nosing overhangs the one below (m). */
const TREAD_THICKNESS = 0.045;
const NOSING = 0.025;
/** Steel stringer plate under an open side: thickness across, depth below the nosing line. */
const STRINGER_W = 0.02;
const STRINGER_DEPTH = 0.32;

/** A point on the floor plane from (along the stair's axis, across it). */
function pt(s: Stair, along: number, across: number): [number, number] {
  return s.axis === "z" ? [across, along] : [along, across];
}

/** Floating treads (no risers — an open steel stair): one box per tread, UVs in world metres ÷ tile. */
function treadGeometry(s: Stair, tileSize: number): THREE.BufferGeometry | null {
  const riser = s.rise / s.risers;
  const treads = s.risers - 1;
  const [c0, c1] = s.across;
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < treads; i++) {
    const a0 = s.bottom + s.dir * (i * s.going - NOSING);
    const a1 = s.bottom + s.dir * (i + 1) * s.going;
    const yTop = (i + 1) * riser;
    const [x0, z0] = pt(s, a0, c0);
    const [x1, z1] = pt(s, a1, c1);
    const g = new THREE.BoxGeometry(Math.abs(x1 - x0), TREAD_THICKNESS, Math.abs(z1 - z0));
    g.translate((x0 + x1) / 2, yTop - TREAD_THICKNESS / 2, (z0 + z1) / 2);
    const pos = g.attributes.position;
    const nrm = g.attributes.normal;
    const uv = g.attributes.uv;
    for (let k = 0; k < pos.count; k++) {
      const [x, y, z] = [pos.getX(k), pos.getY(k), pos.getZ(k)];
      // Grain along the tread (across the stair): top/bottom faces map (across, along), edges the side.
      const across = s.axis === "z" ? x : z;
      const along = s.axis === "z" ? z : x;
      const ny = Math.abs(nrm.getY(k)) > 0.5;
      uv.setXY(k, across / tileSize, (ny ? along : y) / tileSize);
    }
    parts.push(g);
  }
  if (!parts.length) return null;
  const merged = mergeGeometries(parts);
  for (const p of parts) p.dispose();
  return merged;
}

/** Steel: slab railings, stair railings + stringers on the stair's open sides, columns — one geometry. */
function steelGeometry(m: MezzanineData): THREE.BufferGeometry | null {
  const s = m.stair;
  const riser = s.rise / s.risers;
  const treads = s.risers - 1;
  const parts: (THREE.BufferGeometry | null)[] = [railingGeometry(m.railings, m.top)];
  for (const side of s.sides.filter((x) => x.open)) {
    // Inset a little from the tread ends so the posts stand on the treads.
    const across = side.at + (side.at === s.across[0] ? 0.05 : -0.05);
    const from = pt(s, s.bottom, across);
    const to = pt(s, s.topAt, across);
    // Nosing line: the first tread's top at the foot, the slab's top at the head.
    const nosing = (t: number) => riser + t * (s.rise - riser);
    parts.push(stairRailingGeometry(from, to, treads, nosing, (i) => (i + 1) * riser));
    // Stringer plate: a sloped steel band under the tread ends, from the floor to the slab edge.
    const a = new THREE.Vector3(...xyz(pt(s, s.bottom, side.at), riser - STRINGER_DEPTH / 2));
    const b = new THREE.Vector3(...xyz(pt(s, s.topAt, side.at), s.rise - STRINGER_DEPTH / 2));
    parts.push(slopedBox(a, b, STRINGER_W, STRINGER_DEPTH));
  }
  for (const [x, z] of m.columns) {
    const g = new THREE.BoxGeometry(COLUMN_SIZE, m.underside, COLUMN_SIZE);
    g.translate(x, m.underside / 2, z);
    parts.push(g);
  }
  const list = parts.filter((p): p is THREE.BufferGeometry => p !== null).map((p) => {
    const n = p.index ? p.toNonIndexed() : p;
    if (n.getAttribute("uv")) n.deleteAttribute("uv");
    return n;
  });
  if (!list.length) return null;
  return mergeGeometries(list);
}

function xyz([x, z]: [number, number], y: number): [number, number, number] {
  return [x, y, z];
}

/** A box along a 3D segment (w across, h tall in its cross-section). */
function slopedBox(a: THREE.Vector3, b: THREE.Vector3, w: number, h: number): THREE.BufferGeometry {
  const d = new THREE.Vector3().subVectors(b, a);
  const g = new THREE.BoxGeometry(d.length(), h, w);
  g.rotateZ(Math.atan2(d.y, Math.hypot(d.x, d.z)));
  g.rotateY(Math.atan2(-d.z, d.x));
  g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return g;
}

/** Own copies of the wood scan (wrap + repeat 1, world-metre UVs) — the cached originals may be tiled by the room. */
function useTreadMaps(texture: SurfaceTexture) {
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
  return maps;
}

/**
 * A mezzanine's stair, railings and columns (mezzanine.ts) — two draw calls: wood treads, all the steel.
 * The slab itself is part of the room (GalleryRoom). Both receive the ceiling fixtures (applyCeilingLight),
 * including the slab's shadow.
 */
export default function MezzanineStructure() {
  const { layout } = useExhibition();
  const m = layout.mezzanine;
  const [map, roughnessMap, normalMap] = useTreadMaps(TREAD_WOOD);

  const built = useMemo(() => {
    if (!m) return null;
    const treads = treadGeometry(m.stair, TREAD_WOOD.tileSize);
    const steel = steelGeometry(m);
    const wood = new THREE.MeshStandardMaterial({ map, roughnessMap, normalMap, normalScale: new THREE.Vector2(...TREAD_WOOD.normalScale), roughness: 1 });
    const metal = new THREE.MeshStandardMaterial(STEEL);
    applyCeilingLight(wood);
    applyCeilingLight(metal);
    return { treads, steel, wood, metal };
  }, [m, map, roughnessMap, normalMap]);

  // The slab throws a sun shadow (windowed rooms: no sun patch under it, sunOccluders.ts).
  useEffect(() => {
    if (!m) return;
    const r = m.rect;
    setSunOccluderSource(
      "mezzanine",
      [
        {
          center: [(r.minX + r.maxX) / 2, (m.top + m.underside) / 2, (r.minZ + r.maxZ) / 2],
          half: [(r.maxX - r.minX) / 2, (m.top - m.underside) / 2, (r.maxZ - r.minZ) / 2],
          rotationY: 0,
        },
      ],
      // Before furniture and paintings: the biggest caster in the room.
      -1
    );
    return () => removeSunOccluderSource("mezzanine");
  }, [m]);

  useEffect(
    () => () => {
      if (!built) return;
      built.treads?.dispose();
      built.steel?.dispose();
      built.wood.dispose();
      built.metal.dispose();
    },
    [built]
  );

  if (!built) return null;
  return (
    <group>
      {built.treads && <mesh geometry={built.treads} material={built.wood} />}
      {built.steel && <mesh geometry={built.steel} material={built.metal} />}
    </group>
  );
}
