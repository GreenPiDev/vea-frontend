import { useEffect, useMemo, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import type { Artwork } from "./3d/artworks";
import type { IconPositionStore } from "../lib/iconPositionStore";

interface ArtworkIconOverlayProps {
  store: IconPositionStore;
  artworks: Artwork[];
  hidden: boolean;
  onOpen: (artwork: Artwork) => void;
  /** The closest in-range painting (its icon is emphasised) — reported only when it changes. */
  onNearestChange: (artworkId: string | null) => void;
}

/**
 * The paintings' "i" icons over the 3D view (positions from ArtworkIconProjector via `store`). Its own component
 * so a position update re-renders only these buttons, not App and the Canvas tree under it.
 */
export default function ArtworkIconOverlay({ store, artworks, hidden, onOpen, onNearestChange }: ArtworkIconOverlayProps) {
  const { t } = useTranslation();
  const positions = useSyncExternalStore(store.subscribe, store.get);
  const byId = useMemo(() => new Map(artworks.map((a) => [a.id, a])), [artworks]);

  // The closest in-range painting's "i" icon is drawn emphasized. (Paintings open by clicking/tapping the
  // painting or its "i" — there's deliberately no keyboard shortcut for it; Enter/Space is the sit/stand key.)
  const nearestId = useMemo(() => {
    let nearest: { id: string; distanceSq: number } | null = null;
    for (const pos of positions) {
      if (!pos.visible || !byId.has(pos.id)) continue;
      if (nearest && pos.distanceSq >= nearest.distanceSq) continue;
      nearest = { id: pos.id, distanceSq: pos.distanceSq };
    }
    return nearest?.id ?? null;
  }, [positions, byId]);
  useEffect(() => onNearestChange(nearestId), [nearestId, onNearestChange]);

  if (hidden) return null;

  // Rendered for every artwork (not just the currently-visible ones) so appearing/disappearing is a CSS
  // opacity/scale transition rather than a mount/unmount pop.
  return (
    <>
      {positions.map((p) => {
        const artwork = byId.get(p.id);
        if (!artwork) return null;
        const isNearest = nearestId === artwork.id;
        return (
          <button
            key={p.id}
            onClick={() => onOpen(artwork)}
            aria-label={t("artworkInfoIconLabel", { title: artwork.title })}
            tabIndex={p.visible ? 0 : -1}
            style={{ left: p.x, top: p.y }}
            // hover: variants only apply on devices with a real hover (Tailwind v4), so touch is unaffected.
            className={`group absolute z-40 flex -translate-x-1/2 -translate-y-1/2 cursor-pointer flex-col items-center gap-2 transition-[opacity,transform] duration-200 ease-out ${
              !p.visible
                ? "pointer-events-none scale-90 opacity-0"
                : isNearest
                  ? "scale-110 opacity-100 hover:scale-125"
                  : "scale-100 opacity-70 hover:scale-125 hover:opacity-100"
            }`}
          >
            <span
              className={`flex h-9 w-9 items-center justify-center rounded-full border shadow-md backdrop-blur-sm transition-[color,background-color,border-color,box-shadow] duration-200 group-hover:border-brand-100 group-hover:bg-brand-900/90 group-hover:shadow-lg ${
                isNearest
                  ? "artwork-icon-ring border-brand-200/80 bg-brand-950/70"
                  : "border-brand-200/30 bg-brand-950/50"
              }`}
            >
              <span className="font-serif text-[15px] italic leading-none text-brand-50">i</span>
            </span>
          </button>
        );
      })}
    </>
  );
}
