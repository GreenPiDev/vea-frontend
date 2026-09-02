import type { ApiExhibitionTemplate } from '../../lib/api/domains/exhibitionTemplates';

// A custom (grid-drawn) shape has no single width/depth — show its bounding
// box instead (1 cell = 1 meter, see useRoomGridEditor). Shared by
// ExhibitionTemplateList.tsx's "Oda Boyutu" column and
// ExhibitionTemplateForm.tsx's locked-shape info panel.
export function roomSizeLabel(template: Pick<ApiExhibitionTemplate, 'roomShape'>): string {
  const { roomShape } = template;
  if (roomShape.kind === 'rectangle') return `${roomShape.width}×${roomShape.depth} m`;
  const xs = roomShape.cells.map((c) => c.x);
  const zs = roomShape.cells.map((c) => c.z);
  const width = Math.max(...xs) - Math.min(...xs) + 1;
  const depth = Math.max(...zs) - Math.min(...zs) + 1;
  return `${width}×${depth} m`;
}
