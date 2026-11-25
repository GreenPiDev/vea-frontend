import { useMemo } from "react";
import type { Artwork } from "./artworks";
import { useExhibition } from "./ExhibitionContext";
import type { Exhibition } from "./exhibitions";
import { pictureLightPlacement, type PictureLightPlacement } from "./pictureLight";

export interface RoomPictureLights {
  /** One lamp per painting, in collection order. */
  lights: PictureLightPlacement[];
  /** Painting id → its lamp's index in `lights`. */
  index: Map<string, number>;
}

// Shared by the wall bake (GalleryRoom) and every painting/label material (Artwork, WallLabel), which mount
// separately — so one cached computation per exhibition + wall height, like useWallLabels.
const cache = new WeakMap<Exhibition, { wallHeight: number; value: RoomPictureLights }>();

/** The current room's picture lamps (pictureLight.ts), always on. */
export function usePictureLights(): RoomPictureLights {
  const { exhibition, layout } = useExhibition();
  return useMemo(() => {
    const hit = cache.get(exhibition);
    if (hit && hit.wallHeight === layout.wallHeight) return hit.value;
    const artworks: Artwork[] = exhibition.artworks ?? [];
    const lights = artworks.map((a) => pictureLightPlacement(a, layout.wallHeight));
    const value = { lights, index: new Map(artworks.map((a, i) => [a.id, i])) };
    cache.set(exhibition, { wallHeight: layout.wallHeight, value });
    return value;
  }, [exhibition, layout.wallHeight]);
}
