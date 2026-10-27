import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import type { Artwork as ArtworkData } from "./artworks";
import { useExhibition } from "./ExhibitionContext";

// Applied on top of each theme's own spotIntensity (exhibitions.ts/backendAdapter.ts) — one shared dial instead of
// re-tuning every theme's value by hand.
const SPOT_INTENSITY_SCALE = 0.6;
const SPOT_FADE_NEAR_DISTANCE = 9;
const SPOT_FADE_FAR_DISTANCE = 15;
const LAMP_RISE = 0.45;
const CEILING_CLEARANCE = 0.15;
// The actual (invisible) light-emitting point sits farther out from the wall than the visible fixture (see
// ArtworkFixtures.tsx). With the emitter close to the wall, its beam axis would be nearly parallel to the
// wall surface, so the cone's outer rays would graze the wall and land near the fixture regardless of the
// target's height, instead of converging where aimed. Pulling the real emission point out gives the beam a
// steep enough angle to land squarely on each painting at its own height.
const BEAM_STANDOFF = 1.6;
// Cone half-angle was previously a single fixed value (0.42 rad) for every painting regardless of width —
// at BEAM_STANDOFF that lights a ~1.4m-diameter circle on the wall, which fully covers a small canvas but
// only grazes the center of a large one. Now derived per-painting from its physical width so the cone
// actually spans the canvas either way; MIN keeps the previous tight look for small paintings, MAX stops
// very wide paintings from flattening into an unrealistically broad floodlight.
const SPOT_ANGLE_MIN = 0.42;
const SPOT_ANGLE_MAX = 0.95;
// Cone covers slightly past the canvas edge (not flush) so the penumbra's soft falloff lands outside the
// painting instead of visibly dimming its edge.
const SPOT_WIDTH_MARGIN = 1.15;

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
  aimPoint: THREE.Vector3;
  angle: number;
}

// Lamp height follows each painting's own top edge (not a fixed rail shared by the whole wall) — a tall-ceiling
// room would otherwise leave the fixed rail too far above a normally-hung painting for the beam to land on it.
// placeArtworksAlongWall() guarantees CEILING_HEADROOM (0.73m) of clearance above every painting's top edge, so
// LAMP_RISE sits comfortably under that; the wallHeight clamp is just a safety net for hand-authored static
// artworks.ts entries that don't go through that placement math.
function prepareLight(data: ArtworkData, wallHeight: number): PreparedLight {
  const topEdge = data.position[1] + data.height / 2;
  const lightY = Math.min(topEdge + LAMP_RISE, wallHeight - CEILING_CLEARANCE);
  const normal = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), data.rotationY);
  const position = new THREE.Vector3(
    data.position[0] + normal.x * BEAM_STANDOFF,
    lightY,
    data.position[2] + normal.z * BEAM_STANDOFF
  );
  // Aim at the upper third of the canvas (not its center) — a real picture light grazes down from just under
  // the frame top, it doesn't point square at the middle of the painting.
  const aimPoint = new THREE.Vector3(data.position[0], topEdge - data.height * 0.15, data.position[2]);
  const width = data.height * data.aspect;
  const angle = THREE.MathUtils.clamp(
    Math.atan((width / 2) * SPOT_WIDTH_MARGIN / BEAM_STANDOFF),
    SPOT_ANGLE_MIN,
    SPOT_ANGLE_MAX
  );
  return { artwork: data, position, aimPoint, angle };
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
      spotLight.angle = light.angle;
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
          <spotLight
            ref={(l) => { lightRefs.current[i] = l; }}
            angle={0.42}
            penumbra={0.9}
            intensity={0}
            distance={7}
            decay={2}
          />
        </group>
      ))}
    </>
  );
}
