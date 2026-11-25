import { Suspense } from "react";
import Artwork from "./Artwork";
import ArtworkFixtures from "./ArtworkFixtures";
import ArtworkWallShadows from "./ArtworkWallShadows";
import { ArtworkErrorBoundary } from "./ArtworkErrorBoundary";
import { useWallLabels } from "./useWallLabels";

/** All framed, lit, labeled paintings hung in the current exhibition room. */
export default function GalleryArtworks() {
  // The collection and its wall labels, typeset and placed together (shared with the click pickers).
  const { artworks, labels } = useWallLabels();

  return (
    <>
      {/* Every painting's picture-light fixture, batched into a few shared InstancedMesh pools — see
          ArtworkFixtures.tsx. Rendered once up front rather than per-painting below. */}
      <ArtworkFixtures artworks={artworks} />
      {/* No light component: every picture lamp is always on — its wall wash is baked with the room
          (GalleryRoom, pictureLightBake.ts), the painting and label light themselves (pictureLightMaterial.ts). */}
      {/* Every painting's soft shadow on its wall, one instanced draw call — see artworkShadow.ts. Placed from
          data alone, like the fixtures above: if a painting's image fails to load (ArtworkErrorBoundary drops
          it), its shadow stays behind together with its fixture. */}
      <ArtworkWallShadows artworks={artworks} />
      {artworks.map((data) => (
        <ArtworkErrorBoundary key={data.id} artworkId={data.id}>
          <Suspense fallback={null}>
            <Artwork data={data} label={labels.get(data.id)} />
          </Suspense>
        </ArtworkErrorBoundary>
      ))}
    </>
  );
}
