import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import * as THREE from 'three';
import type { BlueprintLayout } from '../3d/backendAdapter';
import { toFurnitureDef } from '../3d/furniture';
import {
  useFurnitureAssetMutations,
  useUploadFurnitureModel,
  useUploadFurnitureThumbnail,
  type ApiFurnitureAsset,
} from '../../lib/api/domains/furnitureAssets';
import { loadGltfFromFile } from '../../lib/loadGltfBoundingBox';
import { captureModelThumbnail } from '../../lib/captureModelThumbnail';
import { ApiError } from '../../lib/api/client';
import type { FurnitureEditorState } from './useFurnitureEditor';

const MARGIN = 1;
const WALL_STROKE = 0.15;
const HANDLE_RADIUS = 0.18;
const HANDLE_OFFSET = 0.5;
// Below this many screen pixels of pointer travel, a body pointerdown→up is
// treated as a plain click (remove) rather than a drag (move) — matches the
// kind of small, accidental-jitter threshold a mouse/touchpad click always
// has, so a precise click-to-remove still works without fighting the drag.
const DRAG_CLICK_THRESHOLD_PX = 4;
const ZOOM_MIN = 1;
const ZOOM_MAX = 6;
const ZOOM_STEP_FACTOR = 1.5;

interface FurnitureEditorProps {
  /** Same live, not-yet-saved room shape CeilingLightEditor.tsx renders — see backendAdapter.ts's rectangleBlueprint/customBlueprint. Null while unresolvable. */
  blueprint: BlueprintLayout | null;
  editor: FurnitureEditorState;
  /** The curator's placeable catalog (platform defaults + their own organization's uploads) — see useMyFurnitureAssets(). */
  assets: ApiFurnitureAsset[];
}

// Measured from a just-picked file, before it's actually uploaded — the
// "+ Model Yükle" flow's in-progress state (name still editable, nothing
// sent to the server yet).
interface PendingUpload {
  file: File;
  scene: THREE.Object3D;
  box: THREE.Box3;
  nativeWidth: number;
  nativeDepth: number;
  name: string;
  isSeating: boolean;
}

/**
 * Top-down floor-plan editor for curator-placed furniture (see
 * useFurnitureEditor.ts) — pick a catalog item (clicking the same item again
 * deselects it), click an empty point on the floor to place the selected
 * item (default facing north), drag its rotate handle to set which way it
 * faces, drag its body to move it, or click its body without dragging to
 * remove it. Rendering shares
 * CeilingLightEditor.tsx's SVG/coordinate-transform approach (small enough
 * to duplicate rather than share, same precedent that component's own doc
 * comment sets). Also hosts the "+ Model Yükle" inline upload flow — a
 * curator's own .glb immediately becomes a selectable catalog entry,
 * persisted for every future template (not just this session).
 */
export default function FurnitureEditor({ blueprint, editor, assets }: FurnitureEditorProps) {
  const { t } = useTranslation();
  const svgRef = useRef<SVGSVGElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Tracks an in-progress body drag (move) across pointerdown→move→up —
  // a ref, not state, since it's only read inside pointer handlers and
  // shouldn't trigger a re-render on every pixel of movement (setPosition
  // via editor already does that). `moved` flips true once travel passes
  // DRAG_CLICK_THRESHOLD_PX, which is what decides move-vs-click on pointerup.
  const bodyDragRef = useRef<{ id: number; startClientX: number; startClientY: number; moved: boolean } | null>(null);
  const [zoom, setZoom] = useState(1);
  // View-center offset (room-local meters), only meaningful once zoomed in —
  // lets a zoomed-in view be dragged around to reach corners of a large
  // room instead of being stuck centered. Tracked the same
  // pointerdown→move→up + click-vs-drag-threshold way as a furniture body
  // drag (see backgroundDragRef below), since dragging the empty floor and
  // clicking the empty floor to place a new piece share the same surface.
  const [pan, setPan] = useState({ x: 0, z: 0 });
  const backgroundDragRef = useRef<{
    startClientX: number;
    startClientY: number;
    startPanX: number;
    startPanZ: number;
    moved: boolean;
  } | null>(null);

  const catalog = useMemo(() => new Map(assets.map((a) => [a.id, toFurnitureDef(a)])), [assets]);

  // Auto-pick the first loaded asset once the catalog arrives, but only
  // that one time — the curator hasn't picked one yet (the hook itself has
  // no static default to seed from anymore, the catalog is fetched, not a
  // module-scope constant). A ref, not just "selectedCatalogId is empty",
  // because an empty selection is also the deliberate "deselected, I'm
  // dragging/rotating an existing piece instead of placing a new one" state
  // (see the catalog button's toggle onClick below) — re-firing this on
  // every deselect would immediately re-select and defeat that.
  const didAutoSelect = useRef(false);
  useEffect(() => {
    if (!didAutoSelect.current && !editor.selectedCatalogId && assets.length > 0) {
      didAutoSelect.current = true;
      editor.setSelectedCatalogId(assets[0].id);
    }
  }, [assets, editor]);

  const [pending, setPending] = useState<PendingUpload | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const uploadModel = useUploadFurnitureModel();
  const uploadThumbnail = useUploadFurnitureThumbnail();
  const { create, update, remove } = useFurnitureAssetMutations();
  const isUploading = uploadModel.isPending || uploadThumbnail.isPending || create.isPending;
  // Which catalog item is showing its inline "delete this?" prompt — only
  // one at a time, same pattern as ArtistOfferTable.tsx's decision confirm.
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  function handleConfirmDelete(id: string) {
    remove.mutate(id);
    if (editor.selectedCatalogId === id) editor.setSelectedCatalogId('');
    setConfirmDeleteId(null);
  }

  const selectedAsset = assets.find((a) => a.id === editor.selectedCatalogId) ?? null;
  const [scaleInput, setScaleInput] = useState('1');
  const [scaleError, setScaleError] = useState<string | null>(null);
  // Resets the input to the selected asset's saved scale whenever the
  // selection changes (switching catalog items, or a save round-trip
  // refetching the list) — not a plain useState default, since
  // selectedAsset only exists once `assets` has loaded.
  useEffect(() => {
    setScaleInput(String(selectedAsset?.scale ?? 1));
    setScaleError(null);
  }, [selectedAsset?.id, selectedAsset?.scale]);

  function handleSaveScale() {
    if (!selectedAsset) return;
    const scale = Number(scaleInput);
    if (!Number.isFinite(scale) || scale < 0.1 || scale > 5) {
      setScaleError(t('furnitureEditorScaleError'));
      return;
    }
    setScaleError(null);
    update.mutate({ id: selectedAsset.id, updates: { scale } });
  }

  function handleToggleSeating(isSeating: boolean) {
    if (!selectedAsset) return;
    update.mutate({ id: selectedAsset.id, updates: { isSeating } });
  }

  async function handleFilePicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploadError(null);
    try {
      const { scene, box } = await loadGltfFromFile(file);
      const size = box.getSize(new THREE.Vector3());
      // Backend's CreateFurnitureAssetDto clamps nativeWidth/nativeDepth to
      // [0.02, 10] — checked client-side too so a bad measurement (NaN from
      // a model whose geometry didn't resolve, or a model genuinely bigger
      // than a 10m room) surfaces as a clear message instead of a raw 400
      // from the create call three steps later.
      const nativeWidth = size.x;
      const nativeDepth = size.z;
      if (
        !Number.isFinite(nativeWidth) ||
        !Number.isFinite(nativeDepth) ||
        nativeWidth < 0.02 ||
        nativeWidth > 10 ||
        nativeDepth < 0.02 ||
        nativeDepth > 10
      ) {
        console.error('Furniture model has an invalid measured size:', size);
        setUploadError(t('furnitureEditorSizeError'));
        return;
      }
      setPending({
        file,
        scene,
        box,
        nativeWidth,
        nativeDepth,
        name: file.name.replace(/\.(glb|gltf)$/i, ''),
        isSeating: false,
      });
    } catch (err) {
      console.error('Furniture model parse failed:', err);
      setUploadError(t('furnitureEditorUploadError'));
    }
  }

  async function handleConfirmUpload() {
    if (!pending) return;
    setUploadError(null);
    try {
      const [{ url: modelUrl }, thumbnailBlob] = await Promise.all([
        uploadModel.mutateAsync(pending.file),
        captureModelThumbnail(pending.scene, pending.box),
      ]);
      const { url: thumbnailUrl } = await uploadThumbnail.mutateAsync(thumbnailBlob);
      const newAsset = await create.mutateAsync({
        name: pending.name,
        modelUrl,
        thumbnailUrl,
        nativeWidth: pending.nativeWidth,
        nativeDepth: pending.nativeDepth,
        isSeating: pending.isSeating,
      });
      editor.setSelectedCatalogId(newAsset.id);
      setPending(null);
    } catch (err) {
      setUploadError(err instanceof ApiError ? err.message : t('furnitureEditorUploadError'));
    }
  }

  if (!blueprint) return null;

  const { bounds, wallRuns, cells } = blueprint;
  const fullMinX = bounds.minX - MARGIN;
  const fullMinZ = bounds.minZ - MARGIN;
  const fullWidth = bounds.maxX - bounds.minX + MARGIN * 2;
  const fullDepth = bounds.maxZ - bounds.minZ + MARGIN * 2;
  // Zoom shrinks the viewBox around the room's center, keeping the same
  // aspect ratio (so the style-driven aspectRatio below stays valid at any
  // zoom level) — large rooms otherwise render furniture icons too small to
  // place precisely. Pointer math (localPoint) reads getScreenCTM() live, so
  // drag/placement precision improves with zoom automatically, no separate
  // coordinate scaling needed.
  const width = fullWidth / zoom;
  const depth = fullDepth / zoom;
  // How far the view center can stray from the room's own center before
  // its edge would show empty space outside the room's bounds — zero at
  // zoom 1 (nothing to pan into), growing as zoom increases. Clamped here
  // (not just where pan is set) so a pan picked up at a higher zoom level
  // stays valid if the curator zooms back out.
  const maxPanX = (fullWidth - width) / 2;
  const maxPanZ = (fullDepth - depth) / 2;
  const clampedPanX = Math.max(-maxPanX, Math.min(maxPanX, pan.x));
  const clampedPanZ = Math.max(-maxPanZ, Math.min(maxPanZ, pan.z));
  const minX = fullMinX + (fullWidth - width) / 2 + clampedPanX;
  const minZ = fullMinZ + (fullDepth - depth) / 2 + clampedPanZ;

  function localPoint(e: { clientX: number; clientY: number }) {
    const svg = svgRef.current!;
    const point = svg.createSVGPoint();
    point.x = e.clientX;
    point.y = e.clientY;
    return point.matrixTransform(svg.getScreenCTM()?.inverse());
  }

  function handleBackgroundPointerDown(e: React.PointerEvent<SVGSVGElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    backgroundDragRef.current = {
      startClientX: e.clientX,
      startClientY: e.clientY,
      startPanX: clampedPanX,
      startPanZ: clampedPanZ,
      moved: false,
    };
  }

  function handleBackgroundPointerMove(e: React.PointerEvent<SVGSVGElement>) {
    const drag = backgroundDragRef.current;
    if (!drag) return;
    const dxPx = e.clientX - drag.startClientX;
    const dyPx = e.clientY - drag.startClientY;
    if (!drag.moved) {
      if (Math.hypot(dxPx, dyPx) < DRAG_CLICK_THRESHOLD_PX) return;
      drag.moved = true;
    }
    // Converts screen-pixel drag distance to room-meter distance using the
    // current viewBox↔rendered-box ratio — dragging right should slide the
    // visible window left (content follows the cursor), hence the negation.
    const rect = svgRef.current!.getBoundingClientRect();
    const nextX = drag.startPanX - dxPx * (width / rect.width);
    const nextZ = drag.startPanZ - dyPx * (depth / rect.height);
    setPan({ x: nextX, z: nextZ });
  }

  function handleBackgroundPointerUp(e: React.PointerEvent<SVGSVGElement>) {
    e.currentTarget.releasePointerCapture(e.pointerId);
    const drag = backgroundDragRef.current;
    backgroundDragRef.current = null;
    // No real pointer travel — a plain click on the empty floor, same as
    // before panning existed: places the selected catalog item there.
    if (drag && !drag.moved && editor.canAddMore) {
      const local = localPoint(e);
      editor.addFurniture(local.x, local.y);
    }
  }

  function handleHandlePointerDown(e: React.PointerEvent<SVGCircleElement>, id: number) {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    editor.setDraggingId(id);
  }

  function handleHandlePointerMove(e: React.PointerEvent<SVGCircleElement>, pieceX: number, pieceZ: number, id: number) {
    if (editor.draggingId !== id) return;
    const local = localPoint(e);
    const dx = local.x - pieceX;
    const dz = local.y - pieceZ;
    if (dx === 0 && dz === 0) return;
    editor.setRotation(id, Math.atan2(-dx, -dz));
  }

  function handleHandlePointerUp(e: React.PointerEvent<SVGCircleElement>) {
    e.currentTarget.releasePointerCapture(e.pointerId);
    editor.setDraggingId(null);
  }

  function handleBodyPointerDown(e: React.PointerEvent<SVGRectElement>, id: number) {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    bodyDragRef.current = { id, startClientX: e.clientX, startClientY: e.clientY, moved: false };
  }

  function handleBodyPointerMove(e: React.PointerEvent<SVGRectElement>, id: number) {
    const drag = bodyDragRef.current;
    if (!drag || drag.id !== id) return;
    if (!drag.moved) {
      const dx = e.clientX - drag.startClientX;
      const dy = e.clientY - drag.startClientY;
      if (Math.hypot(dx, dy) < DRAG_CLICK_THRESHOLD_PX) return;
      drag.moved = true;
    }
    const local = localPoint(e);
    editor.setPosition(id, local.x, local.y);
  }

  function handleBodyPointerUp(e: React.PointerEvent<SVGRectElement>, id: number) {
    e.currentTarget.releasePointerCapture(e.pointerId);
    const drag = bodyDragRef.current;
    bodyDragRef.current = null;
    // No real pointer travel happened (still under threshold) — treat it as
    // a plain click rather than a drag, same removal behavior this had
    // before dragging existed.
    if (drag && drag.id === id && !drag.moved) {
      editor.removeFurniture(id);
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg bg-brand-50 p-4 shadow-sm">
      <p className="text-sm font-medium text-brand-800">{t('furnitureEditorTitle')}</p>

      <div className="flex flex-wrap items-center gap-2">
        {assets.map((item) => {
          const isSelected = editor.selectedCatalogId === item.id;
          // Only this organization's own uploads are deletable — a platform
          // default (organizationId null) has no delete affordance, mirrors
          // the backend's assertOwnership rejecting it outright.
          const isOwn = item.organizationId !== null;
          const isConfirming = confirmDeleteId === item.id;
          return (
            <div
              key={item.id}
              className={`flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-sm transition-colors ${
                isSelected ? 'border-brand-700 bg-brand-700 text-white' : 'border-brand-300 text-brand-700 hover:bg-brand-100'
              }`}
            >
              {isConfirming ? (
                <>
                  <span className="text-xs">{t('furnitureEditorDeleteConfirmPrompt')}</span>
                  <button
                    type="button"
                    disabled={remove.isPending}
                    onClick={() => handleConfirmDelete(item.id)}
                    className="rounded px-1 text-xs font-medium underline disabled:opacity-50"
                  >
                    {t('furnitureEditorDeleteConfirmYes')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteId(null)}
                    className="rounded px-1 text-xs underline"
                  >
                    {t('commonCancel')}
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => editor.setSelectedCatalogId(isSelected ? '' : item.id)}
                    title={item.name}
                    className="flex items-center gap-2"
                  >
                    {item.thumbnailUrl ? (
                      <img src={item.thumbnailUrl} alt="" className="h-8 w-8 rounded object-cover" />
                    ) : null}
                    {item.name}
                  </button>
                  {isOwn && (
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(item.id)}
                      title={t('furnitureEditorDeleteButton')}
                      aria-label={t('furnitureEditorDeleteButton')}
                      className={`rounded px-1 text-sm leading-none ${
                        isSelected ? 'text-white/70 hover:text-white' : 'text-brand-400 hover:text-red-600'
                      }`}
                    >
                      ×
                    </button>
                  )}
                </>
              )}
            </div>
          );
        })}

        <input ref={fileInputRef} type="file" accept=".glb" className="hidden" onChange={handleFilePicked} />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="rounded-md border border-dashed border-brand-400 px-3 py-1.5 text-sm text-brand-700 hover:bg-brand-100"
        >
          {t('furnitureEditorUploadButton')}
        </button>
      </div>

      {selectedAsset && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-brand-300 bg-white p-2">
          <span className="text-sm text-brand-700">{t('furnitureEditorScaleLabel', { name: selectedAsset.name })}</span>
          <input
            type="number"
            step={0.1}
            min={0.1}
            max={5}
            value={scaleInput}
            onChange={(e) => setScaleInput(e.target.value)}
            className="w-20 rounded-md border border-brand-300 px-2 py-1 text-sm text-brand-900 outline-none focus:border-brand-500"
          />
          <button
            type="button"
            disabled={update.isPending}
            onClick={handleSaveScale}
            className="rounded-md bg-brand-700 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {t('furnitureEditorScaleSave')}
          </button>
          {scaleError && <span className="text-sm text-red-600">{scaleError}</span>}
          <label className="flex items-center gap-1.5 text-sm text-brand-700">
            <input
              type="checkbox"
              checked={selectedAsset.isSeating}
              disabled={update.isPending}
              onChange={(e) => handleToggleSeating(e.target.checked)}
              className="h-4 w-4 accent-brand-700"
            />
            {t('furnitureEditorIsSeatingLabel')}
          </label>
        </div>
      )}

      {pending && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-brand-300 bg-white p-2">
          <input
            value={pending.name}
            onChange={(e) => setPending({ ...pending, name: e.target.value })}
            placeholder={t('furnitureEditorUploadNamePlaceholder')}
            className="min-w-0 flex-1 rounded-md border border-brand-300 px-2 py-1 text-sm text-brand-900 outline-none focus:border-brand-500"
          />
          <label className="flex items-center gap-1.5 text-sm text-brand-700">
            <input
              type="checkbox"
              checked={pending.isSeating}
              onChange={(e) => setPending({ ...pending, isSeating: e.target.checked })}
              className="h-4 w-4 accent-brand-700"
            />
            {t('furnitureEditorIsSeatingLabel')}
          </label>
          <button
            type="button"
            disabled={isUploading || !pending.name.trim()}
            onClick={handleConfirmUpload}
            className="rounded-md bg-brand-700 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {isUploading ? t('furnitureEditorUploadingHint') : t('furnitureEditorUploadConfirm')}
          </button>
          <button
            type="button"
            onClick={() => setPending(null)}
            className="rounded-md border border-brand-300 px-3 py-1.5 text-sm text-brand-700 hover:bg-brand-100"
          >
            {t('commonCancel')}
          </button>
        </div>
      )}
      {uploadError && <p className="text-sm text-red-600">{uploadError}</p>}

      <div className="flex items-center justify-center gap-2 self-center">
        <button
          type="button"
          disabled={zoom <= ZOOM_MIN}
          onClick={() => setZoom((z) => Math.max(ZOOM_MIN, z / ZOOM_STEP_FACTOR))}
          title={t('furnitureEditorZoomOut')}
          aria-label={t('furnitureEditorZoomOut')}
          className="flex h-7 w-7 items-center justify-center rounded-md border border-brand-300 text-brand-700 hover:bg-brand-100 disabled:opacity-50"
        >
          −
        </button>
        <span className="min-w-10 text-center text-xs text-brand-600">{Math.round(zoom * 100)}%</span>
        <button
          type="button"
          disabled={zoom >= ZOOM_MAX}
          onClick={() => setZoom((z) => Math.min(ZOOM_MAX, z * ZOOM_STEP_FACTOR))}
          title={t('furnitureEditorZoomIn')}
          aria-label={t('furnitureEditorZoomIn')}
          className="flex h-7 w-7 items-center justify-center rounded-md border border-brand-300 text-brand-700 hover:bg-brand-100 disabled:opacity-50"
        >
          +
        </button>
      </div>

      <svg
        ref={svgRef}
        viewBox={`${minX} ${minZ} ${width} ${depth}`}
        className="w-full max-w-md cursor-crosshair self-center touch-none"
        style={{ aspectRatio: `${fullWidth} / ${fullDepth}` }}
        onPointerDown={handleBackgroundPointerDown}
        onPointerMove={handleBackgroundPointerMove}
        onPointerUp={handleBackgroundPointerUp}
      >
        {cells ? (
          cells.map((cell) => (
            <rect key={`${cell.x},${cell.z}`} x={cell.x} y={cell.z} width={1} height={1} className="fill-brand-200" />
          ))
        ) : (
          <rect
            x={bounds.minX}
            y={bounds.minZ}
            width={bounds.maxX - bounds.minX}
            height={bounds.maxZ - bounds.minZ}
            className="fill-brand-200"
          />
        )}

        {wallRuns.map((run) => {
          const x1 = run.orientation === 'horizontal' ? run.start : run.fixed;
          const y1 = run.orientation === 'horizontal' ? run.fixed : run.start;
          const x2 = run.orientation === 'horizontal' ? run.end : run.fixed;
          const y2 = run.orientation === 'horizontal' ? run.fixed : run.end;
          return (
            <line
              key={run.id}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              strokeWidth={WALL_STROKE}
              strokeLinecap="square"
              className="stroke-brand-700"
            />
          );
        })}

        {editor.placed.map((piece) => {
          const def = catalog.get(piece.furnitureId);
          if (!def) return null;
          const { width: fw, depth: fd } = def.footprint;
          const deg = -(piece.rotationY * 180) / Math.PI;
          const handleOffset = Math.max(fw, fd) / 2 + HANDLE_OFFSET;
          const handleX = piece.x + handleOffset * -Math.sin(piece.rotationY);
          const handleZ = piece.z + handleOffset * -Math.cos(piece.rotationY);
          return (
            <g key={piece.id}>
              <rect
                x={piece.x - fw / 2}
                y={piece.z - fd / 2}
                width={fw}
                height={fd}
                rx={0.05}
                transform={`rotate(${deg} ${piece.x} ${piece.z})`}
                className="cursor-move fill-amber-700/70 stroke-amber-900"
                strokeWidth={0.05}
                onPointerDown={(e) => handleBodyPointerDown(e, piece.id)}
                onPointerMove={(e) => handleBodyPointerMove(e, piece.id)}
                onPointerUp={(e) => handleBodyPointerUp(e, piece.id)}
                onClick={(e) => e.stopPropagation()}
              >
                <title>{t('furnitureEditorRemoveHint')}</title>
              </rect>
              <circle
                cx={handleX}
                cy={handleZ}
                r={HANDLE_RADIUS}
                className="cursor-grab fill-amber-400 stroke-amber-700"
                strokeWidth={0.04}
                onPointerDown={(e) => handleHandlePointerDown(e, piece.id)}
                onPointerMove={(e) => handleHandlePointerMove(e, piece.x, piece.z, piece.id)}
                onPointerUp={handleHandlePointerUp}
                onClick={(e) => e.stopPropagation()}
              >
                <title>{t('furnitureEditorRotateHint')}</title>
              </circle>
            </g>
          );
        })}
      </svg>
      <p className="text-center text-xs text-brand-500">
        {editor.canAddMore ? t('furnitureEditorHint') : t('furnitureEditorMaxReached')}
      </p>
    </div>
  );
}
