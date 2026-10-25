import GalleryRoom from "./GalleryRoom";
import GalleryLights from "./GalleryLights";
import GalleryArtworks from "./GalleryArtworks";
import GalleryFurniture from "./GalleryFurniture";
import Baseboards from "./Baseboards";

/** The exhibition space: architecture, lighting, trim and the hung collection. */
export default function Gallery() {
  return (
    <>
      <GalleryRoom />
      <GalleryLights />
      <Baseboards />
      <GalleryArtworks />
      <GalleryFurniture />
    </>
  );
}
