// Web port of vea-app-react-native's ArtworkIconProjector.tsx: lives inside
// the Canvas (needs camera/frame access), projects each artwork's top-right
// corner into 2D screen coordinates every ~100ms, so App.tsx can render a
// real DOM "i" button there as a sibling overlay. Kept as close to the
// mobile version as possible — same appear radius/throttle/margin — for
// cross-platform behavioral parity (see root CLAUDE.md's mobile-parity note).
import { useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useExhibition } from "./ExhibitionContext";
import { ARTWORKS } from "./artworks";

export interface ArtworkIconPosition {
  id: string;
  x: number;
  y: number;
  visible: boolean;
  /** Squared floor-plane distance (meters²) from the player — lets App.tsx pick the single nearest artwork to respond to the interact key when several icons are visible at once. */
  distanceSq: number;
}

/** How far off-screen (px) an icon may project before we stop rendering it — avoids a jarring pop at the exact viewport edge. */
const OFFSCREEN_MARGIN = 40;
/** Recomputed at ~10Hz, not every frame — icon markers don't need 60fps tracking precision, and this keeps the DOM overlay's re-render rate cheap. */
const UPDATE_INTERVAL = 0.1;
/** Floor-plane distance (meters) the player must be within for a painting's icon to appear — matches the mobile app's client-approved value, icons should only show up in front of the actual painting. */
const APPEAR_RADIUS = 3.5;

export default function ArtworkIconProjector({
  onPositionsChange,
}: {
  onPositionsChange: (positions: ArtworkIconPosition[]) => void;
}) {
  const { camera, size } = useThree();
  const { exhibition } = useExhibition();
  const lastUpdate = useRef(0);
  const vector = useRef(new THREE.Vector3());

  useFrame(({ clock }) => {
    if (clock.elapsedTime - lastUpdate.current < UPDATE_INTERVAL) return;
    lastUpdate.current = clock.elapsedTime;

    // Same fallback GalleryArtworks.tsx uses — the static demo exhibitions
    // never populate exhibition.artworks, so icons work there too.
    const artworks =
      exhibition.artworks ?? ARTWORKS.filter((a) => a.exhibitionId === exhibition.id);

    const positions: ArtworkIconPosition[] = artworks.map((artwork) => {
      const width = artwork.height * artwork.aspect;
      // Painting-local "right" and "up" directions in world space, derived
      // from rotationY the same way ArtworkLight's normal vector is (see
      // Artwork.tsx) — right = (cos, 0, -sin) is 90° from the front normal
      // (sin, 0, cos), consistent with this codebase's rotationY convention
      // (0 = +Z normal, PI/2 = +X normal).
      const cos = Math.cos(artwork.rotationY);
      const sin = Math.sin(artwork.rotationY);
      const marginX = width / 2 + 0.08;
      const marginY = artwork.height / 2 + 0.08;

      const dx = camera.position.x - artwork.position[0];
      const dz = camera.position.z - artwork.position[2];
      const nearEnough = dx * dx + dz * dz <= APPEAR_RADIUS * APPEAR_RADIUS;

      vector.current.set(
        artwork.position[0] + cos * marginX,
        artwork.position[1] + marginY,
        artwork.position[2] - sin * marginX
      );
      vector.current.project(camera);

      const behindCamera = vector.current.z > 1;
      const x = (vector.current.x * 0.5 + 0.5) * size.width;
      const y = (-vector.current.y * 0.5 + 0.5) * size.height;
      const onScreen =
        x > -OFFSCREEN_MARGIN &&
        x < size.width + OFFSCREEN_MARGIN &&
        y > -OFFSCREEN_MARGIN &&
        y < size.height + OFFSCREEN_MARGIN;

      return {
        id: artwork.id,
        x,
        y,
        visible: nearEnough && !behindCamera && onScreen,
        distanceSq: dx * dx + dz * dz,
      };
    });

    onPositionsChange(positions);
  });

  return null;
}
