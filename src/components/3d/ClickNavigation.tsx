import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useExhibition } from "./ExhibitionContext";
import { FRAME_BORDER } from "./artworkShadow";
import { applyWallTargetOutline, outlineGeometry, outlineMaterial, setOutlineWallColor, tickOutline } from "./artworkOutline";
import { useWallLabels } from "./useWallLabels";
import {
  LOOK_INERTIA_DECAY,
  LOOK_SAMPLE_WINDOW_MS,
  PITCH_LIMIT,
  clearNavigation,
  startDirectWalk,
  estimateLookVelocity,
  computeArtworkViewpoint,
  pickWallTarget,
  wallBoxes,
  type ArtworkViewpoint,
  type FloorPoint,
  type LookSample,
  type NavigationRequest,
  type WallTarget,
} from "./clickNavigationGeometry";
import { clampZoom, fovForAspect, type CameraZoom } from "./cameraFov";
import { artworkLevel, levelAt, levelNav, pickMarker, startLevelRouteWalk, startViewpointWalk, walkableLevelPoint, type LevelPoint } from "./levels";

/** Floor marker radius (m) — also the click/hover hit radius. */
const MARKER_RADIUS = 0.3;
const MARKER_LIFT = 0.01;
/** Pointer travel (px) past which a press is a look-drag rather than a click. */
const DRAG_THRESHOLD = 6;
/** Mouse-wheel zoom speed: magnification per pixel of wheel delta (exponential, so steps feel even). */
const WHEEL_ZOOM_RATE = 0.0015;

// One flat quad per marker, drawn as a soft ring around a faint disc in the fragment shader.
const MARKER_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  mat4 m = mat4(1.0);
  #ifdef USE_INSTANCING
    m = instanceMatrix;
  #endif
  gl_Position = projectionMatrix * modelViewMatrix * m * vec4(position, 1.0);
}
`;
const MARKER_FRAGMENT = /* glsl */ `
uniform float uOpacity;
uniform float uFill;
varying vec2 vUv;
void main() {
  float r = length(vUv - 0.5) * 2.0;
  float aa = fwidth(r) * 1.5;
  float ring = smoothstep(0.74 - aa, 0.74, r) * (1.0 - smoothstep(0.92 - aa, 0.92, r));
  float fill = 1.0 - smoothstep(0.74 - aa, 0.74, r);
  gl_FragColor = vec4(vec3(0.97, 0.96, 0.93), (ring + fill * uFill) * uOpacity);
}
`;

function markerMaterial(opacity: number, fill: number) {
  return new THREE.ShaderMaterial({
    vertexShader: MARKER_VERTEX,
    fragmentShader: MARKER_FRAGMENT,
    uniforms: { uOpacity: { value: opacity }, uFill: { value: fill } },
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
}

const markerGeometry = new THREE.PlaneGeometry(MARKER_RADIUS * 2, MARKER_RADIUS * 2).rotateX(-Math.PI / 2);
const idleMaterial = markerMaterial(0.6, 0.18);
const hoverMaterial = markerMaterial(1, 0.45);
// "You'll walk here" ring: follows the mouse over open floor, and marks the destination while walking
// (the only feedback on touch, which has no hover). Smaller and lighter than the painting markers so the
// two never read as the same thing.
const previewMaterial = markerMaterial(0.55, 0.08);
const PREVIEW_SCALE = 0.65;


interface ClickNavigationProps {
  navigation: NavigationRequest;
  /** Clicks don't move the visitor while seated (stand up first); dragging to look still works. */
  movementLocked: boolean;
  /** Click/tap on a painting. When set, paintings also get a hover outline + pointer cursor. */
  onArtworkClick?: (artworkId: string) => void;
  /** Click/tap on a painting's wall label (same hover outline + pointer cursor). */
  onLabelClick?: (artworkId: string) => void;
  /** Pinch / wheel magnification, applied to the camera by CameraFov (Scene.tsx). */
  cameraZoom: CameraZoom;
}

/**
 * Click-to-go input + painting floor markers (at each painting's foot; clicking one walks the visitor to
 * the viewing spot further back, see computeArtworkViewpoint). Mounted only in "click" navigation mode (see Scene.tsx).
 * Input is raw pointer events on the canvas with our own floor/marker math (clickNavigation.ts) rather
 * than R3F's per-object raycasting: the scene's walls aren't event targets, so R3F would happily report
 * a floor hit behind a wall.
 */
export default function ClickNavigation({ navigation, movementLocked, onArtworkClick, onLabelClick, cameraZoom }: ClickNavigationProps) {
  const { camera, gl } = useThree();
  const aspect = useThree((s) => s.size.width / Math.max(1, s.size.height));
  const { layout, exhibition } = useExhibition();
  const { artworks, rects: labelRects } = useWallLabels();
  // Walking levels (a mezzanine adds one, levels.ts): each painting is walked to on its own level.
  const nav = useMemo(() => levelNav(layout), [layout]);
  const viewpoints = useMemo(
    // Fitted to the unzoomed view: the standing spot shouldn't depend on a transient pinch.
    () =>
      artworks.map((a) => {
        const level = artworkLevel(nav, a);
        const l = nav.levels[level];
        return computeArtworkViewpoint(a, l.colliders, { verticalFovDeg: fovForAspect(aspect), aspect }, level, l.y);
      }),
    [artworks, nav, aspect]
  );
  const walls = useMemo(() => wallBoxes(layout), [layout]);

  const markersRef = useRef<THREE.InstancedMesh>(null);
  const hoverRef = useRef<THREE.Mesh>(null);
  const cursorRingRef = useRef<THREE.Mesh>(null);
  const outlineRef = useRef<THREE.Mesh>(null);
  const destRingRef = useRef<THREE.Mesh>(null);
  // The floor-click target the destination ring marks; the ring hides once Player clears/replaces it.
  const destTarget = useRef<FloorPoint | null>(null);
  // Height of the floor the destination ring lies on.
  const destY = useRef(0);

  const wallColor = exhibition.theme.wallColor;
  useEffect(() => setOutlineWallColor(wallColor), [wallColor]);

  useFrame(({ clock }, dt) => {
    if (outlineRef.current) tickOutline(outlineRef.current, dt, clock.elapsedTime);
    const ring = destRingRef.current;
    if (!ring) return;
    const walking = destTarget.current !== null && navigation.target === destTarget.current;
    if (!walking) destTarget.current = null;
    ring.visible = walking;
    if (walking) ring.position.y = destY.current + MARKER_LIFT;
  });

  useLayoutEffect(() => {
    const mesh = markersRef.current;
    if (!mesh) return;
    const matrix = new THREE.Matrix4();
    viewpoints.forEach((vp, i) => mesh.setMatrixAt(i, matrix.makeTranslation(vp.marker.x, (vp.floorY ?? 0) + MARKER_LIFT, vp.marker.z)));
    mesh.instanceMatrix.needsUpdate = true;
  }, [viewpoints]);

  // Post-drag fling (rad/s), decayed every frame below. Shared with the DOM listeners, which start and
  // cancel it.
  const inertia = useRef({ yaw: 0, pitch: 0 });

  useFrame((_, delta) => {
    const v = inertia.current;
    if (v.yaw === 0 && v.pitch === 0) return;
    // A marker click (turn toward a painting) takes over the view.
    if (navigation.look) {
      v.yaw = v.pitch = 0;
      return;
    }
    const dt = Math.min(delta, 0.05);
    const pitch = THREE.MathUtils.clamp(camera.rotation.x + v.pitch * dt, -PITCH_LIMIT, PITCH_LIMIT);
    camera.rotation.set(pitch, camera.rotation.y + v.yaw * dt, 0);
    const decay = Math.exp(-LOOK_INERTIA_DECAY * dt);
    v.yaw *= decay;
    v.pitch *= decay;
    if (Math.hypot(v.yaw, v.pitch) < 0.02) v.yaw = v.pitch = 0;
  });

  // Latest values for the long-lived DOM listeners below, without re-binding them on every change.
  const live = useRef({ viewpoints, walls, nav, movementLocked, artworks, labelRects, onArtworkClick, onLabelClick });
  live.current = { viewpoints, walls, nav, movementLocked, artworks, labelRects, onArtworkClick, onLabelClick };

  useEffect(() => {
    const canvas = gl.domElement;
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    let press: { id: number; x: number; y: number; yaw: number; pitch: number; dragging: boolean } | null = null;
    let samples: LookSample[] = [];
    // Every finger/pointer currently down on the canvas (canvas-local position).
    const pointers = new Map<number, { x: number; y: number }>();
    // Two-finger pinch in progress. Once a pinch starts, the gesture stays a pinch until every finger is
    // lifted — the finger left behind must not turn into a look-drag or a walk click.
    let pinch: { startDistance: number; startZoom: number } | null = null;
    let pinchUntilAllUp = false;

    const perspective = camera as THREE.PerspectiveCamera;

    function pinchDistance() {
      const [a, b] = [...pointers.values()];
      return Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
    }

    function aim(e: PointerEvent) {
      // offsetX/Y + client size (not clientX + getBoundingClientRect): canvas-local, untransformed
      // coordinates, so this stays right when the scene root is CSS-rotated (useForcedLandscape.ts).
      ndc.set((e.offsetX / canvas.clientWidth) * 2 - 1, -(e.offsetY / canvas.clientHeight) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      const { origin, direction } = raycaster.ray;
      const { viewpoints, walls, nav, artworks, labelRects, onArtworkClick, onLabelClick } = live.current;
      // A painting or wall label under the pointer wins over everything else — it's on a wall, so there's
      // no floor target behind it anyway.
      const target = pickWallTarget(
        origin,
        direction,
        artworks,
        onLabelClick ? labelRects : null,
        walls,
        onArtworkClick ? FRAME_BORDER : null,
        nav.blockers
      );
      if (target) return { target, marker: null, walkable: null };
      // Markers sit right at the wall's foot, so they're tested against the raw floor hit on their own level
      // (with their own wall/slab line-of-sight check), not the stricter walkable point below.
      const marker = pickMarker(nav, origin, direction, viewpoints, MARKER_RADIUS, walls);
      // Null when pointing at a wall, the ceiling, furniture or the stair — no walking there, no preview ring.
      const walkable = walkableLevelPoint(nav, origin, direction, walls);
      return { target: null, marker, walkable };
    }

    function showOutline(target: WallTarget | null) {
      if (outlineRef.current) applyWallTargetOutline(outlineRef.current, target, live.current.labelRects);
    }

    function showHover(hit: { target: WallTarget | null; marker: ArtworkViewpoint | null; walkable: LevelPoint | null } | null) {
      const target = hit?.target ?? null;
      showOutline(target);
      const marker = hit?.marker ?? null;
      const hover = hoverRef.current;
      if (hover) {
        hover.visible = marker !== null;
        if (marker) hover.position.set(marker.marker.x, (marker.floorY ?? 0) + MARKER_LIFT + 0.001, marker.marker.z);
      }
      const ring = cursorRingRef.current;
      if (ring) {
        const point = marker ? null : (hit?.walkable ?? null);
        ring.visible = point !== null;
        if (point) ring.position.set(point.x, live.current.nav.levels[point.level].y + MARKER_LIFT, point.z);
      }
      canvas.style.cursor = marker || target ? "pointer" : "";
    }

    function onPointerDown(e: PointerEvent) {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      pointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
      canvas.setPointerCapture(e.pointerId);
      if (pointers.size === 2) {
        // Second finger down: whatever the first one was doing becomes a pinch.
        press = null;
        samples = [];
        inertia.current.yaw = inertia.current.pitch = 0;
        pinch = { startDistance: pinchDistance(), startZoom: cameraZoom.zoom };
        pinchUntilAllUp = true;
        return;
      }
      if (press || pinchUntilAllUp) return;
      // Touching the screen catches a coasting view, like stopping a scroll fling.
      inertia.current.yaw = inertia.current.pitch = 0;
      samples = [];
      press = { id: e.pointerId, x: e.offsetX, y: e.offsetY, yaw: camera.rotation.y, pitch: camera.rotation.x, dragging: false };
    }

    function onPointerMove(e: PointerEvent) {
      if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
      if (pinch) {
        if (pointers.size >= 2) cameraZoom.zoom = clampZoom((pinch.startZoom * pinchDistance()) / pinch.startDistance);
        return;
      }
      if (!press) {
        if (e.pointerType === "mouse") showHover(aim(e));
        return;
      }
      if (e.pointerId !== press.id) return;
      const dx = e.offsetX - press.x;
      const dy = e.offsetY - press.y;
      if (!press.dragging && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      if (!press.dragging) {
        press.dragging = true;
        navigation.look = null;
        // A routed walk keeps going, but the visitor now owns the view.
        navigation.arrivalLook = null;
        navigation.faceHeading = false;
        showHover(null);
        canvas.style.cursor = "grabbing";
      }
      // "Grab the world": the scene follows the pointer, scaled so a full-height drag turns by one FOV.
      // Uses the live (possibly zoomed) FOV, so zoomed in, the same swipe turns the view less.
      const radiansPerPixel = THREE.MathUtils.degToRad(perspective.fov) / canvas.clientHeight;
      const pitch = THREE.MathUtils.clamp(press.pitch + dy * radiansPerPixel, -PITCH_LIMIT, PITCH_LIMIT);
      camera.rotation.set(pitch, press.yaw + dx * radiansPerPixel, 0);
      samples.push({ t: e.timeStamp, yaw: camera.rotation.y, pitch });
      while (samples.length > 2 && e.timeStamp - samples[0].t > LOOK_SAMPLE_WINDOW_MS) samples.shift();
    }

    function releasePointer(e: PointerEvent) {
      pointers.delete(e.pointerId);
      if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
      if (pointers.size < 2) pinch = null;
      if (pointers.size === 0) pinchUntilAllUp = false;
    }

    function onPointerUp(e: PointerEvent) {
      releasePointer(e);
      if (!press || e.pointerId !== press.id) return;
      const wasDrag = press.dragging;
      press = null;
      canvas.style.cursor = "";
      if (wasDrag) {
        inertia.current = estimateLookVelocity(samples, e.timeStamp);
        return;
      }

      const hit = aim(e);
      if (hit.target) {
        // Opening the info card / label works seated too — it doesn't move the visitor.
        showHover(null);
        if (hit.target.kind === "label") live.current.onLabelClick?.(hit.target.artwork.id);
        else live.current.onArtworkClick?.(hit.target.artwork.id);
        return;
      }
      if (live.current.movementLocked) return;
      const { nav } = live.current;
      const here: LevelPoint = { x: camera.position.x, z: camera.position.z, level: levelAt(nav, camera.position.x, camera.position.z, camera.position.y) };
      if (hit.marker) {
        // Around furniture/partitions in the way (routePlanner.ts) — and up/down the stair when the work is on
        // the other level (levels.ts) — facing the work on arrival.
        startViewpointWalk(navigation, nav, here, hit.marker);
      } else if (hit.walkable) {
        const dest = { x: hit.walkable.x, z: hit.walkable.z };
        // Same level: the plain straight walk. The other level: routed over the stair.
        if (hit.walkable.level === here.level) startDirectWalk(navigation, dest);
        else startLevelRouteWalk(navigation, nav, here, hit.walkable, null);
        destTarget.current = navigation.target;
        destY.current = nav.levels[hit.walkable.level].y;
        destRingRef.current?.position.set(dest.x, destY.current + MARKER_LIFT, dest.z);
      }
      // Wall / ceiling / furniture click: nothing happens.
      if (e.pointerType === "mouse") showHover(hit);
    }

    function onPointerCancel(e: PointerEvent) {
      releasePointer(e);
      if (press && e.pointerId === press.id) press = null;
      canvas.style.cursor = "";
    }

    function onPointerLeave() {
      if (!press) showHover(null);
    }

    // Desktop counterpart of the pinch.
    function onWheel(e: WheelEvent) {
      e.preventDefault();
      // Firefox reports wheel steps in lines (deltaMode 1) rather than pixels.
      const pixels = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      cameraZoom.zoom = clampZoom(cameraZoom.zoom * Math.exp(-pixels * WHEEL_ZOOM_RATE));
    }

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerCancel);
    canvas.addEventListener("pointerleave", onPointerLeave);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      canvas.removeEventListener("wheel", onWheel);
      // Walk mode (pointer-lock look) has no zoom control — hand it the normal view back.
      cameraZoom.zoom = 1;
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerCancel);
      canvas.removeEventListener("pointerleave", onPointerLeave);
      canvas.style.cursor = "";
      clearNavigation(navigation);
    };
  }, [camera, gl, navigation, cameraZoom]);

  return (
    <>
      {viewpoints.length > 0 && (
        <instancedMesh
          // Instance capacity is fixed at construction, so a different count needs a fresh mesh.
          key={viewpoints.length}
          ref={markersRef}
          args={[markerGeometry, idleMaterial, viewpoints.length]}
          frustumCulled={false}
          raycast={() => null}
        />
      )}
      <mesh ref={hoverRef} geometry={markerGeometry} material={hoverMaterial} visible={false} scale={1.12} raycast={() => null} />
      <mesh ref={outlineRef} geometry={outlineGeometry} material={outlineMaterial} visible={false} raycast={() => null} />
      <mesh ref={cursorRingRef} geometry={markerGeometry} material={previewMaterial} visible={false} scale={PREVIEW_SCALE} raycast={() => null} />
      <mesh ref={destRingRef} geometry={markerGeometry} material={previewMaterial} visible={false} scale={PREVIEW_SCALE} raycast={() => null} />
    </>
  );
}
