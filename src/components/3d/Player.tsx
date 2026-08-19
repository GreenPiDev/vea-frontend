import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { PointerLockControls } from "@react-three/drei";
import * as THREE from "three";
import { EYE_HEIGHT, PLAYER_RADIUS, type ColliderBox } from "./galleryLayout";
import { useExhibition } from "./ExhibitionContext";

const WALK_SPEED = 3.6;

interface PlayerProps {
  onLockChange?: (locked: boolean) => void;
}

/** First-person walking controller: pointer-lock look + WASD move + wall collision. */
export default function Player({ onLockChange }: PlayerProps) {
  const { camera } = useThree();
  const { layout } = useExhibition();
  const keys = useRef({ forward: false, back: false, left: false, right: false });

  useEffect(() => {
    camera.position.set(...layout.playerStart);
    // PointerLockControls reads the camera's live quaternion on every mouse
    // move rather than caching one at construction time, so setting the
    // initial yaw here is enough to seed the starting look direction.
    camera.rotation.set(0, layout.playerStartYaw, 0);
  }, [camera, layout.playerStart, layout.playerStartYaw]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => setKey(e.code, true);
    const up = (e: KeyboardEvent) => setKey(e.code, false);
    const setKey = (code: string, value: boolean) => {
      switch (code) {
        case "KeyW":
        case "ArrowUp":
          keys.current.forward = value;
          break;
        case "KeyS":
        case "ArrowDown":
          keys.current.back = value;
          break;
        case "KeyA":
        case "ArrowLeft":
          keys.current.left = value;
          break;
        case "KeyD":
        case "ArrowRight":
          keys.current.right = value;
          break;
      }
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  const forwardDir = useRef(new THREE.Vector3());
  const rightDir = useRef(new THREE.Vector3());

  useFrame((_, delta) => {
    const { forward, back, left, right } = keys.current;
    if (!forward && !back && !left && !right) return;

    camera.getWorldDirection(forwardDir.current);
    forwardDir.current.y = 0;
    forwardDir.current.normalize();
    rightDir.current.set(-forwardDir.current.z, 0, forwardDir.current.x);

    const moveStep = WALK_SPEED * Math.min(delta, 0.05);
    let dx = 0;
    let dz = 0;
    if (forward) {
      dx += forwardDir.current.x * moveStep;
      dz += forwardDir.current.z * moveStep;
    }
    if (back) {
      dx -= forwardDir.current.x * moveStep;
      dz -= forwardDir.current.z * moveStep;
    }
    if (right) {
      dx += rightDir.current.x * moveStep;
      dz += rightDir.current.z * moveStep;
    }
    if (left) {
      dx -= rightDir.current.x * moveStep;
      dz -= rightDir.current.z * moveStep;
    }

    const pos = camera.position;

    if (dx !== 0 && !collides(pos.x + dx, pos.z, layout.colliders)) {
      pos.x += dx;
    }
    if (dz !== 0 && !collides(pos.x, pos.z + dz, layout.colliders)) {
      pos.z += dz;
    }
    pos.y = EYE_HEIGHT;
  });

  return (
    <PointerLockControls
      onLock={() => onLockChange?.(true)}
      onUnlock={() => onLockChange?.(false)}
    />
  );
}

function collides(x: number, z: number, colliders: ColliderBox[]): boolean {
  const r = PLAYER_RADIUS;
  for (const box of colliders) {
    if (x + r > box.minX && x - r < box.maxX && z + r > box.minZ && z - r < box.maxZ) {
      return true;
    }
  }
  return false;
}
