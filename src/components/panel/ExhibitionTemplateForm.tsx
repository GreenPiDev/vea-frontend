import { useMemo, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { CEILING_TEXTURES, FLOOR_TEXTURES, WALL_TEXTURES } from '../3d/surfaceTextures';
import { rectangleBlueprint, customBlueprint } from '../3d/backendAdapter';
import {
  useExhibitionTemplateMutations,
  type ApiExhibitionTemplate,
} from '../../lib/api/domains/exhibitionTemplates';
import { useMyFurnitureAssets } from '../../lib/api/domains/furnitureAssets';
import { ApiError } from '../../lib/api/client';
import TexturePicker from './TexturePicker';
import RoomGrid from './RoomGrid';
import CeilingLightEditor from './CeilingLightEditor';
import FurnitureEditor from './FurnitureEditor';
import { useRoomGridEditor } from './useRoomGridEditor';
import { useCeilingLightEditor } from './useCeilingLightEditor';
import { useFurnitureEditor } from './useFurnitureEditor';
import { roomSizeLabel } from './roomShapeLabel';
import './ExhibitionForm.css';

type ShapeKind = 'rectangle' | 'custom';

const RECT_WIDTH_RANGE = { min: 4, max: 60 };
const RECT_DEPTH_RANGE = { min: 4, max: 60 };
const WALL_HEIGHT_RANGE = { min: 2.5, max: 20 };

function parseDimension(raw: string, range: { min: number; max: number }) {
  const value = Number(raw);
  const isEmpty = raw.trim() === '';
  const isValid = !isEmpty && Number.isFinite(value) && value >= range.min && value <= range.max;
  return { value, isEmpty, isValid };
}

interface ExhibitionTemplateFormProps {
  editing?: ApiExhibitionTemplate;
  onDone: () => void;
}

/**
 * Create/edit a backend-driven room preset (Organization-scoped). Room
 * shape is either a fixed rectangle (width×depth) or a hand-drawn grid —
 * the exact same paint-to-wall grid editor as ExhibitionForm.tsx's "kendi
 * salonumu çizeyim" custom exhibition room (see useRoomGridEditor/RoomGrid,
 * shared between the two forms). See vea-api's exhibition-templates module
 * for how the full ExhibitionTheme is derived server-side from the 3 picked
 * colors, regardless of shape.
 */
export default function ExhibitionTemplateForm({ editing, onDone }: ExhibitionTemplateFormProps) {
  const { t } = useTranslation();
  const { create, update } = useExhibitionTemplateMutations();
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState(editing?.name ?? '');
  const [subtitle, setSubtitle] = useState(editing?.subtitle ?? '');
  const [shapeKind, setShapeKind] = useState<ShapeKind>(editing?.roomShape.kind ?? 'rectangle');
  const [rectWidth, setRectWidth] = useState(
    String(editing?.roomShape.kind === 'rectangle' ? editing.roomShape.width : 14)
  );
  const [rectDepth, setRectDepth] = useState(
    String(editing?.roomShape.kind === 'rectangle' ? editing.roomShape.depth : 10)
  );
  const [wallHeight, setWallHeight] = useState(String(editing?.wallHeight ?? 6));
  const [wallColor, setWallColor] = useState(editing?.wallColor ?? '#efe4cf');
  const [floorColor, setFloorColor] = useState(editing?.floorColor ?? '#8a6a45');
  const [ceilingColor, setCeilingColor] = useState(editing?.ceilingColor ?? '#f7f0e0');
  const [floorTextureId, setFloorTextureId] = useState<string | undefined>(editing?.floorTextureId ?? undefined);
  const [wallTextureId, setWallTextureId] = useState<string | undefined>(editing?.wallTextureId ?? undefined);
  const [ceilingTextureId, setCeilingTextureId] = useState<string | undefined>(editing?.ceilingTextureId ?? undefined);
  const grid = useRoomGridEditor(
    editing?.roomShape.kind === 'custom'
      ? { cells: editing.roomShape.cells, spawn: editing.roomShape.spawn }
      : undefined
  );
  const ceilingLights = useCeilingLightEditor(editing?.roomShape.ceilingLights);
  const furniture = useFurnitureEditor(editing?.roomShape.furniture);
  const { data: furnitureAssets } = useMyFurnitureAssets();

  // A template already used by at least one Exhibition has its room shape
  // locked (server-enforced too, see vea-api's ExhibitionTemplatesService.
  // update) — changing rectangle dimensions or a custom grid's cells/spawn
  // would invalidate the wallRunId every already-placed artwork's
  // positionData points at, silently dropping them from the scene. Color/
  // texture/wallHeight stay editable regardless (cosmetic only).
  const usageCount = editing?._count?.exhibitions ?? 0;
  const isShapeLocked = usageCount > 0;

  const rectWidthCheck = parseDimension(rectWidth, RECT_WIDTH_RANGE);
  const rectDepthCheck = parseDimension(rectDepth, RECT_DEPTH_RANGE);
  const wallHeightCheck = parseDimension(wallHeight, WALL_HEIGHT_RANGE);

  const isPending = create.isPending || update.isPending;
  const isRectangleValid = isShapeLocked || shapeKind !== 'rectangle' || (rectWidthCheck.isValid && rectDepthCheck.isValid);
  const canSubmit = wallHeightCheck.isValid && isRectangleValid && (isShapeLocked || shapeKind === 'rectangle' || grid.canSubmit);

  // Live floor-plan preview of the in-progress (not-yet-saved) room shape, for
  // CeilingLightEditor.tsx below — built from this form's own local state via
  // backendAdapter.ts's exported rectangleBlueprint/customBlueprint, not from a
  // round-tripped API response. Shape-locked templates use the original stored
  // shape (same values handleSubmit echoes back unchanged).
  const lockedShapeForPreview = isShapeLocked ? editing!.roomShape : null;
  const liveBlueprint = useMemo(() => {
    if (shapeKind === 'rectangle') {
      if (lockedShapeForPreview?.kind === 'rectangle') {
        return rectangleBlueprint([lockedShapeForPreview.width, lockedShapeForPreview.depth]);
      }
      if (!rectWidthCheck.isValid || !rectDepthCheck.isValid) return null;
      return rectangleBlueprint([rectWidthCheck.value, rectDepthCheck.value]);
    }
    if (lockedShapeForPreview?.kind === 'custom') {
      return customBlueprint(lockedShapeForPreview.cells, 1, lockedShapeForPreview.spawn);
    }
    if (!grid.canSubmit) return null;
    return customBlueprint(grid.floorCellList, 1, { x: grid.spawnCell!.x, z: grid.spawnCell!.z, yaw: grid.spawnYaw });
  }, [
    shapeKind,
    lockedShapeForPreview,
    rectWidthCheck.isValid,
    rectWidthCheck.value,
    rectDepthCheck.isValid,
    rectDepthCheck.value,
    grid.canSubmit,
    grid.floorCellList,
    grid.spawnCell,
    grid.spawnYaw,
  ]);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    // Always sent now, even shape-locked — ceilingLights is editable regardless
    // of the lock (see vea-api's shapeChanged), echoing the original
    // width/depth or cells/spawn unchanged in that case so the server's
    // shape-diff check sees no real shape change, only ceilingLights.
    const lockedShape = isShapeLocked ? editing!.roomShape : null;
    const roomShape =
      shapeKind === 'rectangle'
        ? {
            kind: 'rectangle' as const,
            width: lockedShape?.kind === 'rectangle' ? lockedShape.width : rectWidthCheck.value,
            depth: lockedShape?.kind === 'rectangle' ? lockedShape.depth : rectDepthCheck.value,
            ceilingLights: ceilingLights.lights,
            furniture: furniture.items,
          }
        : {
            kind: 'custom' as const,
            cells: lockedShape?.kind === 'custom' ? lockedShape.cells : grid.floorCellList,
            spawn:
              lockedShape?.kind === 'custom'
                ? lockedShape.spawn
                : { x: grid.spawnCell!.x, z: grid.spawnCell!.z, yaw: grid.spawnYaw },
            ceilingLights: ceilingLights.lights,
            furniture: furniture.items,
          };

    const payload = {
      name,
      subtitle: subtitle || undefined,
      roomShape,
      wallHeight: wallHeightCheck.value,
      wallColor,
      floorColor,
      ceilingColor,
      textureIds: { floor: floorTextureId, wall: wallTextureId, ceiling: ceilingTextureId },
    };

    const onError = (err: unknown) => setError(err instanceof ApiError ? err.message : t('exhibitionTemplateFormError'));
    if (editing) {
      update.mutate({ id: editing.id, updates: payload }, { onSuccess: onDone, onError });
    } else {
      create.mutate(payload, { onSuccess: onDone, onError });
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded-lg bg-brand-50 p-6 shadow-sm">
      <label className="flex flex-col gap-1 text-sm text-brand-800">
        {t('exhibitionTemplateFormName')}
        <input
          required
          maxLength={200}
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="rounded-md border border-brand-300 bg-white px-3 py-2 text-sm text-brand-900 outline-none focus:border-brand-500"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm text-brand-800">
        {t('exhibitionTemplateFormSubtitle')}
        <input
          maxLength={300}
          value={subtitle}
          onChange={(e) => setSubtitle(e.target.value)}
          className="rounded-md border border-brand-300 bg-white px-3 py-2 text-sm text-brand-900 outline-none focus:border-brand-500"
        />
      </label>

      {isShapeLocked ? (
        <p className="rounded-md border border-brand-300 bg-brand-100 px-3 py-2 text-sm text-brand-800">
          {t('exhibitionTemplateShapeLocked', { count: usageCount, size: roomSizeLabel(editing!) })}
        </p>
      ) : (
        <div className="flex flex-col gap-1 text-sm text-brand-800">
          <span>{t('exhibitionFormRoomType')}</span>
          <div className="flex gap-4">
            <label className="flex items-center gap-1.5">
              <input type="radio" checked={shapeKind === 'rectangle'} onChange={() => setShapeKind('rectangle')} />
              {t('exhibitionTemplateFormShapeRectangle')}
            </label>
            <label className="flex items-center gap-1.5">
              <input type="radio" checked={shapeKind === 'custom'} onChange={() => setShapeKind('custom')} />
              {t('exhibitionFormRoomTypeCustom')}
            </label>
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-3">
        {!isShapeLocked && shapeKind === 'rectangle' && (
          <>
            <label className="flex flex-col gap-1 text-sm text-brand-800">
              {t('exhibitionTemplateFormRoomWidth')}
              <input
                type="number"
                min={RECT_WIDTH_RANGE.min}
                max={RECT_WIDTH_RANGE.max}
                step={0.5}
                value={rectWidth}
                onChange={(e) => setRectWidth(e.target.value)}
                className="rounded-md border border-brand-300 bg-white px-3 py-2 text-sm text-brand-900 outline-none focus:border-brand-500"
              />
              {rectWidthCheck.isEmpty ? (
                <span className="text-xs text-red-600">{t('exhibitionTemplateFormEmptyError')}</span>
              ) : !rectWidthCheck.isValid ? (
                <span className="text-xs text-red-600">
                  {t('exhibitionTemplateFormRangeError', RECT_WIDTH_RANGE)}
                </span>
              ) : (
                <span className="text-xs text-brand-500">{t('exhibitionTemplateFormRangeHint', RECT_WIDTH_RANGE)}</span>
              )}
            </label>
            <label className="flex flex-col gap-1 text-sm text-brand-800">
              {t('exhibitionTemplateFormRoomDepth')}
              <input
                type="number"
                min={RECT_DEPTH_RANGE.min}
                max={RECT_DEPTH_RANGE.max}
                step={0.5}
                value={rectDepth}
                onChange={(e) => setRectDepth(e.target.value)}
                className="rounded-md border border-brand-300 bg-white px-3 py-2 text-sm text-brand-900 outline-none focus:border-brand-500"
              />
              {rectDepthCheck.isEmpty ? (
                <span className="text-xs text-red-600">{t('exhibitionTemplateFormEmptyError')}</span>
              ) : !rectDepthCheck.isValid ? (
                <span className="text-xs text-red-600">
                  {t('exhibitionTemplateFormRangeError', RECT_DEPTH_RANGE)}
                </span>
              ) : (
                <span className="text-xs text-brand-500">{t('exhibitionTemplateFormRangeHint', RECT_DEPTH_RANGE)}</span>
              )}
            </label>
          </>
        )}
        <label className="flex flex-col gap-1 text-sm text-brand-800">
          {t('exhibitionFormWallHeight')}
          <input
            type="number"
            min={WALL_HEIGHT_RANGE.min}
            max={WALL_HEIGHT_RANGE.max}
            step={0.5}
            value={wallHeight}
            onChange={(e) => setWallHeight(e.target.value)}
            className="rounded-md border border-brand-300 bg-white px-3 py-2 text-sm text-brand-900 outline-none focus:border-brand-500"
          />
          {wallHeightCheck.isEmpty ? (
            <span className="text-xs text-red-600">{t('exhibitionTemplateFormEmptyError')}</span>
          ) : !wallHeightCheck.isValid ? (
            <span className="text-xs text-red-600">
              {t('exhibitionTemplateFormRangeError', WALL_HEIGHT_RANGE)}
            </span>
          ) : (
            <span className="text-xs text-brand-500">{t('exhibitionTemplateFormRangeHint', WALL_HEIGHT_RANGE)}</span>
          )}
        </label>
      </div>

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

      {!isShapeLocked && shapeKind === 'custom' && <RoomGrid editor={grid} wallColor={wallColor} />}

      {/* Not gated by isShapeLocked — ceiling fixtures/furniture are purely cosmetic and never
          derive a wallRunId, so they stay editable even on a template already used by an exhibition. */}
      <CeilingLightEditor blueprint={liveBlueprint} editor={ceilingLights} />
      <FurnitureEditor blueprint={liveBlueprint} editor={furniture} assets={furnitureAssets ?? []} />

      <div className="mt-2 flex gap-2">
        <button
          type="submit"
          disabled={isPending || !canSubmit}
          className="rounded-md bg-brand-700 px-3 py-2 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-50"
        >
          {isPending ? t('exhibitionFormSaving') : editing ? t('exhibitionTemplateFormSubmitUpdate') : t('exhibitionTemplateFormSubmitCreate')}
        </button>
        <button type="button" onClick={onDone} className="rounded-md border border-brand-300 px-3 py-2 text-sm text-brand-700 hover:bg-brand-100">
          {t('exhibitionFormCancel')}
        </button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  );
}
