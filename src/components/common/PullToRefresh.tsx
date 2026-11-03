import { useEffect, useRef, useState } from 'react';
import { isTouchPrimaryDevice } from '../../lib/navigationMode';
import { PULL_TRIGGER, canStartPull, pullOffset, pullProgress } from '../../lib/pullToRefresh';

/**
 * App-wide pull-to-refresh for touch devices. The browser's own gesture never fires here: html/body/#root
 * are `overflow: hidden` and every screen scrolls inside its own container (see index.css), while
 * browsers only offer pull-to-refresh on the document's scroll. So: a touch that starts with nothing under
 * the finger scrolled down, dragged down far enough, reloads the page.
 *
 * Skipped inside the 3D exhibition (`.app-root`, where dragging looks around) and on gesture surfaces
 * (`.touch-none`, e.g. the zoomable artwork image). Passive listeners only — scrolling is never blocked.
 */
export default function PullToRefresh() {
  const [enabled] = useState(isTouchPrimaryDevice);
  const [distance, setDistance] = useState(0);
  const [reloading, setReloading] = useState(false);
  const start = useRef<{ x: number; y: number } | null>(null);
  const distanceRef = useRef(0);

  useEffect(() => {
    if (!enabled) return;

    function scrollAncestors(target: Element) {
      const list = [];
      for (let el: Element | null = target; el && el !== document.documentElement; el = el.parentElement) {
        const style = getComputedStyle(el);
        list.push({
          scrollTop: el.scrollTop,
          scrollHeight: el.scrollHeight,
          clientHeight: el.clientHeight,
          overflowY: style.overflowY,
        });
      }
      return list;
    }

    function reset() {
      start.current = null;
      distanceRef.current = 0;
      setDistance(0);
    }

    function onStart(e: TouchEvent) {
      start.current = null;
      if (e.touches.length !== 1) return;
      const target = e.target as Element | null;
      if (!target || target.closest('.app-root, .touch-none')) return;
      if (!canStartPull(scrollAncestors(target))) return;
      start.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }

    function onMove(e: TouchEvent) {
      if (!start.current || e.touches.length !== 1) return;
      const dy = e.touches[0].clientY - start.current.y;
      const dx = e.touches[0].clientX - start.current.x;
      // Sideways swipe (carousel, horizontal scroll) or an upward scroll: not a pull.
      if (dy <= 0 || Math.abs(dx) > dy) {
        if (distanceRef.current > 0) reset();
        else start.current = dy < 0 || Math.abs(dx) > 20 ? null : start.current;
        return;
      }
      distanceRef.current = dy;
      setDistance(dy);
    }

    function onEnd() {
      if (start.current && distanceRef.current >= PULL_TRIGGER) {
        setReloading(true);
        window.location.reload();
        return;
      }
      reset();
    }

    window.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchmove', onMove, { passive: true });
    window.addEventListener('touchend', onEnd);
    window.addEventListener('touchcancel', reset);
    return () => {
      window.removeEventListener('touchstart', onStart);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
      window.removeEventListener('touchcancel', reset);
    };
  }, [enabled]);

  if (!enabled) return null;
  const offset = reloading ? 60 : pullOffset(distance);
  if (offset <= 0) return null;
  const progress = reloading ? 1 : pullProgress(distance);
  const armed = progress >= 1;

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed left-1/2 top-0 z-[10000] -translate-x-1/2"
      style={{ transform: `translate(-50%, ${offset - 44}px)` }}
    >
      <div
        className={`flex h-10 w-10 items-center justify-center rounded-full border shadow-lg transition-colors ${
          armed ? 'border-brand-700 bg-brand-700 text-brand-50' : 'border-brand-200 bg-brand-50 text-brand-700'
        }`}
      >
        <svg
          viewBox="0 0 24 24"
          className={`h-5 w-5 ${reloading ? 'animate-spin' : ''}`}
          style={reloading ? undefined : { transform: `rotate(${progress * 300}deg)`, opacity: 0.35 + progress * 0.65 }}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M20 12a8 8 0 1 1-2.34-5.66" />
          <path d="M20 4v5h-5" />
        </svg>
      </div>
    </div>
  );
}
