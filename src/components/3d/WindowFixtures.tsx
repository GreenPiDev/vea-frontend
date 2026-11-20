import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { applyCeilingLight } from "./ceilingLight";
import { GLASS_ABSORPTION, WINDOW_STYLES, buildWindowParts } from "./windowGeometry";
import type { WindowOpening, WindowStyleId } from "./windowOpenings";

/**
 * Glass: what it lets through is the background multiplied by a slight green-grey tint (blendDst = 1 − tint,
 * GLASS_ABSORPTION), and on top it *adds* its own colour, which is black diffuse + the env-map reflection with
 * the BRDF's Fresnel — ~4 % of the room's reflection face-on, much more at a grazing angle, like real float
 * glass. One pass, no MeshPhysicalMaterial.transmission (that re-renders the scene).
 */

function createGlassMaterial() {
  const m = new THREE.MeshStandardMaterial({ color: 0x000000, roughness: 0.03, metalness: 0 });
  m.transparent = true;
  m.depthWrite = false;
  m.blending = THREE.CustomBlending;
  m.blendEquation = THREE.AddEquation;
  m.blendSrc = THREE.OneFactor;
  m.blendDst = THREE.OneMinusConstantColorFactor;
  m.blendColor.setRGB(...GLASS_ABSORPTION);
  return m;
}

/**
 * Every window in the room (joinery from windowGeometry.ts). One merged, vertex-coloured mesh per style used,
 * one per hardware finish, one for all the glass — a room's windows cost a handful of draw calls in total.
 */
export default function WindowFixtures({ windows }: { windows: WindowOpening[] }) {
  const built = useMemo(() => {
    const byStyle = new Map<WindowStyleId, { joinery: THREE.BufferGeometry[]; hardware: THREE.BufferGeometry[] }>();
    const panes: THREE.BufferGeometry[] = [];
    for (const w of windows) {
      const parts = buildWindowParts(w);
      const entry = byStyle.get(w.styleId) ?? { joinery: [], hardware: [] };
      entry.joinery.push(parts.joinery);
      if (parts.hardware) entry.hardware.push(parts.hardware);
      byStyle.set(w.styleId, entry);
      for (const p of parts.panes) {
        const plane = new THREE.PlaneGeometry(p.width, p.height);
        plane.deleteAttribute("uv");
        plane.rotateY(p.rotationY);
        plane.translate(...p.center);
        panes.push(plane);
      }
    }

    const meshes: { key: string; geometry: THREE.BufferGeometry; material: THREE.MeshStandardMaterial }[] = [];
    for (const [styleId, { joinery, hardware }] of byStyle) {
      const style = WINDOW_STYLES[styleId];
      const add = (key: string, geos: THREE.BufferGeometry[], spec: { roughness: number; metalness: number }) => {
        if (!geos.length) return;
        const geometry = mergeGeometries(geos)!;
        for (const g of geos) g.dispose();
        // Colour lives in the vertex colours (paint × shadow-gap/gasket shade), so the material stays white.
        const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: spec.roughness, metalness: spec.metalness });
        applyCeilingLight(material);
        meshes.push({ key, geometry, material });
      };
      add(`${styleId}:joinery`, joinery, style.joinery);
      if (style.hardware) add(`${styleId}:hardware`, hardware, style.hardware);
    }

    const glassGeometry = mergeGeometries(panes)!;
    for (const p of panes) p.dispose();
    return { meshes, glass: { geometry: glassGeometry, material: createGlassMaterial() } };
  }, [windows]);

  useEffect(
    () => () => {
      for (const m of built.meshes) {
        m.geometry.dispose();
        m.material.dispose();
      }
      built.glass.geometry.dispose();
      built.glass.material.dispose();
    },
    [built]
  );

  return (
    <group>
      {built.meshes.map((m) => (
        <mesh key={m.key} geometry={m.geometry} material={m.material} />
      ))}
      <mesh geometry={built.glass.geometry} material={built.glass.material} renderOrder={1} />
    </group>
  );
}
