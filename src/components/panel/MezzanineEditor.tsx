import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { WindowPlacementData } from '../../lib/api/domains/exhibitionTemplates';
import { blueprintMezzanine } from '../3d/backendAdapter';
import {
  MEZZANINE_MIN_DEPTH,
  MEZZANINE_MIN_HALL,
  MEZZANINE_MIN_HEADROOM,
  MEZZANINE_MIN_TOP,
  stairRun,
  type MezzanineWallId,
} from '../3d/mezzanineTemplate';
import MetresField from './MetresField';
import type { MezzanineEditorState, MezzanineRefusal, MezzanineRoom } from './useMezzanineEditor';

const MARGIN = 1;
const WALL_STROKE = 0.15;
const WALL_HIT_STROKE = 0.8;

const REFUSAL_KEY: Record<MezzanineRefusal, string> = {
  tooShallow: 'mezzanineRefusalTooShallow',
  tooDeep: 'mezzanineRefusalTooDeep',
  tooLow: 'mezzanineRefusalTooLow',
  tooHigh: 'mezzanineRefusalTooHigh',
  stairNoRoom: 'mezzanineRefusalStairNoRoom',
  windowInWay: 'mezzanineRefusalWindowInWay',
};

interface MezzanineEditorProps {
  /** Rectangle room size (null while the width/depth fields are invalid). */
  size: [number, number] | null;
  wallHeight: number | null;
  /** The windows being edited alongside — none may cut through the slab. */
  windows: WindowPlacementData[];
  editor: MezzanineEditorState;
  /** The template is used by an exhibition: its mezzanine walls carry artworks, so it can't change. */
  locked: boolean;
}

/**
 * Top-down editor for a rectangle template's mezzanine (useMezzanineEditor.ts): click a wall to put the
 * mezzanine along it (or move it there), set its depth and height, pick which end its stair comes down at.
 * The plan shows the slab (hatched) and the stair (its treads), the same geometry the room is built from.
 */
export default function MezzanineEditor({ size, wallHeight, windows, editor, locked }: MezzanineEditorProps) {
  const { t } = useTranslation();
  const [notice, setNotice] = useState<string | null>(null);
  if (!size || !wallHeight) return null;

  const room: MezzanineRoom = { size, wallHeight, windows };
  const [W, D] = size;
  const m = editor.mezzanine;
  const plan = m ? blueprintMezzanine(m, size) : null;

  const explain = (refusal: MezzanineRefusal | null) =>
    setNotice(
      refusal
        ? t(REFUSAL_KEY[refusal], {
            min: refusal === 'tooShallow' ? MEZZANINE_MIN_DEPTH : MEZZANINE_MIN_TOP,
            hall: MEZZANINE_MIN_HALL,
            headroom: MEZZANINE_MIN_HEADROOM,
          })
        : null
    );

  const walls: { id: MezzanineWallId; x1: number; y1: number; x2: number; y2: number }[] = [
    { id: 'north', x1: -W / 2, y1: -D / 2, x2: W / 2, y2: -D / 2 },
    { id: 'south', x1: -W / 2, y1: D / 2, x2: W / 2, y2: D / 2 },
    { id: 'west', x1: -W / 2, y1: -D / 2, x2: -W / 2, y2: D / 2 },
    { id: 'east', x1: W / 2, y1: -D / 2, x2: W / 2, y2: D / 2 },
  ];

  // Stair-end labels by compass: the run's "start" is its west (north/south walls) or north (east/west walls) end.
  const alongX = m?.wallId === 'north' || m?.wallId === 'south';
  const endLabel = { start: t(alongX ? 'mezzanineStairWest' : 'mezzanineStairNorth'), end: t(alongX ? 'mezzanineStairEast' : 'mezzanineStairSouth') };

  // Tread lines across the stair, from its rect and climbing axis.
  const treadLines = plan
    ? Array.from({ length: plan.risers - 1 }, (_, i) => {
        const s = plan.stair;
        const f = (i + 1) / plan.risers;
        return plan.stairAxis === 'z'
          ? { x1: s.minX, x2: s.maxX, y1: s.minZ + (s.maxZ - s.minZ) * f, y2: s.minZ + (s.maxZ - s.minZ) * f }
          : { x1: s.minX + (s.maxX - s.minX) * f, x2: s.minX + (s.maxX - s.minX) * f, y1: s.minZ, y2: s.maxZ };
      })
    : [];

  return (
    <div className="flex flex-col gap-3 rounded-lg bg-brand-50 p-4 shadow-sm">
      <p className="text-sm font-medium text-brand-800">{t('mezzanineEditorTitle')}</p>

      <svg
        viewBox={`${-W / 2 - MARGIN} ${-D / 2 - MARGIN} ${W + MARGIN * 2} ${D + MARGIN * 2}`}
        className="w-full max-w-md self-center"
        style={{ aspectRatio: `${W + MARGIN * 2} / ${D + MARGIN * 2}` }}
      >
        <defs>
          <pattern id="mezzanine-hatch" width={0.35} height={0.35} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1={0} y1={0} x2={0} y2={0.35} strokeWidth={0.08} className="stroke-brand-500" />
          </pattern>
        </defs>
        <rect x={-W / 2} y={-D / 2} width={W} height={D} className="fill-brand-200" />

        {plan && (
          <g pointerEvents="none">
            <rect
              x={plan.slab.minX}
              y={plan.slab.minZ}
              width={plan.slab.maxX - plan.slab.minX}
              height={plan.slab.maxZ - plan.slab.minZ}
              fill="url(#mezzanine-hatch)"
              strokeWidth={0.06}
              className="stroke-brand-700"
            />
            <rect
              x={plan.stair.minX}
              y={plan.stair.minZ}
              width={plan.stair.maxX - plan.stair.minX}
              height={plan.stair.maxZ - plan.stair.minZ}
              strokeWidth={0.05}
              className="fill-brand-100 stroke-brand-700"
            />
            {treadLines.map((l, i) => (
              <line key={i} {...l} strokeWidth={0.025} className="stroke-brand-600" />
            ))}
          </g>
        )}

        {walls.map((w) => (
          <g key={w.id}>
            <line {...w} strokeWidth={WALL_STROKE} strokeLinecap="square" className={m?.wallId === w.id ? 'stroke-brand-900' : 'stroke-brand-700'} />
            {!locked && (
              <line
                {...w}
                strokeWidth={WALL_HIT_STROKE}
                stroke="transparent"
                className="cursor-copy"
                onClick={() => explain(editor.place(w.id, room))}
              >
                <title>{t('mezzanineEditorWallHint')}</title>
              </line>
            )}
          </g>
        ))}
      </svg>

      <p className="text-center text-xs text-brand-500">
        {locked ? t('mezzanineEditorLocked') : (notice ?? t(m ? 'mezzanineEditorMoveHint' : 'mezzanineEditorHint'))}
      </p>

      {m && !locked && (
        <div className="flex flex-col gap-2 rounded-md border border-brand-200 bg-white p-3 text-sm text-brand-800">
          <div className="flex items-center justify-between">
            <span className="font-medium">{t('mezzanineEditorSelected')}</span>
            <button
              type="button"
              onClick={() => {
                editor.remove();
                setNotice(null);
              }}
              className="text-xs text-red-700 hover:underline"
            >
              {t('mezzanineEditorRemove')}
            </button>
          </div>
          <MetresField label={t('mezzanineEditorDepth')} value={m.depth} onCommit={(v) => explain(editor.update({ depth: v }, room))} />
          <MetresField
            label={t('mezzanineEditorTop')}
            hint={t('mezzanineEditorTopHint')}
            value={m.top}
            onCommit={(v) => explain(editor.update({ top: v }, room))}
          />
          <div className="flex items-center justify-between gap-2">
            <span>{t('mezzanineEditorStairEnd')}</span>
            <div className="flex gap-1">
              {(['start', 'end'] as const).map((end) => (
                <button
                  key={end}
                  type="button"
                  onClick={() => explain(editor.update({ stairEnd: end }, room))}
                  className={`rounded-md border px-2 py-1 text-xs ${
                    m.stairEnd === end ? 'border-brand-700 bg-brand-700 text-white' : 'border-brand-300 text-brand-700 hover:bg-brand-100'
                  }`}
                >
                  {endLabel[end]}
                </button>
              ))}
            </div>
          </div>
          <p className="text-xs text-brand-500">
            {t('mezzanineEditorStairInfo', { steps: plan!.risers, run: stairRun(m.top).toFixed(1) })}
          </p>
        </div>
      )}
    </div>
  );
}
