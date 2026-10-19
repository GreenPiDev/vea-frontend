import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { BlueprintLayout } from '../3d/backendAdapter';
import type { CeilingLightEditorState } from './useCeilingLightEditor';

const MARGIN = 1;
const WALL_STROKE = 0.15;
const LIGHT_RADIUS = 0.3;

interface CeilingLightEditorProps {
  /** The in-progress room shape being edited — see backendAdapter.ts's exported rectangleBlueprint/customBlueprint, built live from the form's own local state (no save round-trip needed). Null while the shape isn't resolvable yet (e.g. custom room with no spawn picked). */
  blueprint: BlueprintLayout | null;
  editor: CeilingLightEditorState;
}

/**
 * Top-down floor-plan editor for curator-placed ceiling fixtures (see
 * useCeilingLightEditor.ts) — click an empty point on the floor to add a
 * light, click an existing marker to remove it. Rendering mirrors
 * ExhibitionBlueprint.tsx's floor/wall SVG (small enough to duplicate rather
 * than share — that component also does wall-picking/artwork-thumbnail
 * concerns this editor doesn't need).
 */
export default function CeilingLightEditor({ blueprint, editor }: CeilingLightEditorProps) {
  const { t } = useTranslation();
  const svgRef = useRef<SVGSVGElement>(null);

  if (!blueprint) return null;

  const { bounds, wallRuns, cells } = blueprint;
  const minX = bounds.minX - MARGIN;
  const minZ = bounds.minZ - MARGIN;
  const width = bounds.maxX - bounds.minX + MARGIN * 2;
  const depth = bounds.maxZ - bounds.minZ + MARGIN * 2;

  function handleFloorClick(e: React.MouseEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    if (!svg || !editor.canAddMore) return;
    const point = svg.createSVGPoint();
    point.x = e.clientX;
    point.y = e.clientY;
    const local = point.matrixTransform(svg.getScreenCTM()?.inverse());
    editor.addLight(local.x, local.y);
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg bg-brand-50 p-4 shadow-sm">
      <p className="text-sm font-medium text-brand-800">{t('ceilingLightEditorTitle')}</p>
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

        {editor.placed.map((light) => (
          <circle
            key={light.id}
            cx={light.x}
            cy={light.z}
            r={LIGHT_RADIUS}
            className="cursor-pointer fill-amber-400 stroke-amber-700"
            strokeWidth={0.06}
            onClick={(e) => {
              e.stopPropagation();
              editor.removeLight(light.id);
            }}
          >
            <title>{t('ceilingLightEditorRemoveHint')}</title>
          </circle>
        ))}
      </svg>
      <p className="text-center text-xs text-brand-500">
        {editor.canAddMore ? t('ceilingLightEditorHint') : t('ceilingLightEditorMaxReached')}
      </p>
    </div>
  );
}
