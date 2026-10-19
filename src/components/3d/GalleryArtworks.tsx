import { Suspense, useMemo } from "react";
import Artwork from "./Artwork";
import ArtworkFixtures from "./ArtworkFixtures";
import ArtworkLightPool from "./ArtworkLightPool";
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
      {/* Every painting's picture-light fixture, batched into a few shared InstancedMesh pools — see
          ArtworkFixtures.tsx. Rendered once up front rather than per-painting below. */}
      <ArtworkFixtures artworks={artworks} />
      {/* Fixed-size pool of real spotLights, reassigned every frame to the paintings nearest the camera —
          see ArtworkLightPool.tsx's doc comment for why this replaced one real light per artwork. Lives
          outside the per-artwork Suspense/error boundaries below: it doesn't depend on any painting's own
          texture load succeeding. */}
      <ArtworkLightPool artworks={artworks} />
      {artworks.map((data) => (
        <ArtworkErrorBoundary key={data.id} artworkId={data.id}>
          <Suspense fallback={null}>
            <Artwork data={data} />
          </Suspense>
        </ArtworkErrorBoundary>
      ))}
    </>
  );
}
