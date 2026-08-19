import { Suspense, useMemo, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { PerformanceMonitor, Stats } from "@react-three/drei";
import { EffectComposer, Bloom, Vignette } from "@react-three/postprocessing";
import * as THREE from "three";
import Gallery from "./Gallery";
import Player from "./Player";
import { buildRoomLayout } from "./galleryLayout";
import { ExhibitionProvider } from "./ExhibitionContext";
import type { Exhibition } from "./exhibitions";

interface SceneProps {
  exhibition: Exhibition;
  onLockChange?: (locked: boolean) => void;
}

export default function Scene({ exhibition, onLockChange }: SceneProps) {
  // Adaptive resolution: start conservative and only spend extra pixels once
  // the device has proven it can hold frame rate, so mid/low-end GPUs don't
  // pay retina-level render cost by default.
  const [dpr, setDpr] = useState(1);

  const layout = useMemo(
    () =>
      exhibition.customLayout ??
      buildRoomLayout(exhibition.roomSize ?? [10, 10], exhibition.wallHeight),
    [exhibition]
  );

  return (
    <Canvas
      shadows
      dpr={dpr}
      gl={{ antialias: false, toneMapping: THREE.ACESFilmicToneMapping }}
      camera={{ fov: 65, near: 0.1, far: 100, position: layout.playerStart }}
      onCreated={({ gl, scene }) => {
        gl.outputColorSpace = THREE.SRGBColorSpace;
        scene.fog = new THREE.Fog(exhibition.theme.fogColor, 14, 40);
        // Nothing in the gallery moves except the camera, so shadow maps
        // only need to be baked once instead of every frame.
        gl.shadowMap.autoUpdate = false;
        gl.shadowMap.needsUpdate = true;
      }}
    >
      <PerformanceMonitor
        onIncline={() => setDpr(1.5)}
        onDecline={() => setDpr(1)}
      />
      <color attach="background" args={[exhibition.theme.backgroundColor]} />
      <ExhibitionProvider exhibition={exhibition} layout={layout}>
        <Suspense fallback={null}>
          <Gallery />
        </Suspense>
        <Player onLockChange={onLockChange} />
      </ExhibitionProvider>
      <Stats className="fps-stats" />
      <EffectComposer multisampling={0}>
        <Bloom intensity={0.35} luminanceThreshold={0.82} luminanceSmoothing={0.3} mipmapBlur />
        <Vignette eskil={false} offset={0.22} darkness={0.55} />
      </EffectComposer>
    </Canvas>
  );
}
