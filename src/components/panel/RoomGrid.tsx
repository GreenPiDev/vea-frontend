import { useTranslation } from 'react-i18next';
import { MAX_GRID, MIN_GRID, type RoomGridEditor } from './useRoomGridEditor';
import './ExhibitionForm.css';

const CELL_PX = 22;

interface RoomGridProps {
  editor: RoomGridEditor;
  wallColor: string;
}

/**
 * Presentational half of the grid-drawing UI shared by ExhibitionForm.tsx's
 * "kendi salonumu çizeyim" room type and ExhibitionTemplateForm.tsx's
 * custom template shape — grid size inputs, paint-to-wall grid, and the
 * spawn point/facing picker. All state/logic lives in useRoomGridEditor.
 */
export default function RoomGrid({ editor, wallColor }: RoomGridProps) {
  const { t } = useTranslation();
  const {
    gridCols,
    gridRows,
    wallCells,
    spawnCell,
    spawnYaw,
    pickingSpawn,
    floorCellList,
    setGridCols,
    setGridRows,
    setSpawnYaw,
    setPickingSpawn,
    handleCellDown,
    handleCellEnter,
    stopPainting,
  } = editor;

  return (
    <div className="flex flex-col gap-3" onMouseUp={stopPainting}>
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-sm text-brand-800">
          {t('exhibitionFormGridCols')}
          <input
            type="number"
            min={MIN_GRID}
            max={MAX_GRID}
            value={gridCols}
            onChange={(e) => setGridCols(Number(e.target.value))}
            className="rounded-md border border-brand-300 bg-white px-3 py-2 text-sm text-brand-900 outline-none focus:border-brand-500"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-brand-800">
          {t('exhibitionFormGridRows')}
          <input
            type="number"
            min={MIN_GRID}
            max={MAX_GRID}
            value={gridRows}
            onChange={(e) => setGridRows(Number(e.target.value))}
            className="rounded-md border border-brand-300 bg-white px-3 py-2 text-sm text-brand-900 outline-none focus:border-brand-500"
          />
        </label>
      </div>
      <p className="text-xs text-brand-600">{t('exhibitionFormDrawHint')}</p>

      <div className="flex flex-col gap-2">
        <span className="text-sm text-brand-800">{t('exhibitionFormSpawnLabel')}</span>
        <button
          type="button"
          disabled={floorCellList.length === 0}
          onClick={() => setPickingSpawn((v: boolean) => !v)}
          className="w-fit rounded-md border border-brand-300 bg-white px-3 py-1.5 text-sm text-brand-800 hover:bg-brand-100 disabled:opacity-50"
        >
          {pickingSpawn ? t('exhibitionFormSpawnPicking') : spawnCell ? t('exhibitionFormSpawnChange') : t('exhibitionFormSpawnPick')}
        </button>
        {spawnCell && (
          <>
            <span className="text-sm text-brand-800">{t('exhibitionFormSpawnDirection')}</span>
            <div className="exform-direction-pad">
              <button type="button" className={spawnYaw === 0 ? 'active' : ''} style={{ gridArea: 'n' }} onClick={() => setSpawnYaw(0)}>▲</button>
              <button type="button" className={spawnYaw === Math.PI / 2 ? 'active' : ''} style={{ gridArea: 'w' }} onClick={() => setSpawnYaw(Math.PI / 2)}>◄</button>
              <button type="button" className={spawnYaw === -Math.PI / 2 ? 'active' : ''} style={{ gridArea: 'e' }} onClick={() => setSpawnYaw(-Math.PI / 2)}>►</button>
              <button type="button" className={spawnYaw === Math.PI ? 'active' : ''} style={{ gridArea: 's' }} onClick={() => setSpawnYaw(Math.PI)}>▼</button>
            </div>
          </>
        )}
      </div>

      <div className="exform-grid" style={{ gridTemplateColumns: `repeat(${gridCols}, ${CELL_PX}px)` }}>
        {Array.from({ length: gridRows }).map((_, z) =>
          Array.from({ length: gridCols }).map((_, x) => {
            const isWall = wallCells.has(`${x},${z}`);
            return (
              <div
                key={`${x},${z}`}
                className={`exform-cell ${pickingSpawn && !isWall ? 'pickable' : ''}`}
                style={isWall ? { background: wallColor } : undefined}
                onMouseDown={() => handleCellDown(x, z)}
                onMouseEnter={() => handleCellEnter(x, z)}
              />
            );
          })
        )}
        {spawnCell && (
          <div
            className="exform-spawn"
            style={{
              left: spawnCell.x * CELL_PX,
              top: spawnCell.z * CELL_PX,
              transform: `rotate(${(-spawnYaw * 180) / Math.PI}deg)`,
            }}
          >
            ▲
          </div>
        )}
      </div>
    </div>
  );
}
