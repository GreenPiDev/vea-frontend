import { Suspense, useMemo } from "react";
import type { Exhibition } from "./exhibitions";
import { useExhibition } from "./ExhibitionContext";
import { FurnitureErrorBoundary } from "./FurnitureErrorBoundary";
import FurnitureInstances, { type FurniturePlacementTransform } from "./FurnitureInstances";

interface FurnitureGroup {
  modelUrl: string;
  scale?: number;
  placements: FurniturePlacementTransform[];
}

/** Groups the current exhibition's placed furniture by model — every piece of the same model shares one FurnitureInstances (and so one small set of InstancedMesh draw calls), regardless of how many copies a curator placed. */
function groupByModel(furniture: NonNullable<Exhibition["furniture"]>): FurnitureGroup[] {
  const groups = new Map<string, FurnitureGroup>();
  for (const piece of furniture) {
    const group = groups.get(piece.modelUrl);
    const placement = { position: piece.position, rotationY: piece.rotationY };
    if (group) group.placements.push(placement);
    else groups.set(piece.modelUrl, { modelUrl: piece.modelUrl, scale: piece.scale, placements: [placement] });
  }
  return [...groups.values()];
}

/** Curator-placed furniture for the current exhibition (template-only for now, see backendAdapter.ts). One FurnitureInstances per distinct model, each wrapped in its own error boundary + Suspense (same per-unit isolation reasoning as GalleryArtworks.tsx) — a missing/corrupt .glb for one model only drops that model's pieces, not the whole room. */
export default function GalleryFurniture() {
  const { exhibition } = useExhibition();
  const groups = useMemo(() => groupByModel(exhibition.furniture ?? []), [exhibition.furniture]);

  return (
    <>
      {groups.map((group) => (
        <FurnitureErrorBoundary key={group.modelUrl} modelUrl={group.modelUrl}>
          <Suspense fallback={null}>
            <FurnitureInstances modelUrl={group.modelUrl} scale={group.scale} placements={group.placements} />
          </Suspense>
        </FurnitureErrorBoundary>
      ))}
    </>
  );
}
