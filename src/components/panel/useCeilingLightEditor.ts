import { useRef, useState } from 'react';

// Mirrors vea-api's src/exhibitions/dto/scene-config.dto.ts's MAX_CEILING_LIGHTS —
// same cross-repo-sync caveat as SOCKET_EVENTS/SUPPORTED_CURRENCIES (no shared
// package between the two repos).
export const MAX_CEILING_LIGHTS = 24;

export interface CeilingLightPoint {
  x: number;
  z: number;
}

interface PlacedLight extends CeilingLightPoint {
  /** Local-only, for React keys/removal — never sent to the backend (see `lights` below). */
  id: number;
}

/**
 * Free-placement state behind CeilingLightEditor.tsx: click an empty point on
 * the floor plan to add a light, click an existing marker to remove it —
 * shared by ExhibitionTemplateForm.tsx (rectangle + custom room shapes) and
 * ExhibitionForm.tsx's ad-hoc "kendi salonumu çizeyim" custom room. Omitted/
 * empty on submit falls back to galleryLayout.ts's auto-generated grid (see
 * buildRoomLayout/buildCustomRoomLayout's ceilingLights param), so a curator
 * who never opens this editor sees no behavior change at all.
 */
export function useCeilingLightEditor(initial?: CeilingLightPoint[]) {
  const [placed, setPlaced] = useState<PlacedLight[]>(
    () => (initial ?? []).map((p, i) => ({ ...p, id: i }))
  );
  const nextId = useRef(placed.length);

  function addLight(x: number, z: number) {
    setPlaced((prev) => {
      if (prev.length >= MAX_CEILING_LIGHTS) return prev;
      return [...prev, { id: nextId.current++, x, z }];
    });
  }

  function removeLight(id: number) {
    setPlaced((prev) => prev.filter((p) => p.id !== id));
  }

  return {
    placed,
    lights: placed.map(({ x, z }): CeilingLightPoint => ({ x, z })),
    canAddMore: placed.length < MAX_CEILING_LIGHTS,
    addLight,
    removeLight,
  };
}

export type CeilingLightEditorState = ReturnType<typeof useCeilingLightEditor>;
