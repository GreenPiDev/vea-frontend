import { useMemo, useRef, useState } from 'react';
import type { GridCell } from '../3d/galleryLayout';

export const DEFAULT_GRID_COLS = 16;
export const DEFAULT_GRID_ROWS = 12;
export const MIN_GRID = 6;
export const MAX_GRID = 40;

function clampGrid(v: number): number {
  return Math.min(MAX_GRID, Math.max(MIN_GRID, Math.round(v) || MIN_GRID));
}

// The grid's interior is floor by default — painting a cell marks it as a
// wall instead of marking it as floor (inverted from the old "paint to add
// floor" behavior). The outer ring starts pre-painted so a fresh grid is
// already a closed room; the actual submitted `cells` (floor cells, per
// galleryLayout.ts's buildCustomRoomLayout contract) are derived as the
// complement of this wall set within the current grid bounds.
function borderWallCells(cols: number, rows: number): Set<string> {
  const cells = new Set<string>();
  for (let x = 0; x < cols; x++) {
    for (let z = 0; z < rows; z++) {
      if (x === 0 || x === cols - 1 || z === 0 || z === rows - 1) cells.add(`${x},${z}`);
    }
  }
  return cells;
}

/**
 * Converts a saved {cells, spawn} shape (world-space floor cells, as stored
 * in CustomSceneConfig/ExhibitionTemplate's custom roomShape) back into an
 * editable bordered grid — cells don't necessarily start near (0,0), so
 * everything is shifted by a fixed 1-cell-padding offset to fit a fresh
 * grid. The absolute world position of a room doesn't matter (each
 * exhibition/template is its own standalone scene, see galleryLayout.ts),
 * only the shape's relative geometry — so this offset is safe to apply.
 */
function gridStateFromCells(cells: GridCell[], spawn: { x: number; z: number }) {
  const xs = cells.map((c) => c.x);
  const zs = cells.map((c) => c.z);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minZ = Math.min(...zs);
  const maxZ = Math.max(...zs);
  const offsetX = 1 - minX;
  const offsetZ = 1 - minZ;
  const gridCols = clampGrid(maxX - minX + 3);
  const gridRows = clampGrid(maxZ - minZ + 3);
  const floorSet = new Set(cells.map((c) => `${c.x + offsetX},${c.z + offsetZ}`));
  const wallCells = new Set<string>();
  for (let x = 0; x < gridCols; x++) {
    for (let z = 0; z < gridRows; z++) {
      if (!floorSet.has(`${x},${z}`)) wallCells.add(`${x},${z}`);
    }
  }
  return {
    gridCols,
    gridRows,
    wallCells,
    spawnCell: { x: spawn.x + offsetX, z: spawn.z + offsetZ },
    offsetX,
    offsetZ,
  };
}

export interface RoomGridInitial {
  cells: GridCell[];
  spawn: { x: number; z: number; yaw: number };
}

/**
 * Shared grid-drawing state/logic behind both ExhibitionForm.tsx's "kendi
 * salonumu çizeyim" room type and ExhibitionTemplateForm.tsx's "custom"
 * template shape — same paint-to-wall grid, spawn-point picker and facing.
 * Rendering lives in RoomGrid.tsx; this hook owns only the cell/spawn state
 * and the coordinate math (buildCustomRoomLayout's `cells` contract is
 * floor cells, complement of the painted wall set within grid bounds).
 */
export function useRoomGridEditor(initial?: RoomGridInitial) {
  const seed = useMemo(() => (initial ? gridStateFromCells(initial.cells, initial.spawn) : null), []); // eslint-disable-line react-hooks/exhaustive-deps

  const [gridCols, setGridColsState] = useState(seed?.gridCols ?? DEFAULT_GRID_COLS);
  const [gridRows, setGridRowsState] = useState(seed?.gridRows ?? DEFAULT_GRID_ROWS);
  const [wallCells, setWallCells] = useState<Set<string>>(
    () => seed?.wallCells ?? borderWallCells(DEFAULT_GRID_COLS, DEFAULT_GRID_ROWS)
  );
  const [spawnCell, setSpawnCell] = useState<GridCell | null>(seed?.spawnCell ?? null);
  const [spawnYaw, setSpawnYaw] = useState(initial?.spawn.yaw ?? 0);
  const [pickingSpawn, setPickingSpawn] = useState(false);
  const paintValue = useRef(true);
  const painting = useRef(false);

  const floorCellList: GridCell[] = useMemo(() => {
    const floor: GridCell[] = [];
    for (let x = 0; x < gridCols; x++) {
      for (let z = 0; z < gridRows; z++) {
        if (!wallCells.has(`${x},${z}`)) floor.push({ x, z });
      }
    }
    return floor;
  }, [wallCells, gridCols, gridRows]);

  function toggleCell(x: number, z: number, paintWall: boolean) {
    const key = `${x},${z}`;
    setWallCells((prev) => {
      const has = prev.has(key);
      if (paintWall === has) return prev;
      const next = new Set(prev);
      if (paintWall) next.add(key);
      else next.delete(key);
      if (spawnCell && paintWall && spawnCell.x === x && spawnCell.z === z) setSpawnCell(null);
      return next;
    });
  }

  function handleCellDown(x: number, z: number) {
    if (pickingSpawn) {
      if (!wallCells.has(`${x},${z}`)) {
        setSpawnCell({ x, z });
        setPickingSpawn(false);
      }
      return;
    }
    const key = `${x},${z}`;
    const willPaint = !wallCells.has(key);
    paintValue.current = willPaint;
    painting.current = true;
    toggleCell(x, z, willPaint);
  }

  function handleCellEnter(x: number, z: number) {
    if (!painting.current) return;
    toggleCell(x, z, paintValue.current);
  }

  function stopPainting() {
    painting.current = false;
  }

  function setGridCols(value: number) {
    const cols = clampGrid(value);
    setGridColsState(cols);
    setWallCells((prev) => new Set([...prev].filter((k) => Number(k.split(',')[0]) < cols)));
  }

  function setGridRows(value: number) {
    const rows = clampGrid(value);
    setGridRowsState(rows);
    setWallCells((prev) => new Set([...prev].filter((k) => Number(k.split(',')[1]) < rows)));
  }

  const canSubmit = floorCellList.length > 0 && spawnCell != null;

  return {
    gridCols,
    gridRows,
    wallCells,
    spawnCell,
    spawnYaw,
    pickingSpawn,
    floorCellList,
    canSubmit,
    setGridCols,
    setGridRows,
    setSpawnYaw,
    setPickingSpawn,
    handleCellDown,
    handleCellEnter,
    stopPainting,
  };
}

export type RoomGridEditor = ReturnType<typeof useRoomGridEditor>;
