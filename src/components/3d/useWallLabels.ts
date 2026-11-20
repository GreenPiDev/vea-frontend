import { useMemo } from "react";
import i18n from "../../lib/i18n";
import { ARTWORKS, type Artwork } from "./artworks";
import { useExhibition } from "./ExhibitionContext";
import type { Exhibition } from "./exhibitions";
import type { RoomLayout, WallSegment } from "./galleryLayout";
import type { LabelRect } from "./clickNavigationGeometry";
import { computeWallLabels, labelRect, measureLabelText, type WallLabel } from "./wallLabelLayout";

// The labels are typeset/placed once per exhibition + room and shared by everything that needs them: the
// render (GalleryArtworks) and both click pickers (ClickNavigation, WalkArtworkPicker). Those mount
// separately and each derive their own artworks array, so the cache is keyed by the exhibition object.
interface Entry {
  walls: WallSegment[];
  windows: RoomLayout["windows"];
  labels: Map<string, WallLabel>;
  rects: Map<string, LabelRect>;
}
const cache = new WeakMap<Exhibition, Entry>();

/** This exhibition's artworks and their wall labels (wallLabelLayout.ts). */
export function useWallLabels(): { artworks: Artwork[]; labels: Map<string, WallLabel>; rects: Map<string, LabelRect> } {
  const { exhibition, layout } = useExhibition();
  return useMemo(() => {
    const artworks = exhibition.artworks ?? ARTWORKS.filter((a) => a.exhibitionId === exhibition.id);
    const hit = cache.get(exhibition);
    if (hit && hit.walls === layout.walls && hit.windows === layout.windows) return { artworks, labels: hit.labels, rects: hit.rects };
    const labels = computeWallLabels(artworks, layout.walls, i18n.language, measureLabelText, layout.windows);
    const rects = new Map([...labels].map(([id, l]) => [id, labelRect(l)]));
    cache.set(exhibition, { walls: layout.walls, windows: layout.windows, labels, rects });
    return { artworks, labels, rects };
  }, [exhibition, layout.walls, layout.windows]);
}
