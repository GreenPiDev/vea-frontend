import { useEffect, useRef, useState } from 'react';
import {
  IDENTITY,
  ZOOM_DOUBLE_TAP,
  clampPan,
  screenToLocalDelta,
  zoomAbout,
  type ZoomPanState,
} from '../../lib/zoomPan';

/** Max finger travel (px) and press duration (ms) that still count as a tap. */
const TAP_SLOP = 8;
const TAP_MS = 300;
/** Second tap within this window (ms) = double tap. */
const DOUBLE_TAP_MS = 280;
const WHEEL_ZOOM_RATE = 0.002;

interface ZoomableImageProps {
  src: string;
  alt: string;
  className?: string;
  /** Single tap/click (not part of a double tap or a gesture). Delayed by the double-tap window when set. */
  onTap?: () => void;
}

/**
 * An image you can pinch-zoom (touch), wheel-zoom (mouse), drag around when zoomed, and double-tap to
 * toggle a 2.5× zoom. The browser's own pinch-zoom would scale the whole page (and, in the rotated mobile
 * exhibition view, fight our layout), so gestures are handled here with `touch-action: none`.
 */
export default function ZoomableImage({ src, alt, className = '', onTap }: ZoomableImageProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<ZoomPanState>(IDENTITY);
  const [animate, setAnimate] = useState(false);
  const viewRef = useRef(view);
  viewRef.current = view;
  const onTapRef = useRef(onTap);
  onTapRef.current = onTap;

  // Image changed (another artwork) → start unzoomed.
  useEffect(() => setView(IDENTITY), [src]);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;

    const pointers = new Map<number, { x: number; y: number }>();
    let gesture:
      | { kind: 'pan'; startX: number; startY: number; start: ZoomPanState; downAt: number; moved: boolean }
      | { kind: 'pinch'; startDist: number; startMid: { x: number; y: number }; start: ZoomPanState }
      | null = null;
    let lastTap: { t: number; x: number; y: number } | null = null;
    let tapTimer: ReturnType<typeof setTimeout> | undefined;

    const rotated = () => frame.closest('.force-landscape') !== null;
    const size = () => ({ w: frame.clientWidth, h: frame.clientHeight });
    /** Screen point → local, centre-relative coordinates of the frame. */
    function toLocal(clientX: number, clientY: number) {
      const r = frame!.getBoundingClientRect();
      return screenToLocalDelta(clientX - (r.left + r.width / 2), clientY - (r.top + r.height / 2), rotated());
    }
    function commit(next: ZoomPanState, withTransition = false) {
      const { w, h } = size();
      const clamped = next.scale <= 1.01 ? IDENTITY : clampPan(next, w, h);
      setAnimate(withTransition);
      setView(clamped);
    }
    function pinchMetrics() {
      const [a, b] = [...pointers.values()];
      return {
        dist: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
        mid: toLocal((a.x + b.x) / 2, (a.y + b.y) / 2),
      };
    }
    function startPan(x: number, y: number, t: number, moved = false) {
      gesture = { kind: 'pan', startX: x, startY: y, start: viewRef.current, downAt: t, moved };
    }

    function onDown(e: PointerEvent) {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.stopPropagation();
      frame!.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 1) startPan(e.clientX, e.clientY, e.timeStamp);
      else if (pointers.size === 2) {
        const { dist, mid } = pinchMetrics();
        gesture = { kind: 'pinch', startDist: dist, startMid: mid, start: viewRef.current };
      }
    }

    function onMove(e: PointerEvent) {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (gesture?.kind === 'pinch' && pointers.size >= 2) {
        const { dist, mid } = pinchMetrics();
        const zoomed = zoomAbout(gesture.start, gesture.start.scale * (dist / gesture.startDist), gesture.startMid.x, gesture.startMid.y);
        commit({ ...zoomed, x: zoomed.x + mid.x - gesture.startMid.x, y: zoomed.y + mid.y - gesture.startMid.y });
      } else if (gesture?.kind === 'pan') {
        const dx = e.clientX - gesture.startX;
        const dy = e.clientY - gesture.startY;
        if (!gesture.moved && Math.hypot(dx, dy) < TAP_SLOP) return;
        gesture.moved = true;
        if (gesture.start.scale <= 1) return;
        const d = screenToLocalDelta(dx, dy, rotated());
        commit({ ...gesture.start, x: gesture.start.x + d.x, y: gesture.start.y + d.y });
      }
    }

    function onUp(e: PointerEvent) {
      if (!pointers.has(e.pointerId)) return;
      pointers.delete(e.pointerId);
      if (frame!.hasPointerCapture(e.pointerId)) frame!.releasePointerCapture(e.pointerId);

      if (gesture?.kind === 'pinch') {
        // One finger left: carry on as a pan from here (it can never become a tap).
        const rest = [...pointers.values()][0];
        if (rest) startPan(rest.x, rest.y, e.timeStamp, true);
        else gesture = null;
        return;
      }
      if (gesture?.kind !== 'pan' || pointers.size > 0) return;
      const wasTap = !gesture.moved && e.timeStamp - gesture.downAt < TAP_MS;
      gesture = null;
      if (!wasTap) return;

      const isDouble = lastTap && e.timeStamp - lastTap.t < DOUBLE_TAP_MS && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 30;
      if (isDouble) {
        clearTimeout(tapTimer);
        lastTap = null;
        const p = toLocal(e.clientX, e.clientY);
        commit(viewRef.current.scale > 1 ? IDENTITY : zoomAbout(viewRef.current, ZOOM_DOUBLE_TAP, p.x, p.y), true);
        return;
      }
      lastTap = { t: e.timeStamp, x: e.clientX, y: e.clientY };
      if (onTapRef.current) {
        clearTimeout(tapTimer);
        tapTimer = setTimeout(() => onTapRef.current?.(), DOUBLE_TAP_MS);
      }
    }

    function onCancel(e: PointerEvent) {
      pointers.delete(e.pointerId);
      if (pointers.size === 0) gesture = null;
    }

    function onWheel(e: WheelEvent) {
      e.preventDefault();
      const pixels = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      const p = toLocal(e.clientX, e.clientY);
      commit(zoomAbout(viewRef.current, viewRef.current.scale * Math.exp(-pixels * WHEEL_ZOOM_RATE), p.x, p.y));
    }

    frame.addEventListener('pointerdown', onDown);
    frame.addEventListener('pointermove', onMove);
    frame.addEventListener('pointerup', onUp);
    frame.addEventListener('pointercancel', onCancel);
    frame.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      clearTimeout(tapTimer);
      frame.removeEventListener('pointerdown', onDown);
      frame.removeEventListener('pointermove', onMove);
      frame.removeEventListener('pointerup', onUp);
      frame.removeEventListener('pointercancel', onCancel);
      frame.removeEventListener('wheel', onWheel);
    };
  }, []);

  const zoomed = view.scale > 1;

  return (
    <div
      ref={frameRef}
      // Swallow the click the pointer sequence produces — taps are handled above (with double-tap detection).
      onClick={(e) => e.stopPropagation()}
      className={`relative touch-none select-none overflow-hidden ${zoomed ? 'cursor-grab' : onTap ? 'cursor-zoom-in' : ''} ${className}`}
    >
      <img
        src={src}
        alt={alt}
        draggable={false}
        style={{
          transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
          transition: animate ? 'transform 200ms ease-out' : 'none',
        }}
        className="pointer-events-none h-full w-full object-contain"
      />
    </div>
  );
}
