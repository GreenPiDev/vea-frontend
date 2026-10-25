// Mirrors vea-api's src/furniture-assets/ module. organizationId null means
// a platform-provided default (ships with the app, e.g. public/furnitures/
// antique_canape_lod.glb); non-null means that organization's own upload —
// see FurnitureEditor.tsx's "+ Model Yükle" flow. Not a copy of
// components/3d/furniture.ts's FurnitureDef — that's the render-layer shape
// (toFurnitureDef converts one into the other); this is the raw API record.
import { useMutation } from '@tanstack/react-query';
import { Paths } from '../paths';
import { useApiGet, useApiGetList, useApiMutations } from '../factory';
import { postFormData } from '../client';

export interface ApiFurnitureAsset {
  id: string;
  organizationId: string | null;
  name: string;
  modelUrl: string;
  thumbnailUrl: string | null;
  nativeWidth: number;
  nativeDepth: number;
  scale: number;
  createdAt: string;
}

// Public — any visitor viewing a published exhibition that uses an
// organization's template needs to resolve its furniture, not just that
// organization's own admins. Disabled until a real organizationId is known
// (a static EXHIBITIONS preset / custom room never has one, see
// backendAdapter.ts's resolveFurniture callers).
export function useFurnitureAssetsByOrganization(organizationId: string | null) {
  return useApiGetList<ApiFurnitureAsset>(
    `${Paths.FurnitureAssetsByOrganization}/${organizationId}`,
    [Paths.FurnitureAssetsByOrganization, organizationId],
    { enabled: Boolean(organizationId) }
  );
}

// Auth — the curator's own organization's assets + platform defaults
// (same union as useFurnitureAssetsByOrganization, resolved server-side
// from the JWT instead of a path param). Used by ExhibitionTemplateForm.tsx.
export function useMyFurnitureAssets() {
  return useApiGet<ApiFurnitureAsset[]>(Paths.FurnitureAssetsMine, [Paths.FurnitureAssetsMine]);
}

export function useFurnitureAssetMutations() {
  return useApiMutations<ApiFurnitureAsset>(Paths.FurnitureAssets, [Paths.FurnitureAssetsMine], {
    create: { silentToast: true },
    update: { silentToast: true },
    remove: { silentToast: true },
  });
}

// POST /furniture-assets/upload-model (multipart) — returns a url the
// caller submits as CreateFurnitureAssetDto.modelUrl. Silent toast: an
// internal step of FurnitureEditor.tsx's single "upload and use" action,
// same reasoning as useUploadArtworkImage.
export function useUploadFurnitureModel() {
  return useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      return postFormData<{ url: string }>(`${Paths.FurnitureAssets}/upload-model`, formData);
    },
    meta: { silentToast: true },
  });
}

export function useUploadFurnitureThumbnail() {
  return useMutation({
    mutationFn: (file: Blob) => {
      const formData = new FormData();
      formData.append('file', file, 'thumbnail.png');
      return postFormData<{ url: string }>(`${Paths.FurnitureAssets}/upload-thumbnail`, formData);
    },
    meta: { silentToast: true },
  });
}
