import { useMemo, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { EXHIBITIONS } from '../3d/exhibitions';
import type { GridCell } from '../3d/galleryLayout';
import { CEILING_TEXTURES, FLOOR_TEXTURES, WALL_TEXTURES, type SurfaceTexture } from '../3d/surfaceTextures';
import { useExhibitionMutations, type CustomSceneConfig, type TemplateSceneConfig } from '../../lib/api/domains/exhibitions';
import { useMyOrgArtists } from '../../lib/api/domains/organizations';
import { ApiError } from '../../lib/api/client';
import './ExhibitionForm.css';

const DEFAULT_COLS = 16;
const DEFAULT_ROWS = 12;
const MIN_GRID = 6;
const MAX_GRID = 40;
const CELL_PX = 22;

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

type RoomType = 'template' | 'custom';

function TexturePicker({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: SurfaceTexture[];
  value: string | undefined;
  onChange: (id: string | undefined) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5 text-sm text-brand-800">
      <span>{label}</span>
      <div className="exform-texture-swatches">
        <button
          type="button"
          className={`exform-texture-swatch exform-texture-swatch-none ${value ? '' : 'active'}`}
          onClick={() => onChange(undefined)}
        >
          ✕
        </button>
        {options.map((t) => (
          <button
            type="button"
            key={t.id}
            className={`exform-texture-swatch ${value === t.id ? 'active' : ''}`}
            onClick={() => onChange(t.id)}
            title={t.label}
          >
            <img src={t.thumbnail} alt={t.label} loading="lazy" />
          </button>
        ))}
      </div>
    </div>
  );
}

interface ExhibitionFormProps {
  onDone: () => void;
}

/**
 * Faz 3c: creates an Exhibition on the real backend (POST /exhibitions),
 * not localStorage — the retired ExhibitionBuilder.tsx wrote to
 * customExhibitions.ts, that guest/demo path is gone (see
 * project_frontend_integration_roadmap memory, 2026-08-19 decision:
 * creating an exhibition now requires login + artist profile).
 *
 * Deliberately stops at room shape + metadata — placing artworks on walls
 * (ExhibitionArtwork.positionData) is Faz 3d, a separate screen, since it
 * needs the exhibition to already exist (real wallRunIds come from the same
 * buildCustomRoomLayout call either way, but the artwork-assignment UI
 * operates on an already-created exhibition's own artwork list).
 */
export default function ExhibitionForm({ onDone }: ExhibitionFormProps) {
  const { t } = useTranslation();
  const { create } = useExhibitionMutations();
  const { data: orgArtists } = useMyOrgArtists();
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [maxArtworks, setMaxArtworks] = useState('');
  const [artistProfileId, setArtistProfileId] = useState('');

  // Only artists who've actually created their ArtistProfile can be pinned
  // to an exhibition (Exhibition.artistProfileId references ArtistProfile,
  // not User) — an invited artist who hasn't finished onboarding yet has no
  // id to offer here.
  const eligibleArtists = (orgArtists ?? []).filter((artist) => artist.artistProfile);
  const [roomType, setRoomType] = useState<RoomType>('template');
  const [templateId, setTemplateId] = useState(EXHIBITIONS[0]?.id ?? '');

  const [wallHeight, setWallHeight] = useState(6);
  const [wallColor, setWallColor] = useState('#efe4cf');
  const [floorColor, setFloorColor] = useState('#8a6a45');
  const [ceilingColor, setCeilingColor] = useState('#f7f0e0');
  const [floorTextureId, setFloorTextureId] = useState<string | undefined>(undefined);
  const [wallTextureId, setWallTextureId] = useState<string | undefined>(undefined);
  const [ceilingTextureId, setCeilingTextureId] = useState<string | undefined>(undefined);
  const [gridCols, setGridCols] = useState(DEFAULT_COLS);
  const [gridRows, setGridRows] = useState(DEFAULT_ROWS);
  const [wallCells, setWallCells] = useState<Set<string>>(() => borderWallCells(DEFAULT_COLS, DEFAULT_ROWS));
  const [spawnCell, setSpawnCell] = useState<GridCell | null>(null);
  const [spawnYaw, setSpawnYaw] = useState(0);
  const [pickingSpawn, setPickingSpawn] = useState(false);
  const paintValue = useRef(true);
  const painting = useRef(false);

  // Submitted `cells` are floor cells (buildCustomRoomLayout's contract) —
  // every grid cell that isn't a painted wall.
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

  function handleGridColsChange(value: number) {
    const cols = clampGrid(value);
    setGridCols(cols);
    setWallCells((prev) => new Set([...prev].filter((k) => Number(k.split(',')[0]) < cols)));
  }

  function handleGridRowsChange(value: number) {
    const rows = clampGrid(value);
    setGridRows(rows);
    setWallCells((prev) => new Set([...prev].filter((k) => Number(k.split(',')[1]) < rows)));
  }

  const canSubmitCustom = roomType !== 'custom' || (floorCellList.length > 0 && spawnCell != null);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const sceneConfig: TemplateSceneConfig | CustomSceneConfig =
      roomType === 'template'
        ? { kind: 'template', templateId }
        : {
            kind: 'custom',
            cells: floorCellList,
            wallHeight,
            wallColor,
            floorColor,
            ceilingColor,
            textureIds: { floor: floorTextureId, wall: wallTextureId, ceiling: ceilingTextureId },
            spawn: { x: spawnCell!.x, z: spawnCell!.z, yaw: spawnYaw },
          };

    const payload = {
      title,
      description: description || undefined,
      startDate,
      endDate,
      maxArtworks: maxArtworks ? Number(maxArtworks) : undefined,
      artistProfileId: artistProfileId || undefined,
      sceneConfig,
    };

    const onError = (err: unknown) => setError(err instanceof ApiError ? err.message : t('exhibitionFormError'));
    create.mutate(payload, { onSuccess: onDone, onError });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded-lg bg-brand-50 p-6 shadow-sm">
      <label className="flex flex-col gap-1 text-sm text-brand-800">
        {t('exhibitionFormTitle')}
        <input
          required
          maxLength={200}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="rounded-md border border-brand-300 bg-white px-3 py-2 text-sm text-brand-900 outline-none focus:border-brand-500"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm text-brand-800">
        {t('exhibitionFormDescription')}
        <textarea
          maxLength={5000}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="rounded-md border border-brand-300 bg-white px-3 py-2 text-sm text-brand-900 outline-none focus:border-brand-500"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm text-brand-800">
        {t('exhibitionFormArtist')}
        <select
          value={artistProfileId}
          onChange={(e) => setArtistProfileId(e.target.value)}
          className="rounded-md border border-brand-300 bg-white px-3 py-2 text-sm text-brand-900 outline-none focus:border-brand-500"
        >
          <option value="">{t('exhibitionFormArtistNone')}</option>
          {eligibleArtists.map((artist) => (
            <option key={artist.artistProfile!.id} value={artist.artistProfile!.id}>
              {artist.artistProfile!.displayName}
            </option>
          ))}
        </select>
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-sm text-brand-800">
          {t('exhibitionFormStartDate')}
          <input
            required
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="rounded-md border border-brand-300 bg-white px-3 py-2 text-sm text-brand-900 outline-none focus:border-brand-500"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-brand-800">
          {t('exhibitionFormEndDate')}
          <input
            required
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="rounded-md border border-brand-300 bg-white px-3 py-2 text-sm text-brand-900 outline-none focus:border-brand-500"
          />
        </label>
      </div>

      <label className="flex flex-col gap-1 text-sm text-brand-800">
        {t('exhibitionFormMaxArtworks')}
        <input
          type="number"
          min={1}
          step={1}
          value={maxArtworks}
          onChange={(e) => setMaxArtworks(e.target.value)}
          placeholder={t('exhibitionFormMaxArtworksPlaceholder')}
          className="w-40 rounded-md border border-brand-300 bg-white px-3 py-2 text-sm text-brand-900 outline-none focus:border-brand-500"
        />
      </label>

      <div className="flex flex-col gap-1 text-sm text-brand-800">
        <span>{t('exhibitionFormRoomType')}</span>
        <div className="flex gap-4">
          <label className="flex items-center gap-1.5">
            <input type="radio" checked={roomType === 'template'} onChange={() => setRoomType('template')} />
            {t('exhibitionFormRoomTypeTemplate')}
          </label>
          <label className="flex items-center gap-1.5">
            <input type="radio" checked={roomType === 'custom'} onChange={() => setRoomType('custom')} />
            {t('exhibitionFormRoomTypeCustom')}
          </label>
        </div>
      </div>

      {roomType === 'template' && (
        <label className="flex flex-col gap-1 text-sm text-brand-800">
          {t('exhibitionFormTemplateLabel')}
          <select
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
            className="rounded-md border border-brand-300 bg-white px-3 py-2 text-sm text-brand-900 outline-none focus:border-brand-500"
          >
            {EXHIBITIONS.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.name} — {preset.subtitle}
              </option>
            ))}
          </select>
        </label>
      )}

      {roomType === 'custom' && (
        <div className="flex flex-col gap-3" onMouseUp={() => (painting.current = false)}>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-sm text-brand-800">
              {t('exhibitionFormGridCols')}
              <input
                type="number"
                min={MIN_GRID}
                max={MAX_GRID}
                value={gridCols}
                onChange={(e) => handleGridColsChange(Number(e.target.value))}
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
                onChange={(e) => handleGridRowsChange(Number(e.target.value))}
                className="rounded-md border border-brand-300 bg-white px-3 py-2 text-sm text-brand-900 outline-none focus:border-brand-500"
              />
            </label>
          </div>
          <p className="text-xs text-brand-600">{t('exhibitionFormDrawHint')}</p>

          <label className="flex flex-col gap-1 text-sm text-brand-800">
            {t('exhibitionFormWallHeight')}
            <input
              type="number"
              min={2.5}
              max={20}
              step={0.5}
              value={wallHeight}
              onChange={(e) => setWallHeight(Number(e.target.value) || 6)}
              className="w-32 rounded-md border border-brand-300 bg-white px-3 py-2 text-sm text-brand-900 outline-none focus:border-brand-500"
            />
          </label>

          <div className="grid grid-cols-3 gap-3">
            <label className="flex flex-col gap-1 text-sm text-brand-800">
              {t('exhibitionFormWallColor')}
              <input type="color" value={wallColor} onChange={(e) => setWallColor(e.target.value)} className="h-9 w-full cursor-pointer rounded-md border border-brand-300 bg-white" />
            </label>
            <label className="flex flex-col gap-1 text-sm text-brand-800">
              {t('exhibitionFormFloorColor')}
              <input type="color" value={floorColor} onChange={(e) => setFloorColor(e.target.value)} className="h-9 w-full cursor-pointer rounded-md border border-brand-300 bg-white" />
            </label>
            <label className="flex flex-col gap-1 text-sm text-brand-800">
              {t('exhibitionFormCeilingColor')}
              <input type="color" value={ceilingColor} onChange={(e) => setCeilingColor(e.target.value)} className="h-9 w-full cursor-pointer rounded-md border border-brand-300 bg-white" />
            </label>
          </div>

          <TexturePicker label={t('exhibitionFormWallTexture')} options={WALL_TEXTURES} value={wallTextureId} onChange={setWallTextureId} />
          <TexturePicker label={t('exhibitionFormFloorTexture')} options={FLOOR_TEXTURES} value={floorTextureId} onChange={setFloorTextureId} />
          <TexturePicker label={t('exhibitionFormCeilingTexture')} options={CEILING_TEXTURES} value={ceilingTextureId} onChange={setCeilingTextureId} />

          <div className="flex flex-col gap-2">
            <span className="text-sm text-brand-800">{t('exhibitionFormSpawnLabel')}</span>
            <button
              type="button"
              disabled={floorCellList.length === 0}
              onClick={() => setPickingSpawn((v) => !v)}
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
      )}

      <div className="mt-2 flex gap-2">
        <button
          type="submit"
          disabled={create.isPending || !canSubmitCustom}
          className="rounded-md bg-brand-700 px-3 py-2 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-50"
        >
          {create.isPending ? t('exhibitionFormSaving') : t('exhibitionFormSubmitCreate')}
        </button>
        <button type="button" onClick={onDone} className="rounded-md border border-brand-300 px-3 py-2 text-sm text-brand-700 hover:bg-brand-100">
          {t('exhibitionFormCancel')}
        </button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  );
}
