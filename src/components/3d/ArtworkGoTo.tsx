import { useEffect, useRef } from "react";
import { useThree } from "@react-three/fiber";
import { useExhibition } from "./ExhibitionContext";
import { useWallLabels } from "./useWallLabels";
import { EYE_HEIGHT } from "./galleryLayout";
import { clearNavigation, computeArtworkViewpoint, type NavigationRequest } from "./clickNavigationGeometry";
import { fovForAspect } from "./cameraFov";
import { artworkLevel, levelNav } from "./levels";

/** "Take me to this painting" from outside the Canvas (the thumbnail rail). `seq` makes a repeat click on the same work a new request. */
export interface ArtworkGoToRequest {
  artworkId: string;
  seq: number;
}

/**
 * Teleports the visitor to a painting's viewing spot, facing it — the same spot and facing a floor-marker
 * click walks to (computeArtworkViewpoint). Instant on purpose (user request, 2026-11-20): a walk across
 * the room was slow and could get lost on the way. Cancels any walk in progress. Renders nothing.
 */
export default function ArtworkGoTo({ request, navigation }: { request: ArtworkGoToRequest | null; navigation: NavigationRequest }) {
  const camera = useThree((s) => s.camera);
  const aspect = useThree((s) => s.size.width / Math.max(1, s.size.height));
  const { layout } = useExhibition();
  const { artworks } = useWallLabels();

  // Latest values, read only when a new request arrives — the effect below must fire per request, not
  // whenever the window is resized or the layout object is rebuilt.
  const live = useRef({ camera, aspect, layout, artworks, navigation });
  live.current = { camera, aspect, layout, artworks, navigation };

  useEffect(() => {
    if (!request) return;
    const { camera, aspect, layout, artworks, navigation } = live.current;
    const artwork = artworks.find((a) => a.id === request.artworkId);
    if (!artwork) return;
    // On the level the work is seen from (a mezzanine work: up on the slab, levels.ts).
    const nav = levelNav(layout);
    const level = artworkLevel(nav, artwork);
    const { colliders, y } = nav.levels[level];
    const viewpoint = computeArtworkViewpoint(artwork, colliders, { verticalFovDeg: fovForAspect(aspect), aspect }, level, y);
    clearNavigation(navigation);
    camera.position.set(viewpoint.x, y + EYE_HEIGHT, viewpoint.z);
    camera.rotation.set(viewpoint.pitch, viewpoint.yaw, 0);
  }, [request]);

  return null;
}
