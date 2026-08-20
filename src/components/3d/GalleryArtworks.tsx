import { Suspense, useMemo } from "react";
import Artwork, { ArtworkLight } from "./Artwork";
import { ARTWORKS } from "./artworks";
import { useExhibition } from "./ExhibitionContext";
import { ArtworkErrorBoundary } from "./ArtworkErrorBoundary";

/** All framed, lit, labeled paintings hung in the current exhibition room. */
export default function GalleryArtworks() {
  const { exhibition } = useExhibition();
  const artworks = useMemo(
    () => exhibition.artworks ?? ARTWORKS.filter((a) => a.exhibitionId === exhibition.id),
    [exhibition]
  );

  return (
    <>
      {artworks.map((data) => (
        <ArtworkErrorBoundary key={data.id} artworkId={data.id}>
          <Suspense fallback={null}>
            <group>
              <Artwork data={data} />
              <ArtworkLight data={data} />
            </group>
          </Suspense>
        </ArtworkErrorBoundary>
      ))}
    </>
  );
}
