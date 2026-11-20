import { useRef, useState } from 'react';
import MetresField from './MetresField';
import { useTranslation } from 'react-i18next';
import type { BlueprintLayout } from '../3d/backendAdapter';
import type { WindowPlacementData, WindowStyleId } from '../../lib/api/domains/exhibitionTemplates';
import { OUTDOOR_PANORAMAS } from '../3d/outdoorPanoramas';
import { PANORAMA_LIGHT } from '../3d/outdoorPanoramaLight';
import { panoramaToWorld, rotationForSunDirection } from '../3d/windowLight';
import { MAX_WINDOWS_PER_ROOM, WINDOW_STYLE_IDS, balconySpan, clampBalconyDepth } from '../3d/windowOpenings';
import { rectOverlapsCells, type FloorRect } from '../3d/balcony';
import { WALL_THICKNESS } from '../3d/galleryLayout';
import type { EditorWall, WindowEditorState } from './useWindowEditor';
import type { MezzanineData } from '../../lib/api/domains/exhibitionTemplates';
import { windowCrossesSlab } from '../3d/mezzanineTemplate';

const MARGIN = 1.4;
const WALL_STROKE = 0.15;
const WALL_HIT_STROKE = 0.7;
const WINDOW_THICKNESS = 0.42;

const STYLE_LABEL: Record<WindowStyleId, string> = {
  classic: 'windowStyleClassic',
  modern: 'windowStyleModern',
  panorama: 'windowStylePanorama',
  balcony: 'windowStyleBalcony',
};

type Run = BlueprintLayout['wallRuns'][number];

const runMin = (r: Run) => Math.min(r.start, r.end);
const runLength = (r: Run) => Math.abs(r.end - r.start);

/** Plan rectangle of a balcony door's platform, outside its wall (same rules as balcony.ts at render time). */
function balconyRect(run: Run, w: WindowPlacementData): FloorRect {
  const start = runMin(run);
  const [a0, a1] = balconySpan(start + w.alongFraction * runLength(run), w.width, w.balconyWidth, start, start + runLength(run));
  const face = run.fixed + (run.outward * WALL_THICKNESS) / 2;
  const edge = face + run.outward * clampBalconyDepth(w.balconyDepth);
  const [n0, n1] = face < edge ? [face, edge] : [edge, face];
  return run.orientation === 'horizontal' ? { minX: a0, maxX: a1, minZ: n0, maxZ: n1 } : { minX: n0, maxX: n1, minZ: a0, maxZ: a1 };
}

interface WindowEditorProps {
  /** Live floor plan of the room being edited (null while the shape isn't resolvable yet). */
  blueprint: BlueprintLayout | null;
  /** The room's wall height in metres (null while the field is invalid). */
  wallHeight: number | null;
  editor: WindowEditorState;
  /** A rectangle template's mezzanine — no window may cut through its slab. */
  mezzanine?: MezzanineData | null;
}

/**
 * Top-down editor for a room's windows and the view through them (useWindowEditor.ts): click a wall to add a
 * window of the chosen style, select one to drag it along its wall or set its size, pick the panorama and turn
 * it. The sun of the chosen panorama is drawn outside the plan, so the curator sees which windows it will
 * shine through before saving (sunLight.ts uses the same direction).
 */
export default function WindowEditor({ blueprint, wallHeight, editor, mezzanine }: WindowEditorProps) {
  const { t } = useTranslation();
  const svgRef = useRef<SVGSVGElement>(null);
  const dragging = useRef<string | null>(null);
  // Dragging the sun marker around the plan turns the panorama (and its sun) — see handleSunPointerMove.
  const draggingSun = useRef(false);
  const [notice, setNotice] = useState<string | null>(null);

  if (!blueprint || !wallHeight) return null;

  const { bounds, wallRuns, cells } = blueprint;
  // Room around the plan for balconies sticking out of it (and the sun beyond).
  const balconyReach = Math.max(0, ...editor.windows.filter((w) => w.styleId === 'balcony').map((w) => clampBalconyDepth(w.balconyDepth)));
  const margin = MARGIN + balconyReach;
  const minX = bounds.minX - margin;
  const minZ = bounds.minZ - margin;
  const width = bounds.maxX - bounds.minX + margin * 2;
  const depth = bounds.maxZ - bounds.minZ + margin * 2;

  const wallOf = (id: string): EditorWall | null => {
    const run = wallRuns.find((r) => r.id === id);
    if (!run) return null;
    // A drawn room's balcony may not reach into another part of its own footprint (an L's inner corner).
    const balconyFits = cells ? (p: WindowPlacementData) => !rectOverlapsCells(balconyRect(run, p), cells) : undefined;
    const size: [number, number] = [bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ];
    const clearOfSlab = mezzanine ? (p: WindowPlacementData) => !windowCrossesSlab(p, mezzanine, size) : undefined;
    return { id, length: runLength(run), height: wallHeight, balconyFits, clearOfSlab };
  };

  function toLocal(e: { clientX: number; clientY: number }) {
    const svg = svgRef.current;
    if (!svg) return null;
    const point = svg.createSVGPoint();
    point.x = e.clientX;
    point.y = e.clientY;
    return point.matrixTransform(svg.getScreenCTM()?.inverse());
  }

  /** 0..1 position of a plan point along a wall run (clamped). */
  function fractionOn(run: Run, p: { x: number; y: number }) {
    const along = run.orientation === 'horizontal' ? p.x : p.y;
    return Math.min(Math.max((along - runMin(run)) / runLength(run), 0), 1);
  }

  function handleWallClick(run: Run, e: React.MouseEvent) {
    e.stopPropagation();
    const p = toLocal(e);
    if (!p) return;
    if (!editor.canAddMore) {
      setNotice(t('windowEditorMaxReached', { max: MAX_WINDOWS_PER_ROOM }));
      return;
    }
    const ok = editor.addWindow(wallOf(run.id)!, fractionOn(run, p));
    setNotice(ok ? null : t(editor.newStyle === 'balcony' ? 'windowEditorBalconyBlocked' : mezzanine ? 'windowEditorNoRoomOrSlab' : 'windowEditorNoRoom'));
  }

  function handleWindowPointerDown(id: string, e: React.PointerEvent<SVGRectElement>) {
    e.stopPropagation();
    editor.select(id);
    dragging.current = id;
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function handleWindowPointerMove(e: React.PointerEvent<SVGRectElement>) {
    const id = dragging.current;
    if (!id) return;
    const w = editor.windows.find((x) => x.id === id);
    const run = w && wallRuns.find((r) => r.id === w.wallId);
    const p = toLocal(e);
    if (!w || !run || !p) return;
    editor.updateWindow(id, { alongFraction: fractionOn(run, p) }, wallOf(run.id)!);
  }

  function handleWindowPointerUp(e: React.PointerEvent<SVGRectElement>) {
    dragging.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  }

  // The panorama's sun, drawn just outside the plan in its (rotated) direction.
  const sun = PANORAMA_LIGHT[editor.outdoor.panoramaId]?.sun ?? null;
  let sunMarker: { x: number; y: number; dx: number; dy: number } | null = null;
  if (sun) {
    const d = panoramaToWorld(sun.phi, sun.elevation, editor.outdoor.rotationY ?? 0);
    const len = Math.hypot(d.x, d.z) || 1;
    const dx = d.x / len;
    const dy = d.z / len;
    const cx = (bounds.minX + bounds.maxX) / 2;
    const cz = (bounds.minZ + bounds.maxZ) / 2;
    const hx = (bounds.maxX - bounds.minX) / 2;
    const hz = (bounds.maxZ - bounds.minZ) / 2;
    const tEdge = Math.min(Math.abs(dx) > 1e-6 ? hx / Math.abs(dx) : Infinity, Math.abs(dy) > 1e-6 ? hz / Math.abs(dy) : Infinity);
    sunMarker = { x: cx + dx * (tEdge + 0.75 + balconyReach), y: cz + dy * (tEdge + 0.75 + balconyReach), dx, dy };
  }

  function handleSunPointerDown(e: React.PointerEvent<SVGGElement>) {
    e.stopPropagation();
    draggingSun.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function handleSunPointerMove(e: React.PointerEvent<SVGGElement>) {
    if (!draggingSun.current || !sun) return;
    const p = toLocal(e);
    if (!p) return;
    const dx = p.x - (bounds.minX + bounds.maxX) / 2;
    const dz = p.y - (bounds.minZ + bounds.maxZ) / 2;
    if (Math.hypot(dx, dz) < 0.3) return;
    editor.setOutdoor({ ...editor.outdoor, rotationY: rotationForSunDirection(sun.phi, dx, dz) });
  }

  function handleSunPointerUp(e: React.PointerEvent<SVGGElement>) {
    draggingSun.current = false;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  }

  const selected = editor.selected;
  const selectedWall = selected ? wallOf(selected.wallId) : null;
  const isBalcony = selected?.styleId === 'balcony';
  const rotationDeg = Math.round((((editor.outdoor.rotationY ?? 0) * 180) / Math.PI + 360) % 360);

  return (
    <div className="flex flex-col gap-3 rounded-lg bg-brand-50 p-4 shadow-sm">
      <p className="text-sm font-medium text-brand-800">{t('windowEditorTitle')}</p>

      <div className="flex flex-wrap items-center gap-2 text-sm text-brand-800">
        <span>{t('windowEditorNewStyle')}</span>
        {WINDOW_STYLE_IDS.map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => editor.setNewStyle(id)}
            className={`rounded-md border px-2 py-1 text-xs ${
              editor.newStyle === id ? 'border-brand-700 bg-brand-700 text-white' : 'border-brand-300 text-brand-700 hover:bg-brand-100'
            }`}
          >
            {t(STYLE_LABEL[id])}
          </button>
        ))}
      </div>

      <svg
        ref={svgRef}
        viewBox={`${minX} ${minZ} ${width} ${depth}`}
        className="w-full max-w-md self-center"
        style={{ aspectRatio: `${width} / ${depth}` }}
        onClick={() => editor.select(null)}
      >
        {cells ? (
          cells.map((cell) => <rect key={`${cell.x},${cell.z}`} x={cell.x} y={cell.z} width={1} height={1} className="fill-brand-200" />)
        ) : (
          <rect x={bounds.minX} y={bounds.minZ} width={bounds.maxX - bounds.minX} height={bounds.maxZ - bounds.minZ} className="fill-brand-200" />
        )}

        {wallRuns.map((run) => {
          const horizontal = run.orientation === 'horizontal';
          const [x1, y1, x2, y2] = horizontal
            ? [run.start, run.fixed, run.end, run.fixed]
            : [run.fixed, run.start, run.fixed, run.end];
          return (
            <g key={run.id}>
              <line x1={x1} y1={y1} x2={x2} y2={y2} strokeWidth={WALL_STROKE} strokeLinecap="square" className="stroke-brand-700" />
              {/* Wide invisible hit area: walls are thin at this scale. */}
              <line
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                strokeWidth={WALL_HIT_STROKE}
                stroke="transparent"
                className="cursor-copy"
                onClick={(e) => handleWallClick(run, e)}
              >
                <title>{t('windowEditorAddHint')}</title>
              </line>
            </g>
          );
        })}

        {editor.windows.map((w) => {
          const run = wallRuns.find((r) => r.id === w.wallId);
          if (!run || w.styleId !== 'balcony') return null;
          const r = balconyRect(run, w);
          return (
            <rect
              key={`balcony:${w.id}`}
              x={r.minX}
              y={r.minZ}
              width={r.maxX - r.minX}
              height={r.maxZ - r.minZ}
              strokeWidth={0.05}
              strokeDasharray="0.12 0.08"
              className={`pointer-events-none ${selected?.id === w.id ? 'fill-brand-300 stroke-brand-800' : 'fill-brand-100 stroke-brand-600'}`}
            />
          );
        })}

        {editor.windows.map((w) => {
          const run = wallRuns.find((r) => r.id === w.wallId);
          if (!run) return null;
          const c = runMin(run) + w.alongFraction * runLength(run);
          const horizontal = run.orientation === 'horizontal';
          const isSelected = selected?.id === w.id;
          return (
            <rect
              key={w.id}
              x={horizontal ? c - w.width / 2 : run.fixed - WINDOW_THICKNESS / 2}
              y={horizontal ? run.fixed - WINDOW_THICKNESS / 2 : c - w.width / 2}
              width={horizontal ? w.width : WINDOW_THICKNESS}
              height={horizontal ? WINDOW_THICKNESS : w.width}
              rx={0.05}
              className={`cursor-grab ${
                w.styleId === 'balcony'
                  ? isSelected
                    ? 'fill-brand-500 stroke-brand-900'
                    : 'fill-brand-400 stroke-brand-700'
                  : isSelected
                    ? 'fill-sky-400 stroke-sky-800'
                    : 'fill-sky-200 stroke-sky-600'
              }`}
              strokeWidth={0.06}
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => handleWindowPointerDown(w.id, e)}
              onPointerMove={handleWindowPointerMove}
              onPointerUp={handleWindowPointerUp}
              onPointerCancel={handleWindowPointerUp}
            />
          );
        })}

        {sunMarker && (
          <g
            className="cursor-grab touch-none"
            onClick={(e) => e.stopPropagation()}
            onPointerDown={handleSunPointerDown}
            onPointerMove={handleSunPointerMove}
            onPointerUp={handleSunPointerUp}
            onPointerCancel={handleSunPointerUp}
          >
            <title>{t('outdoorSunDragHint')}</title>
            {/* Generous invisible hit area — the drawn sun is small at plan scale. */}
            <circle cx={sunMarker.x} cy={sunMarker.y} r={0.7} fill="transparent" />
            <line
              x1={sunMarker.x - sunMarker.dx * 0.45}
              y1={sunMarker.y - sunMarker.dy * 0.45}
              x2={sunMarker.x - sunMarker.dx * 1.3}
              y2={sunMarker.y - sunMarker.dy * 1.3}
              strokeWidth={0.07}
              strokeDasharray="0.15 0.1"
              className="stroke-amber-500"
            />
            {Array.from({ length: 8 }, (_, i) => {
              const a = (i * Math.PI) / 4;
              return (
                <line
                  key={i}
                  x1={sunMarker!.x + Math.cos(a) * 0.32}
                  y1={sunMarker!.y + Math.sin(a) * 0.32}
                  x2={sunMarker!.x + Math.cos(a) * 0.48}
                  y2={sunMarker!.y + Math.sin(a) * 0.48}
                  strokeWidth={0.06}
                  className="stroke-amber-500"
                />
              );
            })}
            <circle cx={sunMarker.x} cy={sunMarker.y} r={0.24} className="fill-amber-400 stroke-amber-600" strokeWidth={0.04} />
          </g>
        )}
      </svg>

      <p className="text-center text-xs text-brand-500">{notice ?? t('windowEditorHint')}</p>

      {selected && selectedWall && (
        <div className="flex flex-col gap-2 rounded-md border border-brand-200 bg-white p-3 text-sm text-brand-800">
          <div className="flex items-center justify-between">
            <span className="font-medium">{t(isBalcony ? 'windowEditorSelectedBalcony' : 'windowEditorSelected')}</span>
            <button type="button" onClick={() => editor.removeWindow(selected.id)} className="text-xs text-red-700 hover:underline">
              {t(isBalcony ? 'windowEditorRemoveBalcony' : 'windowEditorRemove')}
            </button>
          </div>
          <label className="flex items-center justify-between gap-2">
            <span>{t('windowEditorStyle')}</span>
            <select
              value={selected.styleId}
              onChange={(e) => editor.updateWindow(selected.id, { styleId: e.target.value as WindowStyleId }, selectedWall)}
              className="rounded-md border border-brand-300 px-2 py-1"
            >
              {WINDOW_STYLE_IDS.map((id) => (
                <option key={id} value={id}>
                  {t(STYLE_LABEL[id])}
                </option>
              ))}
            </select>
          </label>
          <MetresField
            label={t(isBalcony ? 'windowEditorDoorWidth' : 'windowEditorWidth')}
            value={selected.width}
            onCommit={(v) => editor.updateWindow(selected.id, { width: v }, selectedWall) || setNotice(t('windowEditorNoRoom'))}
          />
          <MetresField
            label={t(isBalcony ? 'windowEditorDoorHeight' : 'windowEditorHeight')}
            value={selected.height}
            onCommit={(v) => editor.updateWindow(selected.id, { height: v }, selectedWall)}
          />
          {isBalcony ? (
            <>
              <MetresField
                label={t('windowEditorBalconyWidth')}
                value={selected.balconyWidth ?? 0}
                onCommit={(v) => editor.updateWindow(selected.id, { balconyWidth: v }, selectedWall) || setNotice(t('windowEditorNoRoom'))}
              />
              <MetresField
                label={t('windowEditorBalconyDepth')}
                value={selected.balconyDepth ?? 0}
                onCommit={(v) =>
                  editor.updateWindow(selected.id, { balconyDepth: v }, selectedWall) || setNotice(t('windowEditorBalconyBlocked'))
                }
              />
              <p className="text-xs text-brand-500">{t('windowEditorBalconyHint')}</p>
            </>
          ) : (
            <MetresField
              label={t('windowEditorSill')}
              hint={t('windowEditorSillHint')}
              value={selected.sillHeight}
              onCommit={(v) => editor.updateWindow(selected.id, { sillHeight: v }, selectedWall)}
            />
          )}
        </div>
      )}

      {editor.windows.length > 0 && (
        <div className="flex flex-col gap-2 text-sm text-brand-800">
          <span className="font-medium">{t('outdoorTitle')}</span>
          <div className="flex flex-wrap gap-2">
            {OUTDOOR_PANORAMAS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => editor.setOutdoor({ ...editor.outdoor, panoramaId: p.id })}
                className={`flex w-28 flex-col overflow-hidden rounded-md border text-xs ${
                  editor.outdoor.panoramaId === p.id ? 'border-brand-700 ring-2 ring-brand-700' : 'border-brand-300 hover:border-brand-500'
                }`}
              >
                <img src={p.thumbnailUrl} alt="" className="aspect-[2/1] w-full object-cover" loading="lazy" />
                <span className="truncate px-1 py-0.5">{t(p.labelKey)}</span>
              </button>
            ))}
          </div>
          <label className="flex flex-col gap-1">
            <span>
              {t('outdoorRotation')} · {rotationDeg}°
            </span>
            <input
              type="range"
              min={0}
              max={359}
              step={1}
              value={rotationDeg}
              onChange={(e) => editor.setOutdoor({ ...editor.outdoor, rotationY: (Number(e.target.value) * Math.PI) / 180 })}
            />
          </label>
          <p className="text-xs text-brand-500">{sun ? t('outdoorSunHint') : t(editor.outdoor.panoramaId === 'night' ? 'outdoorNightHint' : 'outdoorOvercast')}</p>
        </div>
      )}
    </div>
  );
}
