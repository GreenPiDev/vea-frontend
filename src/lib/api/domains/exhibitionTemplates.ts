// Backend-driven counterpart to components/3d/exhibitions.ts's static
// EXHIBITIONS registry (4 hardcoded room presets) — an org's GALLERY_ADMINs
// can create/update their own named room presets here, picked from
// ExhibitionForm.tsx's template selector alongside the static ones. See
// vea-api's src/exhibition-templates/ module.
import { Paths } from '../paths';
import { useApiGet, useApiGetList, useApiMutations } from '../factory';
import type { ExhibitionTheme } from '../../../components/3d/exhibitions';

// Mirrors vea-api's exhibition-templates/dto/room-shape.dto.ts — same
// discriminated-union spirit as ApiSceneConfig (exhibitions.ts), reusing the
// exact same "custom" grid contract (cells/spawn) as CustomSceneConfig so a
// template's custom shape is drawn with the same grid UI (useRoomGridEditor).
export interface RectangleRoomShape {
  kind: 'rectangle';
  width: number;
  depth: number;
}

export interface CustomRoomShape {
  kind: 'custom';
  cells: { x: number; z: number }[];
  spawn: { x: number; z: number; yaw: number };
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
  return useApiMutations<ApiExhibitionTemplate>(Paths.ExhibitionTemplates, [Paths.ExhibitionTemplatesMine]);
}
