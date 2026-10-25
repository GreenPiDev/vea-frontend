// Backend-driven counterpart to components/3d/exhibitions.ts's static
// EXHIBITIONS registry (4 hardcoded room presets) — an org's GALLERY_ADMINs
// can create/update their own named room presets here, picked from
// ExhibitionForm.tsx's template selector alongside the static ones. See
// vea-api's src/exhibition-templates/ module.
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Paths } from '../paths';
import { post } from '../client';
import { useApiGet, useApiGetList, useApiMutations } from '../factory';
import type { ExhibitionTheme } from '../../../components/3d/exhibitions';

// Mirrors vea-api's exhibition-templates/dto/room-shape.dto.ts — same
// discriminated-union spirit as ApiSceneConfig (exhibitions.ts), reusing the
// exact same "custom" grid contract (cells/spawn) as CustomSceneConfig so a
// template's custom shape is drawn with the same grid UI (useRoomGridEditor).
// A single curator-placed ceiling fixture position, room-local meters — same
// coordinate space as cells/spawn. Shared shape with ApiSceneConfig's
// CustomSceneConfig (exhibitions.ts) for the same field.
export interface CeilingLightPoint {
  x: number;
  z: number;
}

// Mirrors vea-api's exhibitions/dto/scene-config.dto.ts's FurniturePlacementDto.
// `furnitureId` picks a model from 3d/furniture.ts's FURNITURE_CATALOG — not
// validated against that list on the backend, same frontend-owned-data
// approach as a "template" sceneConfig's templateId.
export interface FurniturePlacement {
  furnitureId: string;
  x: number;
  z: number;
  /** Yaw in radians, same convention as spawn.yaw: 0 = north (-Z), PI = south (+Z), PI/2 = west (-X), -PI/2 = east (+X). */
  rotationY: number;
}

export interface RectangleRoomShape {
  kind: 'rectangle';
  width: number;
  depth: number;
  /** Curator-placed ceiling fixtures (CeilingLightEditor.tsx). Omitted/empty falls back to galleryLayout.ts's auto-generated grid. */
  ceilingLights?: CeilingLightPoint[];
  /** Curator-placed furniture (FurnitureEditor.tsx). Omitted/empty means no furniture in the room. */
  furniture?: FurniturePlacement[];
}

export interface CustomRoomShape {
  kind: 'custom';
  cells: { x: number; z: number }[];
  spawn: { x: number; z: number; yaw: number };
  /** Curator-placed ceiling fixtures (CeilingLightEditor.tsx). Omitted/empty falls back to galleryLayout.ts's auto-generated grid. */
  ceilingLights?: CeilingLightPoint[];
  /** Curator-placed furniture (FurnitureEditor.tsx). Omitted/empty means no furniture in the room. */
  furniture?: FurniturePlacement[];
}

export type TemplateRoomShape = RectangleRoomShape | CustomRoomShape;

export interface ApiExhibitionTemplate {
  id: string;
  organizationId: string;
  name: string;
  subtitle?: string | null;
  roomShape: TemplateRoomShape;
  wallHeight: number;
  wallColor: string;
  floorColor: string;
  ceilingColor: string;
  floorTextureId?: string | null;
  wallTextureId?: string | null;
  ceilingTextureId?: string | null;
  /** Full derived theme (vea-api's exhibition-templates/theme.ts), ready to render exactly like a static EXHIBITIONS[].theme entry. */
  theme: ExhibitionTheme;
  createdAt: string;
  /** Only present on GET /exhibition-templates/mine — how many exhibitions currently use this template, for ExhibitionTemplateList.tsx's usage column. */
  _count?: { exhibitions: number };
}

export function useMyExhibitionTemplates() {
  return useApiGetList<ApiExhibitionTemplate>(Paths.ExhibitionTemplatesMine);
}

export function useOwnExhibitionTemplate(id: string) {
  return useApiGet<ApiExhibitionTemplate>(
    `${Paths.ExhibitionTemplatesMine}/${id}`,
    [Paths.ExhibitionTemplatesMine, id],
    { enabled: Boolean(id) },
  );
}

export function useExhibitionTemplateMutations() {
  return useApiMutations<ApiExhibitionTemplate>(Paths.ExhibitionTemplates, [Paths.ExhibitionTemplatesMine], {
    create: { successKey: 'toastTemplateCreateSuccess', errorKey: 'toastTemplateCreateError' },
    update: { successKey: 'toastTemplateUpdateSuccess', errorKey: 'toastTemplateUpdateError' },
    remove: { successKey: 'toastTemplateDeleteSuccess', errorKey: 'toastTemplateDeleteError' },
  });
}

// Server-side clone (vea-api's ExhibitionTemplatesService.duplicate) rather
// than re-POSTing the fields read from the list query — avoids re-deriving
// theme/roomShape client-side and keeps the clone byte-for-byte except for
// the "(Kopya)" name suffix the backend appends. Doesn't fit
// useApiMutations' create/update/remove shape (no request body, custom
// `:id/duplicate` path), so it's a standalone mutation like useCreateOffer.
export function useDuplicateExhibitionTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      post<ApiExhibitionTemplate>({ path: `${Paths.ExhibitionTemplates}/${id}/duplicate` }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [Paths.ExhibitionTemplatesMine] }),
    meta: { successKey: 'toastTemplateDuplicateSuccess', errorKey: 'toastTemplateDuplicateError' },
  });
}
