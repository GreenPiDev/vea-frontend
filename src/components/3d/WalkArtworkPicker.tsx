import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { ARTWORKS } from "./artworks";
import { useExhibition } from "./ExhibitionContext";
import { FRAME_BORDER } from "./artworkShadow";
import { applyArtworkOutline, outlineGeometry, outlineMaterial } from "./artworkOutline";
import { pickArtwork, wallBoxes } from "./clickNavigationGeometry";
import type { Artwork as ArtworkData } from "./artworks";

/** Re-aim at ~10 Hz — the outline doesn't need per-frame precision. */
const UPDATE_INTERVAL = 0.1;
const SCREEN_CENTRE = new THREE.Vector2(0, 0);

/**
 * Keyboard/pointer-lock ("walk") mode's way to open a painting: the cursor is hidden and locked, so the
 * painting at the centre of the view gets the hover outline, and a click opens it. (There is
 * deliberately no Enter shortcut for paintings — Enter is the sit/stand key.)
 */
export default function WalkArtworkPicker({ onArtworkClick }: { onArtworkClick: (artworkId: string) => void }) {
  const { camera, gl } = useThree();
  const { exhibition, layout } = useExhibition();
  const artworks = useMemo(
    () => exhibition.artworks ?? ARTWORKS.filter((a) => a.exhibitionId === exhibition.id),
    [exhibition]
  );
  const walls = useMemo(() => wallBoxes(layout), [layout]);
  const outlineRef = useRef<THREE.Mesh>(null);
  const aimed = useRef<ArtworkData | null>(null);
  const lastUpdate = useRef(0);
  const raycaster = useMemo(() => new THREE.Raycaster(), []);

  useFrame(({ clock }) => {
    if (clock.elapsedTime - lastUpdate.current < UPDATE_INTERVAL) return;
    lastUpdate.current = clock.elapsedTime;
    let target: ArtworkData | null = null;
    if (document.pointerLockElement === gl.domElement) {
      raycaster.setFromCamera(SCREEN_CENTRE, camera);
      target = pickArtwork(raycaster.ray.origin, raycaster.ray.direction, artworks, walls, FRAME_BORDER)?.artwork ?? null;
    }
    if (target !== aimed.current) {
      aimed.current = target;
      if (outlineRef.current) applyArtworkOutline(outlineRef.current, target);
    }
  });

  const onClickRef = useRef(onArtworkClick);
  onClickRef.current = onArtworkClick;

  useEffect(() => {
    const canvas = gl.domElement;
    // While locked, clicks are delivered to the locked canvas. The click that *acquires* the lock happens
    // before the lock exists, so it never opens a painting by accident.
    const onClick = () => {
      if (document.pointerLockElement !== canvas || !aimed.current) return;
      const id = aimed.current.id;
      aimed.current = null;
      if (outlineRef.current) applyArtworkOutline(outlineRef.current, null);
      onClickRef.current(id);
    };
    canvas.addEventListener("click", onClick);
    return () => canvas.removeEventListener("click", onClick);
  }, [gl]);

  return <mesh ref={outlineRef} geometry={outlineGeometry} material={outlineMaterial} visible={false} raycast={() => null} />;
}
