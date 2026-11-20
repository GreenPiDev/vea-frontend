import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useExhibition } from "./ExhibitionContext";
import { FRAME_BORDER } from "./artworkShadow";
import { applyWallTargetOutline, outlineGeometry, outlineMaterial, tickOutline } from "./artworkOutline";
import { pickWallTarget, wallBoxes, type WallTarget } from "./clickNavigationGeometry";
import { useWallLabels } from "./useWallLabels";

/** Re-aim at ~10 Hz — the outline doesn't need per-frame precision. */
const UPDATE_INTERVAL = 0.1;
const SCREEN_CENTRE = new THREE.Vector2(0, 0);

/**
 * Keyboard/pointer-lock ("walk") mode's way to open a painting or its wall label: the cursor is hidden
 * and locked, so whatever is at the centre of the view gets the hover outline, and a click opens it.
 * (There is deliberately no Enter shortcut for paintings — Enter is the sit/stand key.)
 */
export default function WalkArtworkPicker({
  onArtworkClick,
  onLabelClick,
}: {
  onArtworkClick: (artworkId: string) => void;
  onLabelClick?: (artworkId: string) => void;
}) {
  const { camera, gl } = useThree();
  const { layout } = useExhibition();
  const { artworks, rects: labelRects } = useWallLabels();
  const walls = useMemo(() => wallBoxes(layout), [layout]);
  const outlineRef = useRef<THREE.Mesh>(null);
  const aimed = useRef<WallTarget | null>(null);
  const lastUpdate = useRef(0);
  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  const hasLabelClick = Boolean(onLabelClick);

  useFrame(({ clock }, dt) => {
    if (outlineRef.current) tickOutline(outlineRef.current, dt, clock.elapsedTime);
    if (clock.elapsedTime - lastUpdate.current < UPDATE_INTERVAL) return;
    lastUpdate.current = clock.elapsedTime;
    let target: WallTarget | null = null;
    if (document.pointerLockElement === gl.domElement) {
      raycaster.setFromCamera(SCREEN_CENTRE, camera);
      const { origin, direction } = raycaster.ray;
      target = pickWallTarget(origin, direction, artworks, hasLabelClick ? labelRects : null, walls, FRAME_BORDER);
    }
    const prev = aimed.current;
    if (target?.artwork !== prev?.artwork || target?.kind !== prev?.kind) {
      aimed.current = target;
      if (outlineRef.current) applyWallTargetOutline(outlineRef.current, target, labelRects);
    }
  });

  const onClickRef = useRef({ onArtworkClick, onLabelClick });
  onClickRef.current = { onArtworkClick, onLabelClick };

  useEffect(() => {
    const canvas = gl.domElement;
    // While locked, clicks are delivered to the locked canvas. The click that *acquires* the lock happens
    // before the lock exists, so it never opens a painting by accident.
    const onClick = () => {
      const target = aimed.current;
      if (document.pointerLockElement !== canvas || !target) return;
      aimed.current = null;
      if (outlineRef.current) applyWallTargetOutline(outlineRef.current, null, new Map());
      if (target.kind === "label") onClickRef.current.onLabelClick?.(target.artwork.id);
      else onClickRef.current.onArtworkClick(target.artwork.id);
    };
    canvas.addEventListener("click", onClick);
    return () => canvas.removeEventListener("click", onClick);
  }, [gl]);

  return <mesh ref={outlineRef} geometry={outlineGeometry} material={outlineMaterial} visible={false} raycast={() => null} />;
}
