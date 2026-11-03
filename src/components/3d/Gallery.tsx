import GalleryRoom from "./GalleryRoom";
import GalleryLights from "./GalleryLights";
import GalleryArtworks from "./GalleryArtworks";
import GalleryFurniture from "./GalleryFurniture";
import RoomEnvironment from "./RoomEnvironment";

/** The exhibition space: architecture, lighting, trim and the hung collection. */
export default function Gallery() {
  return (
    <>
      <RoomEnvironment />
      <GalleryRoom />
      <GalleryLights />
      <GalleryArtworks />
      <GalleryFurniture />
    </>
  );
}
