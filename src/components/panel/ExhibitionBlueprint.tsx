import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ApiExhibitionArtwork, ApiSceneConfig } from '../../lib/api/domains/exhibitions';
import type { ApiExhibitionTemplate } from '../../lib/api/domains/exhibitionTemplates';
import { blueprintForSceneConfig } from '../3d/backendAdapter';
import type { FurnitureDef } from '../3d/furniture';
import { placeArtworksAlongWall, slideClamp } from '../3d/galleryLayout';
import { openingSpansOnWall } from '../3d/windowOpenings';

interface ExhibitionBlueprintProps {
  sceneConfig: ApiSceneConfig | null;
  /** The exhibition's resolved backend ExhibitionTemplate (if sceneConfig.templateId points at one, not a static EXHIBITIONS preset) — lets blueprintForSceneConfig fall back to it for room size. */
  resolvedTemplate?: ApiExhibitionTemplate | null;
  /** wallRunId -> its placed links, sorted by order — same shape ExhibitionArtworkPlacement.tsx already derives via groupByWallRun(exhibition.artworkLinks). */
  byWall: Map<string, ApiExhibitionArtwork[]>;
  selectedWallId?: string | null;
  /** Lets the floor plan double as a wall picker — clicking a wall (or its number) calls this with the same run.id the wall-button row above uses, so the two stay in sync either way. Optional so the blueprint still works as a read-only sketch wherever a picker doesn't make sense. */
  onSelectWall?: (wallId: string) => void;
  /** Catalog to resolve resolvedTemplate's roomShape.furniture against (see useMyFurnitureAssets/useFurnitureAssetsByOrganization + toFurnitureDef) — defaults to none, so callers that don't care about furniture don't need to fetch it. */
  furnitureCatalog?: FurnitureDef[];
  /** Turns the selected wall's thumbnails into drag handles (slide along the wall only). Called on every drag step with the new 0..1 position along the wall — nothing is persisted here, the caller keeps the pending value. */
  onMoveArtwork?: (link: ApiExhibitionArtwork, alongFraction: number) => void;
  /** Pending (unsaved) along-wall position per link id, owned by the caller: a number overrides the saved position, null means "back to the even slot". */
  alongOverrides?: Record<string, number | null>;
}

interface WallRunInfo {
  id: string;
  orientation: 'horizontal' | 'vertical';
  start: number;
  end: number;
  fixed: number;
  outward: -1 | 1;
}

const MARGIN = 1;
const WALL_STROKE = 0.15;
const WALL_HIT_STROKE = 0.6;
const THUMB_SIZE = 0.7;
const WALL_NUMBER_INSET = 0.5;
const WALL_NUMBER_FONT_SIZE = 0.5;
/** Window strips on the plan (drawn across the wall line). */
const WINDOW_THICKNESS = 0.42;

/**
 * Top-down floor-plan sketch of an exhibition room: floor shape, walls,
 * spawn point + facing, and a small thumbnail of every placed artwork at
 * its actual position along its wall — all in the same meter units
 * galleryLayout.ts's real 3D placement math uses (blueprintForSceneConfig/
 * placeArtworksAlongWall), just projected onto the x/z plane instead of
 * rendered in Three.js. Pure SVG, no dependency on the 3D scene stack.
 */
export default function ExhibitionBlueprint({
  sceneConfig,
  resolvedTemplate,
  byWall,
  selectedWallId,
  onSelectWall,
  furnitureCatalog = [],
  onMoveArtwork,
  alongOverrides,
}: ExhibitionBlueprintProps) {
  const { t } = useTranslation();
  const blueprint = useMemo(
    () => blueprintForSceneConfig(sceneConfig, resolvedTemplate, furnitureCatalog),
    [sceneConfig, resolvedTemplate, furnitureCatalog]
  );

  const svgRef = useRef<SVGSVGElement>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const thumbnails = useMemo(() => {
    if (!blueprint) return [];
    return blueprint.wallRuns.flatMap((run) => {
      const links = byWall.get(run.id);
      if (!links || links.length === 0) return [];
      // Only the along-wall spread matters here (a floor-plan has no height
      // axis) — real aspect/height give the artwork's true width, which the
      // drag limits need; the wall height is dummy (never clamps the width).
      const placements = placeArtworksAlongWall(
        run,
        100,
        links.map((link) => ({
          aspect: link.artwork.widthCm / link.artwork.heightCm,
          height: link.artwork.heightCm / 100,
          alongFraction: link.id in (alongOverrides ?? {}) ? (alongOverrides![link.id] ?? undefined) : link.positionData?.alongFraction,
        })),
        // Same window spans the 3D placement keeps artworks off (backendAdapter.ts's placeAll).
        openingSpansOnWall(run.id, blueprint.windows)
      );
      return links.map((link, i) => ({
        key: link.id,
        link,
        runId: run.id,
        orientation: run.orientation,
        index: i,
        x: placements[i].position[0],
        z: placements[i].position[2],
        width: placements[i].height * (link.artwork.widthCm / link.artwork.heightCm),
        imageUrl: link.artwork.imageUrl,
        title: link.artwork.title,
      }));
    });
  }, [blueprint, byWall, alongOverrides]);

  function alongCoord(run: WallRunInfo, e: React.PointerEvent<SVGImageElement>): number | null {
    const svg = svgRef.current;
    const ctm = svg?.getScreenCTM();
    if (!svg || !ctm) return null;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const local = pt.matrixTransform(ctm.inverse());
    return run.orientation === 'horizontal' ? local.x : local.y;
  }

  function handleDrag(thumb: (typeof thumbnails)[number], e: React.PointerEvent<SVGImageElement>) {
    if (draggingId !== thumb.key || !blueprint) return;
    const run = blueprint.wallRuns.find((r) => r.id === thumb.runId) as WallRunInfo | undefined;
    const coord = run && alongCoord(run, e);
    if (!run || coord == null) return;
    const onWall = thumbnails.filter((th) => th.runId === thumb.runId);
    const centers = onWall.map((th) => (run.orientation === 'horizontal' ? th.x : th.z));
    // Between its neighbours and off the windows; dragging past a window hops the work to its other side.
    const clamped = slideClamp(run, centers, onWall.map((th) => th.width), thumb.index, coord, openingSpansOnWall(run.id, blueprint.windows));
    onMoveArtwork?.(thumb.link, (clamped - run.start) / (run.end - run.start));
  }

  function handleDrop(thumb: (typeof thumbnails)[number], e: React.PointerEvent<SVGImageElement>) {
    if (draggingId !== thumb.key) return;
    e.currentTarget.releasePointerCapture(e.pointerId);
    setDraggingId(null);
  }

  if (!blueprint) return null;

  const { bounds, wallRuns, spawn, cells, furniture, windows } = blueprint;
  const minX = bounds.minX - MARGIN;
  const minZ = bounds.minZ - MARGIN;
  const width = bounds.maxX - bounds.minX + MARGIN * 2;
  const depth = bounds.maxZ - bounds.minZ + MARGIN * 2;

  return (
    <div className="flex flex-col gap-2 rounded-lg bg-brand-50 p-4 shadow-sm">
      <p className="text-sm font-medium text-brand-800">{t('blueprintTitle')}</p>
      <svg
        ref={svgRef}
        viewBox={`${minX} ${minZ} ${width} ${depth}`}
        className="w-full max-w-md self-center"
        style={{ aspectRatio: `${width} / ${depth}` }}
      >
        {cells ? (
          cells.map((cell) => (
            <rect
              key={`${cell.x},${cell.z}`}
              x={cell.x}
              y={cell.z}
              width={1}
              height={1}
              className="fill-brand-200"
            />
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

        {wallRuns.map((run, i) => {
          // Matches ExhibitionArtworkPlacement.tsx's wallNumbers map 1:1 —
          // both number this same wallRuns array (from the identical
          // wallRunsForSceneConfig/blueprintForSceneConfig derivation) in
          // array order, so "wall 3" here is always "wall 3" on the buttons.
          const number = i + 1;
          const mid = (run.start + run.end) / 2;
          // Nudge the number inward off the wall line (opposite `outward`)
          // so it sits inside the floor area instead of off-canvas past the
          // wall.
          const numX = run.orientation === 'horizontal' ? mid : run.fixed - run.outward * WALL_NUMBER_INSET;
          const numZ = run.orientation === 'horizontal' ? run.fixed - run.outward * WALL_NUMBER_INSET : mid;
          const selected = run.id === selectedWallId;
          const x1 = run.orientation === 'horizontal' ? run.start : run.fixed;
          const y1 = run.orientation === 'horizontal' ? run.fixed : run.start;
          const x2 = run.orientation === 'horizontal' ? run.end : run.fixed;
          const y2 = run.orientation === 'horizontal' ? run.fixed : run.end;
          return (
            <g
              key={run.id}
              onClick={onSelectWall ? () => onSelectWall(run.id) : undefined}
              className={onSelectWall ? 'cursor-pointer' : undefined}
            >
              {onSelectWall && (
                <line
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  strokeWidth={WALL_HIT_STROKE}
                  strokeLinecap="square"
                  stroke="transparent"
                />
              )}
              <line
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                strokeWidth={WALL_STROKE}
                strokeLinecap="square"
                className={selected ? 'stroke-green-600' : 'stroke-brand-700'}
              />
              <text
                x={numX}
                y={numZ}
                fontSize={WALL_NUMBER_FONT_SIZE}
                textAnchor="middle"
                dominantBaseline="central"
                className={selected ? 'fill-green-700 font-bold' : 'fill-brand-700'}
              >
                {number}
              </text>
            </g>
          );
        })}

        {windows.map((o) => {
          const horizontal = o.axis === 'x';
          const along = horizontal ? o.center[0] : o.center[2];
          const fixed = horizontal ? o.center[2] : o.center[0];
          return (
            <rect
              key={o.id}
              x={horizontal ? along - o.width / 2 : fixed - WINDOW_THICKNESS / 2}
              y={horizontal ? fixed - WINDOW_THICKNESS / 2 : along - o.width / 2}
              width={horizontal ? o.width : WINDOW_THICKNESS}
              height={horizontal ? WINDOW_THICKNESS : o.width}
              rx={0.05}
              pointerEvents="none"
              className="fill-sky-200 stroke-sky-600"
              strokeWidth={0.06}
            >
              <title>{t('blueprintWindow')}</title>
            </rect>
          );
        })}

        {furniture.map((piece, i) => {
          const { width: fw, depth: fd } = piece.footprint;
          const deg = -(piece.rotationY * 180) / Math.PI;
          // A small triangle on the box's local north edge, before rotation —
          // the enclosing <g>'s rotate() carries it to the piece's real
          // facing direction. Needed because the catalog thumbnail itself is
          // a fixed 3/4-angle shot (captureModelThumbnail.ts), not a true
          // top-down image, so rotating the photo alone wouldn't read as
          // "which way does it face".
          const arrowWidth = Math.min(fw, fd) * 0.5;
          const arrowDepth = arrowWidth * 0.7;
          return (
            <g key={i} transform={`rotate(${deg} ${piece.x} ${piece.z})`}>
              {piece.thumbnailUrl ? (
                <>
                  <clipPath id={`furniture-clip-${i}`}>
                    <rect x={piece.x - fw / 2} y={piece.z - fd / 2} width={fw} height={fd} rx={0.05} />
                  </clipPath>
                  <image
                    href={piece.thumbnailUrl}
                    x={piece.x - fw / 2}
                    y={piece.z - fd / 2}
                    width={fw}
                    height={fd}
                    preserveAspectRatio="xMidYMid slice"
                    clipPath={`url(#furniture-clip-${i})`}
                  />
                  <rect
                    x={piece.x - fw / 2}
                    y={piece.z - fd / 2}
                    width={fw}
                    height={fd}
                    rx={0.05}
                    fill="none"
                    className="stroke-amber-900"
                    strokeWidth={0.05}
                  />
                </>
              ) : (
                <rect
                  x={piece.x - fw / 2}
                  y={piece.z - fd / 2}
                  width={fw}
                  height={fd}
                  rx={0.05}
                  className="fill-amber-700/70 stroke-amber-900"
                  strokeWidth={0.05}
                />
              )}
              <polygon
                points={`${piece.x},${piece.z - fd / 2 - 0.02} ${piece.x - arrowWidth / 2},${piece.z - fd / 2 + arrowDepth} ${piece.x + arrowWidth / 2},${piece.z - fd / 2 + arrowDepth}`}
                className="fill-amber-900"
              />
            </g>
          );
        })}

        {thumbnails.map((thumb) => {
          const draggable = !!onMoveArtwork && thumb.runId === selectedWallId;
          // Drawn at the artwork's real width along its wall, so the gaps on
          // the plan match what slideClamp() enforces while dragging (a
          // fixed square made works look far apart yet refuse to get closer).
          const alongSize = thumb.width;
          const w = thumb.orientation === 'horizontal' ? alongSize : THUMB_SIZE;
          const h = thumb.orientation === 'horizontal' ? THUMB_SIZE : alongSize;
          return (
            <image
              key={thumb.key}
              href={thumb.imageUrl}
              x={thumb.x - w / 2}
              y={thumb.z - h / 2}
              width={w}
              height={h}
              preserveAspectRatio="xMidYMid slice"
              style={draggable ? { touchAction: 'none', cursor: draggingId === thumb.key ? 'grabbing' : 'grab' } : undefined}
              className={draggable ? 'drop-shadow-md' : undefined}
              onPointerDown={
                draggable
                  ? (e) => {
                      e.currentTarget.setPointerCapture(e.pointerId);
                      setDraggingId(thumb.key);
                    }
                  : undefined
              }
              onPointerMove={draggable ? (e) => handleDrag(thumb, e) : undefined}
              onPointerUp={draggable ? (e) => handleDrop(thumb, e) : undefined}
              onPointerCancel={draggable ? (e) => handleDrop(thumb, e) : undefined}
            >
              <title>{thumb.title}</title>
            </image>
          );
        })}

        <g transform={`translate(${spawn.x} ${spawn.z}) rotate(${spawn.rotationDeg})`}>
          <circle r={0.35} className="fill-brand-900" />
          <polygon points="0,-0.9 0.35,-0.25 -0.35,-0.25" className="fill-brand-900" />
        </g>
      </svg>
      <p className="text-center text-xs text-brand-500">{t('blueprintSpawnHint')}</p>
      {onMoveArtwork && <p className="text-center text-xs text-brand-500">{t('blueprintDragHint')}</p>}
      {windows.length > 0 && <p className="text-center text-xs text-brand-500">{t('blueprintWindowHint')}</p>}
    </div>
  );
}
