// Render-layer shape for a placeable furniture piece — produced from a
// fetched ApiFurnitureAsset (see lib/api/domains/furnitureAssets.ts) via
// toFurnitureDef below. Used by galleryLayout.ts (collider footprint),
// backendAdapter.ts (resolving a template's roomShape.furniture) and
// FurnitureInstances.tsx (render). The catalog itself is no longer a static
// array here — it's a real FurnitureAsset row (platform default or an
// organization's own upload), fetched per-page via useMyFurnitureAssets()/
// useFurnitureAssetsByOrganization().
import type { ApiFurnitureAsset } from '../../lib/api/domains/furnitureAssets';

export interface FurnitureDef {
  id: string;
  label: string;
  modelUrl: string;
  /** Real-world footprint in meters, room-local axes (x = width, z = depth) at rotationY 0 — used for both the 2D top-down editor icon and the 3D collider (see galleryLayout.ts's PlacedFurnitureInput). Already includes the asset's own `scale` (nativeWidth/nativeDepth are measured at scale 1). */
  footprint: { width: number; depth: number };
  /** Uniform scale applied to the loaded GLTF scene. */
  scale?: number;
  /** The catalog item's captured preview image (captureModelThumbnail.ts), if any — a 3/4-angle render, not a true top-down shot, so a floor-plan consumer (ExhibitionBlueprint.tsx) that draws it still needs its own direction marker rather than relying on the image's own rotation to convey facing. */
  thumbnailUrl?: string | null;
  /** Whether a visitor can sit in this model (armchair/bench/etc.) — see seating.ts. */
  isSeating: boolean;
}

export function toFurnitureDef(asset: ApiFurnitureAsset): FurnitureDef {
  return {
    id: asset.id,
    label: asset.name,
    modelUrl: asset.modelUrl,
    footprint: { width: asset.nativeWidth * asset.scale, depth: asset.nativeDepth * asset.scale },
    scale: asset.scale,
    thumbnailUrl: asset.thumbnailUrl,
    isSeating: asset.isSeating,
  };
}
