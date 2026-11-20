import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { Artwork } from "./3d/artworks";

interface ArtworkThumbnailRailProps {
  artworks: Artwork[];
  /** The painting the visitor is standing at (closest in-range "i" icon) — drawn highlighted. */
  activeId: string | null;
  /** Thumbnail click: teleport in front of that painting. */
  onSelect: (artwork: Artwork) => void;
}

/**
 * Right-edge strip of the room's paintings; clicking one teleports the visitor in front of it (ArtworkGoTo.tsx). Sizes are relative to the app root (not vh), so it also fits the CSS-rotated
 * forced-landscape layout on phones (useForcedLandscape.ts). Collapsible, so it never has to cover the room.
 */
export default function ArtworkThumbnailRail({ artworks, activeId, onSelect }: ArtworkThumbnailRailProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(true);
  if (artworks.length === 0) return null;

  return (
    <nav
      aria-label={t("artworkRailLabel")}
      className="fixed right-3 top-1/2 z-30 flex max-h-[64%] -translate-y-1/2 flex-col items-end gap-2"
    >
      <button
        type="button"
        // Keep keyboard focus off the rail after a click: Space/Enter are the scene's sit/stand keys.
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={t(open ? "artworkRailHide" : "artworkRailShow")}
        title={t(open ? "artworkRailHide" : "artworkRailShow")}
        className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full border border-brand-50/15 bg-brand-950/60 text-brand-50 shadow-md backdrop-blur-md transition-colors hover:bg-brand-900/80"
      >
        <svg viewBox="0 0 24 24" className={`h-4 w-4 transition-transform ${open ? "" : "rotate-180"}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M9 6l6 6-6 6" />
        </svg>
      </button>

      {open && (
        <ul className="flex min-h-0 flex-col gap-2 overflow-y-auto rounded-xl border border-brand-50/15 bg-brand-950/45 p-1.5 shadow-lg backdrop-blur-md [scrollbar-width:none]">
          {artworks.map((artwork) => {
            const active = artwork.id === activeId;
            return (
              <li key={artwork.id} className="shrink-0">
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => onSelect(artwork)}
                  aria-label={t("artworkRailGoTo", { title: artwork.title })}
                  aria-current={active ? "location" : undefined}
                  title={artwork.title}
                  className={`block h-14 w-14 cursor-pointer overflow-hidden rounded-lg border-2 transition-[border-color,transform,opacity] duration-200 hover:scale-105 hover:opacity-100 ${
                    active ? "border-brand-100 opacity-100" : "border-transparent opacity-80"
                  }`}
                >
                  {/* Same URL the scene already preloaded (usePreloadImages) — served from cache, no extra download. */}
                  <img src={artwork.image} alt="" loading="lazy" decoding="async" draggable={false} className="h-full w-full object-cover" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </nav>
  );
}
