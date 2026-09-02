import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { ApiExhibitionArtwork, ApiSceneConfig } from '../../lib/api/domains/exhibitions';
import { blueprintForSceneConfig } from '../3d/backendAdapter';
import { placeArtworksAlongWall } from '../3d/galleryLayout';

interface ExhibitionBlueprintProps {
  sceneConfig: ApiSceneConfig | null;
  /** wallRunId -> its placed links, sorted by order — same shape ExhibitionArtworkPlacement.tsx already derives via groupByWallRun(exhibition.artworkLinks). */
  byWall: Map<string, ApiExhibitionArtwork[]>;
  selectedWallId?: string | null;
  /** Lets the floor plan double as a wall picker — clicking a wall (or its number) calls this with the same run.id the wall-button row above uses, so the two stay in sync either way. Optional so the blueprint still works as a read-only sketch wherever a picker doesn't make sense. */
  onSelectWall?: (wallId: string) => void;
}

const MARGIN = 1;
const WALL_STROKE = 0.15;
const WALL_HIT_STROKE = 0.6;
const THUMB_SIZE = 0.7;
const WALL_NUMBER_INSET = 0.5;
const WALL_NUMBER_FONT_SIZE = 0.5;

/**
 * Top-down floor-plan sketch of an exhibition room: floor shape, walls,
 * spawn point + facing, and a small thumbnail of every placed artwork at
 * its actual position along its wall — all in the same meter units
 * galleryLayout.ts's real 3D placement math uses (blueprintForSceneConfig/
 * placeArtworksAlongWall), just projected onto the x/z plane instead of
 * rendered in Three.js. Pure SVG, no dependency on the 3D scene stack.
 */
export default function ExhibitionBlueprint({ sceneConfig, byWall, selectedWallId, onSelectWall }: ExhibitionBlueprintProps) {
  const { t } = useTranslation();
  const blueprint = useMemo(() => blueprintForSceneConfig(sceneConfig), [sceneConfig]);

  const thumbnails = useMemo(() => {
    if (!blueprint) return [];
    return blueprint.wallRuns.flatMap((run) => {
      const links = byWall.get(run.id);
      if (!links || links.length === 0) return [];
      // Only x/z matter here (a floor-plan has no height axis) — aspect/
      // height are irrelevant to placeArtworksAlongWall's x/z spread, only
      // to its vertical hang math, so dummy values are fine.
      const placements = placeArtworksAlongWall(
        run,
        100,
        links.map(() => ({ aspect: 1, height: 1 }))
      );
      return links.map((link, i) => ({
        key: link.id,
        x: placements[i].position[0],
        z: placements[i].position[2],
        imageUrl: link.artwork.imageUrl,
        title: link.artwork.title,
      }));
    });
  }, [blueprint, byWall]);

  if (!blueprint) return null;

  const { bounds, wallRuns, spawn, cells } = blueprint;
  const minX = bounds.minX - MARGIN;
  const minZ = bounds.minZ - MARGIN;
  const width = bounds.maxX - bounds.minX + MARGIN * 2;
  const depth = bounds.maxZ - bounds.minZ + MARGIN * 2;

  return (
    <div className="flex flex-col gap-2 rounded-lg bg-brand-50 p-4 shadow-sm">
      <p className="text-sm font-medium text-brand-800">{t('blueprintTitle')}</p>
      <svg
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

        {thumbnails.map((thumb) => (
          <image
            key={thumb.key}
            href={thumb.imageUrl}
            x={thumb.x - THUMB_SIZE / 2}
            y={thumb.z - THUMB_SIZE / 2}
            width={THUMB_SIZE}
            height={THUMB_SIZE}
            preserveAspectRatio="xMidYMid slice"
          >
            <title>{thumb.title}</title>
          </image>
        ))}

        <g transform={`translate(${spawn.x} ${spawn.z}) rotate(${spawn.rotationDeg})`}>
          <circle r={0.35} className="fill-brand-900" />
          <polygon points="0,-0.9 0.35,-0.25 -0.35,-0.25" className="fill-brand-900" />
        </g>
      </svg>
      <p className="text-center text-xs text-brand-500">{t('blueprintSpawnHint')}</p>
    </div>
  );
}
