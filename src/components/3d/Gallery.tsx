import GalleryRoom from "./GalleryRoom";
import GalleryLights from "./GalleryLights";
import GalleryArtworks from "./GalleryArtworks";
import Baseboards from "./Baseboards";

/** The exhibition space: architecture, lighting, trim and the hung collection. */
export default function Gallery() {
  return (
    <>
      <GalleryRoom />
      <GalleryLights />
      <Baseboards />
      <GalleryArtworks />
    </>
  );
}
