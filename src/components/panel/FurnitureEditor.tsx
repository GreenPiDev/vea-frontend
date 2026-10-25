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
}

/**
 * Top-down floor-plan editor for curator-placed furniture (see
 * useFurnitureEditor.ts) — pick a catalog item, click an empty point on the
 * floor to place it (default facing north), drag its rotate handle to set
 * which way it faces, click its body to remove it. Rendering shares
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

  const catalog = useMemo(() => new Map(assets.map((a) => [a.id, toFurnitureDef(a)])), [assets]);

  // Auto-pick the first loaded asset once the catalog arrives, if the
  // curator hasn't picked one yet (the hook itself has no static default to
  // seed from anymore — the catalog is fetched, not a module-scope constant).
  useEffect(() => {
    if (!editor.selectedCatalogId && assets.length > 0) {
      editor.setSelectedCatalogId(assets[0].id);
    }
  }, [assets, editor]);

  const [pending, setPending] = useState<PendingUpload | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const uploadModel = useUploadFurnitureModel();
  const uploadThumbnail = useUploadFurnitureThumbnail();
  const { create, update } = useFurnitureAssetMutations();
  const isUploading = uploadModel.isPending || uploadThumbnail.isPending || create.isPending;

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

  async function handleFilePicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploadError(null);
    try {
      const { scene, box } = await loadGltfFromFile(file);
      const size = box.getSize(new THREE.Vector3());
      setPending({
        file,
        scene,
        box,
        nativeWidth: Math.max(size.x, 0.05),
        nativeDepth: Math.max(size.z, 0.05),
        name: file.name.replace(/\.(glb|gltf)$/i, ''),
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
      });
      editor.setSelectedCatalogId(newAsset.id);
      setPending(null);
    } catch (err) {
      setUploadError(err instanceof ApiError ? err.message : t('furnitureEditorUploadError'));
    }
  }

  if (!blueprint) return null;

  const { bounds, wallRuns, cells } = blueprint;
  const minX = bounds.minX - MARGIN;
  const minZ = bounds.minZ - MARGIN;
  const width = bounds.maxX - bounds.minX + MARGIN * 2;
  const depth = bounds.maxZ - bounds.minZ + MARGIN * 2;

  function localPoint(e: { clientX: number; clientY: number }) {
    const svg = svgRef.current!;
    const point = svg.createSVGPoint();
    point.x = e.clientX;
    point.y = e.clientY;
    return point.matrixTransform(svg.getScreenCTM()?.inverse());
  }

  function handleFloorClick(e: React.MouseEvent<SVGSVGElement>) {
    if (!editor.canAddMore) return;
    const local = localPoint(e);
    editor.addFurniture(local.x, local.y);
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

  return (
    <div className="flex flex-col gap-2 rounded-lg bg-brand-50 p-4 shadow-sm">
      <p className="text-sm font-medium text-brand-800">{t('furnitureEditorTitle')}</p>

      <div className="flex flex-wrap items-center gap-2">
        {assets.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => editor.setSelectedCatalogId(item.id)}
            title={item.name}
            className={`flex items-center gap-2 rounded-md border px-2 py-1.5 text-sm transition-colors ${
              editor.selectedCatalogId === item.id
                ? 'border-brand-700 bg-brand-700 text-white'
                : 'border-brand-300 text-brand-700 hover:bg-brand-100'
            }`}
          >
            {item.thumbnailUrl ? (
              <img src={item.thumbnailUrl} alt="" className="h-8 w-8 rounded object-cover" />
            ) : null}
            {item.name}
          </button>
        ))}

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

      <svg
        ref={svgRef}
        viewBox={`${minX} ${minZ} ${width} ${depth}`}
        className="w-full max-w-md cursor-crosshair self-center"
        style={{ aspectRatio: `${width} / ${depth}` }}
        onClick={handleFloorClick}
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
                className="cursor-pointer fill-amber-700/70 stroke-amber-900"
                strokeWidth={0.05}
                onClick={(e) => {
                  e.stopPropagation();
                  editor.removeFurniture(piece.id);
                }}
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
