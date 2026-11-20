import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import type { Artwork as ArtworkData } from "./artworks";
import { useExhibition } from "./ExhibitionContext";
// Applied on top of each theme's own spotIntensity (exhibitions.ts/backendAdapter.ts) — see sceneLighting.ts.
import { SPOT_INTENSITY_SCALE } from "./sceneLighting";
import { encodePictureLight, pictureLightPlacement } from "./pictureLight";
const SPOT_FADE_NEAR_DISTANCE = 9;
const SPOT_FADE_FAR_DISTANCE = 15;
// Where the light comes from and how it spreads over the canvas lives in pictureLight.ts (Adım 7): the
// light leaves the visible lamp bar, and a patched spot term shapes it into an even, top-weighted window on
// the wall. History, so nobody walks back into it: a plain round spot cone at the lamp lands its hot spot
// right under the fixture (above the painting), so the emitter used to be pushed 1.6 m out into the room
// (BEAM_STANDOFF) with a width-derived cone angle — which made the visible lamp and the real light origin
// disagree and still left a round hot spot above the frame.

// Fixed real-spotLight budget, independent of total artwork count. Every frame, these N lights are
// imperatively repositioned onto the N artworks currently nearest the camera (sorted by XZ distance) —
// a "virtual lights" / light-pooling technique, not per-artwork lights.
//
// This replaces two earlier, both-flawed approaches (2026-10-19):
//   1. One real spotLight per artwork, always mounted: total active light count scales with the
//      exhibition's artwork count, and every one of them is evaluated per-fragment by every lit surface
//      every frame regardless of distance — fine for a handful of paintings, but a 20+ painting room
//      (this scene's normal-mapped, anisotropically-filtered walls/floor especially) dropped a steady
//      75fps to ~20fps.
//   2. The same per-artwork lights, but unmounted past a distance threshold to bound the per-fragment
//      cost: this fixed the steady-state cost, but introduced a worse problem — three.js bakes the
//      scene's current active spotLight *count* into every shared MeshStandardMaterial's compiled
//      shader program (`numSpotLights`). Walking through a large room crosses several different counts
//      in quick succession as different paintings' lights mount/unmount, each one a multi-frame shader
//      recompile stall (this scene shares materials heavily by design — walls, frames, canvases) —
//      the exact "75 -> 19 -> 75" spikes this was built to fix in the first place.
//
// A fixed pool sidesteps both: the light count never changes (compiled once, first frame), and the
// per-fragment cost is capped at POOL_SIZE regardless of how many artworks the exhibition has.
const LIGHT_POOL_SIZE = 8;

interface PreparedLight {
  artwork: ArtworkData;
  position: THREE.Vector3;
  /** Point straight into the wall from the lamp — gives the spot its (horizontal) wall-normal direction. */
  aimPoint: THREE.Vector3;
  shape: ReturnType<typeof encodePictureLight>;
}

function prepareLight(data: ArtworkData, wallHeight: number): PreparedLight {
  const placement = pictureLightPlacement(data, wallHeight);
  return {
    artwork: data,
    position: placement.position,
    aimPoint: placement.position.clone().sub(placement.normal),
    shape: encodePictureLight(placement),
  };
}

/** All artwork picture-lights for the current room, as a fixed-size pool reassigned to the nearest paintings every frame — see module doc comment. */
export default function ArtworkLightPool({ artworks }: { artworks: ArtworkData[] }) {
  const { exhibition, layout } = useExhibition();
  const { camera } = useThree();
  const baseIntensity = exhibition.theme.spotIntensity * SPOT_INTENSITY_SCALE;

  const prepared = useMemo(
    () => artworks.map((data) => prepareLight(data, layout.wallHeight)),
    [artworks, layout.wallHeight]
  );

  const lightRefs = useRef<(THREE.SpotLight | null)[]>([]);
  const targetRefs = useRef<(THREE.Object3D | null)[]>([]);
  // Reused across frames instead of allocated fresh each time — avoids a per-frame GC-pressure array for
  // what can be a few hundred artworks in a large exhibition.
  const scratch = useRef<{ light: PreparedLight; distance: number }[]>([]);

  useFrame(() => {
    const cx = camera.position.x;
    const cz = camera.position.z;
    const list = scratch.current;
    list.length = 0;
    for (const light of prepared) {
      const dx = cx - light.artwork.position[0];
      const dz = cz - light.artwork.position[2];
      list.push({ light, distance: Math.hypot(dx, dz) });
    }
    list.sort((a, b) => a.distance - b.distance);

    for (let i = 0; i < LIGHT_POOL_SIZE; i++) {
      const spotLight = lightRefs.current[i];
      const target = targetRefs.current[i];
      if (!spotLight || !target) continue;

      const entry = list[i];
      if (!entry) {
        spotLight.intensity = 0;
        continue;
      }

      const { light, distance } = entry;
      spotLight.position.copy(light.position);
      spotLight.color.set(exhibition.theme.spotColor);
      spotLight.angle = light.shape.angle;
      spotLight.penumbra = light.shape.penumbra;
      spotLight.distance = light.shape.distance;
      spotLight.decay = light.shape.decay;
      spotLight.target = target;
      target.position.copy(light.aimPoint);
      const fade =
        1 - THREE.MathUtils.smoothstep(distance, SPOT_FADE_NEAR_DISTANCE, SPOT_FADE_FAR_DISTANCE);
      spotLight.intensity = baseIntensity * fade;
    }
  });

  return (
    <>
      {Array.from({ length: LIGHT_POOL_SIZE }, (_, i) => (
        <group key={i}>
          <object3D ref={(o) => { targetRefs.current[i] = o; }} />
          {/* angle/penumbra/distance/decay carry the picture-light window, not a cone (encodePictureLight). */}
          <spotLight ref={(l) => { lightRefs.current[i] = l; }} intensity={0} />
        </group>
      ))}
    </>
  );
}
