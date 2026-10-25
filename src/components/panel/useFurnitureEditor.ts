import { useRef, useState } from 'react';
import type { FurniturePlacement } from '../../lib/api/domains/exhibitionTemplates';

// Mirrors vea-api's src/exhibitions/dto/scene-config.dto.ts's
// MAX_FURNITURE_PER_ROOM — same cross-repo-sync caveat as MAX_CEILING_LIGHTS.
export const MAX_FURNITURE_PER_ROOM = 20;

interface PlacedFurniture extends FurniturePlacement {
  /** Local-only, for React keys/removal/selection — never sent to the backend (see `items` below). */
  id: number;
}

/**
 * Free-placement + rotate state behind FurnitureEditor.tsx — pick a catalog
 * item, click an empty point on the floor plan to place it (default facing
 * north, rotationY 0), drag its rotate handle to set which way it faces,
 * click its body to remove it. Shared shape with useCeilingLightEditor.ts
 * (same placed/remove/max-reached pattern), plus a `selectedCatalogId` for
 * which furniture type the next floor click places, and a `draggingId` for
 * the in-progress rotate-handle drag.
 */
export function useFurnitureEditor(initial?: FurniturePlacement[]) {
  const [placed, setPlaced] = useState<PlacedFurniture[]>(
    () => (initial ?? []).map((p, i) => ({ ...p, id: i }))
  );
  // No static default to seed from anymore — the catalog is fetched async
  // (see FurnitureEditor.tsx's useMyFurnitureAssets), so it starts empty and
  // FurnitureEditor.tsx picks the first loaded asset once it arrives (if
  // nothing is selected yet).
  const [selectedCatalogId, setSelectedCatalogId] = useState('');
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const nextId = useRef(placed.length);

  function addFurniture(x: number, z: number) {
    setPlaced((prev) => {
      if (prev.length >= MAX_FURNITURE_PER_ROOM || !selectedCatalogId) return prev;
      return [...prev, { id: nextId.current++, furnitureId: selectedCatalogId, x, z, rotationY: 0 }];
    });
  }

  function removeFurniture(id: number) {
    setPlaced((prev) => prev.filter((p) => p.id !== id));
  }

  function setRotation(id: number, rotationY: number) {
    setPlaced((prev) => prev.map((p) => (p.id === id ? { ...p, rotationY } : p)));
  }

  return {
    placed,
    items: placed.map(({ id: _id, ...rest }): FurniturePlacement => rest),
    canAddMore: placed.length < MAX_FURNITURE_PER_ROOM,
    selectedCatalogId,
    setSelectedCatalogId,
    draggingId,
    setDraggingId,
    addFurniture,
    removeFurniture,
    setRotation,
  };
}

export type FurnitureEditorState = ReturnType<typeof useFurnitureEditor>;
