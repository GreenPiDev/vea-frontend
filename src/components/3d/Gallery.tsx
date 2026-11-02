import GalleryRoom from "./GalleryRoom";
import GalleryLights from "./GalleryLights";
import GalleryArtworks from "./GalleryArtworks";
import GalleryFurniture from "./GalleryFurniture";
import Baseboards from "./Baseboards";
import RoomEnvironment from "./RoomEnvironment";

/** The exhibition space: architecture, lighting, trim and the hung collection. */
export default function Gallery() {
  return (
    <>
      <RoomEnvironment />
      <GalleryRoom />
      <GalleryLights />
      <Baseboards />
      <GalleryArtworks />
      <GalleryFurniture />
    </>
  );
}
