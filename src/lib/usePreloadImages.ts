import { useEffect, useRef, useState } from "react";

// Three.js's own TextureLoader (used by Scene.tsx/Artwork.tsx's `useTexture`) suspends per
// painting independently (see ArtworkErrorBoundary.tsx's doc comment — deliberate, so one
// broken image doesn't freeze/crash the whole gallery). That means paintings pop onto their
// wall one at a time as each one's texture finishes, instead of the room appearing fully
// populated the moment the player can walk around — a real UX issue App.tsx needs a signal
// for outside the 3D canvas. This hook preloads the same image URLs via plain browser
// `Image()` objects (decoupled from three.js's loader/cache entirely, so its timing is
// simple and deterministic) and reports once every one of them has settled — loaded or
// failed, a broken image shouldn't hang the loading screen forever either.
export function usePreloadImages(urls: string[]): boolean {
  const key = urls.join("|");
  const [state, setState] = useState(() => ({ key, ready: urls.length === 0 }));
  const generationRef = useRef(0);

  // Resetting `ready` to false synchronously during render (not only inside the effect
  // below) matters: an effect runs after the browser has already painted this render's
  // output, so if the switch to a new, non-empty `key` only reset `ready` there, the very
  // first paint of the new exhibition would still show the *previous* key's (possibly
  // `true`) ready state — exactly the empty-walls flash this hook exists to prevent. This
  // is React's documented "adjust state during render" pattern: safe because it's guarded
  // by the `key` comparison, so it only fires on an actual change, not every render.
  if (state.key !== key) {
    setState({ key, ready: urls.length === 0 });
  }

  useEffect(() => {
    const generation = ++generationRef.current;
    if (urls.length === 0) return;

    let settledCount = 0;
    const onSettle = () => {
      settledCount += 1;
      // A stale generation's loads finishing after a newer exhibition has already
      // started preloading its own images shouldn't flip this hook back to "ready".
      if (settledCount === urls.length && generationRef.current === generation) {
        setState((s) => (s.key === key ? { ...s, ready: true } : s));
      }
    };

    for (const url of urls) {
      const img = new Image();
      img.onload = onSettle;
      img.onerror = onSettle;
      img.src = url;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return state.ready;
}
