import { Suspense, useMemo } from "react";
import Artwork, { ArtworkLight } from "./Artwork";
import { ARTWORKS } from "./artworks";
import { useExhibition } from "./ExhibitionContext";

/** All framed, lit, labeled paintings hung in the current exhibition room. */
export default function GalleryArtworks() {
  const { exhibition } = useExhibition();
  const artworks = useMemo(
    () => exhibition.artworks ?? ARTWORKS.filter((a) => a.exhibitionId === exhibition.id),
    [exhibition]
  );

  return (
    <Suspense fallback={null}>
      {artworks.map((data) => (
        <group key={data.id}>
          <Artwork data={data} />
          <ArtworkLight data={data} />
        </group>
      ))}
    </Suspense>
  );
}
