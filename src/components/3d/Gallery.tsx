import { Suspense } from "react";
import GalleryRoom from "./GalleryRoom";
import GalleryLights from "./GalleryLights";
import GalleryArtworks from "./GalleryArtworks";
import GalleryFurniture from "./GalleryFurniture";
import RoomEnvironment from "./RoomEnvironment";
import OutdoorPanorama from "./OutdoorPanorama";
import Balconies from "./Balconies";
import { useExhibition } from "./ExhibitionContext";
import { findOutdoorPanorama } from "./outdoorPanoramas";

/** The exhibition space: architecture, lighting, trim and the hung collection. */
export default function Gallery() {
  const { exhibition, layout } = useExhibition();
  const hasWindows = Boolean(layout.windows?.length);
  const hasBalcony = Boolean(layout.windows?.some((w) => w.balcony));
  return (
    <>
      {/* Own Suspense: the room appears right away, the view outside fills in when its photo has loaded. */}
      {hasWindows && (
        <Suspense fallback={null}>
          <OutdoorPanorama panorama={findOutdoorPanorama(exhibition.outdoor?.panoramaId)} rotationY={exhibition.outdoor?.rotationY} />
        </Suspense>
      )}
      {hasBalcony && (
        <Suspense fallback={null}>
          <Balconies />
        </Suspense>
      )}
      <RoomEnvironment />
      <GalleryRoom />
      <GalleryLights />
      <GalleryArtworks />
      <GalleryFurniture />
    </>
  );
}
