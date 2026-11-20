import { useEffect } from "react";
import * as THREE from "three";
import { useTexture } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import type { OutdoorPanorama as Panorama } from "./outdoorPanoramas";

/**
 * Shows a 360° photo as the scene background — only visible through the room's windows, since the room is
 * otherwise closed. Swaps scene.background while mounted and restores the previous value (the theme colour
 * set in Scene.tsx) on unmount, so the room shows its plain background until the photo has loaded.
 * scene.environment (RoomEnvironment.tsx) is untouched: the room keeps reflecting itself, not the outdoors.
 */
export default function OutdoorPanorama({ panorama, rotationY = 0 }: { panorama: Panorama; rotationY?: number }) {
  const texture = useTexture(panorama.url);
  const scene = useThree((s) => s.scene);

  useEffect(() => {
    texture.mapping = THREE.EquirectangularReflectionMapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
    const previous = {
      background: scene.background,
      intensity: scene.backgroundIntensity,
      rotation: scene.backgroundRotation.clone(),
    };
    scene.background = texture;
    scene.backgroundIntensity = panorama.intensity;
    scene.backgroundRotation.set(0, rotationY, 0);
    return () => {
      scene.background = previous.background;
      scene.backgroundIntensity = previous.intensity;
      scene.backgroundRotation.copy(previous.rotation);
    };
  }, [texture, scene, panorama.intensity, rotationY]);

  return null;
}
