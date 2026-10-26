import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { CEILING_TEXTURES, FLOOR_TEXTURES, WALL_TEXTURES } from '../3d/surfaceTextures';
import {
  useExhibitionMutations,
  type ApiExhibition,
  type CustomSceneConfig,
  type TemplateSceneConfig,
} from '../../lib/api/domains/exhibitions';
import { useMyExhibitionTemplates } from '../../lib/api/domains/exhibitionTemplates';
import { useMyOrgArtists } from '../../lib/api/domains/organizations';
import { customBlueprint } from '../3d/backendAdapter';
import { ApiError } from '../../lib/api/client';
import TexturePicker from './TexturePicker';
import RoomGrid from './RoomGrid';
import CeilingLightEditor from './CeilingLightEditor';
import DateField from './DateField';
import { useRoomGridEditor } from './useRoomGridEditor';
import { useCeilingLightEditor } from './useCeilingLightEditor';
import './ExhibitionForm.css';

type RoomType = 'template' | 'custom';

interface ExhibitionFormProps {
  /** Present only when editing an already-created exhibition (PATCH instead of POST) — must come from useOwnExhibition so artworkLinks/sceneConfig are fully populated regardless of status. */
  editing?: ApiExhibition;
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
 *
 * Also doubles as the edit form (`editing` prop, PATCH /exhibitions/:id) —
 * same metadata fields, but the room (template choice, or a custom room's
 * cells/spawn) locks once at least one artwork is placed
 * (`editing.artworkLinks.length > 0`), same reasoning as
 * ExhibitionTemplateForm.tsx's isShapeLocked: swapping the room out from
 * under already-placed artworks would silently invalidate every
 * positionData.wallRunId they point at. A custom room's colors/textures/
 * wallHeight/ceiling lights stay editable regardless (cosmetic only).
 */
export default function ExhibitionForm({ editing, onDone }: ExhibitionFormProps) {
  const { t } = useTranslation();
  const { create, update } = useExhibitionMutations();
  const { data: orgArtists } = useMyOrgArtists();
  const { data: orgTemplates } = useMyExhibitionTemplates();
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState(editing?.title ?? '');
  const [description, setDescription] = useState(editing?.description ?? '');
  const [startDate, setStartDate] = useState(editing?.startDate.slice(0, 10) ?? '');
  const [endDate, setEndDate] = useState(editing?.endDate.slice(0, 10) ?? '');
  const [maxArtworks, setMaxArtworks] = useState(editing?.maxArtworks != null ? String(editing.maxArtworks) : '');
  const [artistProfileId, setArtistProfileId] = useState(editing?.artistProfileId ?? '');

  // Only artists who've actually created their ArtistProfile can be pinned
  // to an exhibition (Exhibition.artistProfileId references ArtistProfile,
  // not User) — an invited artist who hasn't finished onboarding yet has no
  // id to offer here.
  const eligibleArtists = (orgArtists ?? []).filter((artist) => artist.artistProfile);
  const [roomType, setRoomType] = useState<RoomType>(editing?.sceneConfig?.kind ?? 'template');
  const [templateId, setTemplateId] = useState(
    editing?.sceneConfig?.kind === 'template' ? editing.sceneConfig.templateId : ''
  );
  const hasOrgTemplates = (orgTemplates?.length ?? 0) > 0;

  // Defaults to the org's first template once the list loads — there's no
  // static fallback anymore (the built-in demo templates were removed from
  // this picker; see project_exhibition_templates memory), so an org with
  // no templates yet simply has nothing pre-selected here. Skipped once
  // editing, so an edited exhibition's already-chosen template isn't
  // silently swapped out for the org's first one.
  useEffect(() => {
    if (!editing && !templateId && orgTemplates && orgTemplates.length > 0) setTemplateId(orgTemplates[0].id);
  }, [editing, orgTemplates, templateId]);

  const customConfig = editing?.sceneConfig?.kind === 'custom' ? editing.sceneConfig : null;
  const [wallHeight, setWallHeight] = useState(customConfig?.wallHeight ?? 6);
  const [wallColor, setWallColor] = useState(customConfig?.wallColor ?? '#efe4cf');
  const [floorColor, setFloorColor] = useState(customConfig?.floorColor ?? '#8a6a45');
  const [ceilingColor, setCeilingColor] = useState(customConfig?.ceilingColor ?? '#f7f0e0');
  const [floorTextureId, setFloorTextureId] = useState<string | undefined>(customConfig?.textureIds?.floor);
  const [wallTextureId, setWallTextureId] = useState<string | undefined>(customConfig?.textureIds?.wall);
  const [ceilingTextureId, setCeilingTextureId] = useState<string | undefined>(customConfig?.textureIds?.ceiling);
  const grid = useRoomGridEditor(customConfig ? { cells: customConfig.cells, spawn: customConfig.spawn } : undefined);
  const { spawnCell, spawnYaw, floorCellList } = grid;
  const ceilingLights = useCeilingLightEditor(customConfig?.ceilingLights);

  // Locked once the exhibition has at least one placed artwork — see this
  // component's doc comment above. Enforced here only (UI convenience); the
  // backend doesn't reject a room change on a placed exhibition the way it
  // does for ExhibitionTemplate, so this is the one place that protects
  // existing placements from a silently-broken wallRunId.
  const isRoomLocked = (editing?.artworkLinks?.length ?? 0) > 0;

  const canSubmit = isRoomLocked || (roomType === 'custom' ? grid.canSubmit : Boolean(templateId));

  // Live floor-plan preview for CeilingLightEditor.tsx — same approach as
  // ExhibitionTemplateForm.tsx's liveBlueprint, built from this form's own
  // in-progress grid state, not a round-tripped API response. Room-locked
  // custom rooms use the stored cells/spawn (same values handleSubmit
  // echoes back unchanged) instead of the grid editor's state, since that
  // editor isn't rendered at all while locked.
  const liveBlueprint = useMemo(() => {
    if (roomType !== 'custom') return null;
    if (isRoomLocked && customConfig) return customBlueprint(customConfig.cells, 1, customConfig.spawn);
    if (!grid.canSubmit) return null;
    return customBlueprint(floorCellList, 1, { x: spawnCell!.x, z: spawnCell!.z, yaw: spawnYaw });
  }, [roomType, isRoomLocked, customConfig, grid.canSubmit, floorCellList, spawnCell, spawnYaw]);

  const isPending = create.isPending || update.isPending;

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    // Room-locked: echo back the exact stored shape fields (cells/spawn, or
    // the template's own id) unchanged — only the cosmetic custom-room
    // fields (wallHeight/colors/textures/ceilingLights) and the metadata
    // above can actually differ. See this component's doc comment.
    const sceneConfig: TemplateSceneConfig | CustomSceneConfig =
      roomType === 'template'
        ? { kind: 'template', templateId: isRoomLocked ? (editing!.sceneConfig as TemplateSceneConfig).templateId : templateId }
        : {
            kind: 'custom',
            cells: isRoomLocked ? customConfig!.cells : floorCellList,
            wallHeight,
            wallColor,
            floorColor,
            ceilingColor,
            textureIds: { floor: floorTextureId, wall: wallTextureId, ceiling: ceilingTextureId },
            spawn: isRoomLocked ? customConfig!.spawn : { x: spawnCell!.x, z: spawnCell!.z, yaw: spawnYaw },
            ceilingLights: ceilingLights.lights,
          };

    const payload = {
      title,
      description: description || undefined,
      startDate,
      endDate,
      maxArtworks: maxArtworks ? Number(maxArtworks) : undefined,
      // Editing can explicitly clear a solo-show artist back to "mixed/
      // group show" (null); creation has nothing to clear yet, so an empty
      // pick there just omits the field.
      artistProfileId: artistProfileId || (editing ? null : undefined),
      sceneConfig,
    };

    const onError = (err: unknown) => setError(err instanceof ApiError ? err.message : t('exhibitionFormError'));
    if (editing) {
      update.mutate({ id: editing.id, updates: payload }, { onSuccess: onDone, onError });
    } else {
      create.mutate(payload, { onSuccess: onDone, onError });
    }
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
        <DateField id="exhibition-start-date" label={t('exhibitionFormStartDate')} value={startDate} onChange={setStartDate} required />
        <DateField id="exhibition-end-date" label={t('exhibitionFormEndDate')} value={endDate} onChange={setEndDate} required />
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

      {isRoomLocked ? (
        <p className="rounded-md border border-brand-300 bg-brand-100 px-3 py-2 text-sm text-brand-800">
          {t('exhibitionFormRoomLocked', { count: editing!.artworkLinks!.length })}
        </p>
      ) : (
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
      )}

      {roomType === 'template' && (
        isRoomLocked ? (
          <p className="text-sm text-brand-700">
            {editing?.exhibitionTemplate?.name ?? templateId}
          </p>
        ) : hasOrgTemplates ? (
          <label className="flex flex-col gap-1 text-sm text-brand-800">
            {t('exhibitionFormTemplateLabel')}
            <select
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
              className="rounded-md border border-brand-300 bg-white px-3 py-2 text-sm text-brand-900 outline-none focus:border-brand-500"
            >
              {orgTemplates!.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                  {template.subtitle ? ` — ${template.subtitle}` : ''}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <p className="rounded-md border border-brand-300 bg-brand-100 px-3 py-2 text-sm text-brand-800">
            {t('exhibitionFormNoTemplatesHint')}
          </p>
        )
      )}

      {roomType === 'custom' && (
        <div className="flex flex-col gap-3">
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

          {!isRoomLocked && <RoomGrid editor={grid} wallColor={wallColor} />}
          <CeilingLightEditor blueprint={liveBlueprint} editor={ceilingLights} />
        </div>
      )}

      <div className="mt-2 flex gap-2">
        <button
          type="submit"
          disabled={isPending || !canSubmit}
          className="rounded-md bg-brand-700 px-3 py-2 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-50"
        >
          {isPending ? t('exhibitionFormSaving') : editing ? t('exhibitionFormSubmitUpdate') : t('exhibitionFormSubmitCreate')}
        </button>
        <button type="button" onClick={onDone} className="rounded-md border border-brand-300 px-3 py-2 text-sm text-brand-700 hover:bg-brand-100">
          {t('exhibitionFormCancel')}
        </button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  );
}
