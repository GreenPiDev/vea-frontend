import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  useAddExhibitionArtwork,
  useOwnExhibition,
  useRemoveExhibitionArtwork,
  useSetExhibitionCoverArtwork,
  useUpdateExhibitionArtworkLink,
} from '../../lib/api/domains/exhibitions';
import { useOrganizationArtworks, type ApiArtwork } from '../../lib/api/domains/artworks';
import { groupByWallRun, wallRunsForSceneConfig } from '../3d/backendAdapter';
import { FLOOR_CLEARANCE } from '../3d/galleryLayout';
import { ApiError } from '../../lib/api/client';
import Tooltip from '../layout/Tooltip';
import { StarIcon, TrashIcon } from '../layout/icons';
import ConfirmModal from '../common/ConfirmModal';
import ExhibitionBlueprint from './ExhibitionBlueprint';

/** Same formula placeArtworksAlongWall() falls back to when no curator override is set — used here only to pre-fill a sensible starting value in the height input, not as a hard default. */
function defaultHangHeight(artwork: ApiArtwork): number {
  return artwork.heightCm / 100 / 2 + FLOOR_CLEARANCE;
}

interface ExhibitionArtworkPlacementProps {
  exhibitionId: string;
  onDone: () => void;
}

/**
 * Faz 3d: place an existing (already-created, Faz 3c) exhibition's artworks
 * onto its walls. Works regardless of the exhibition's status — a DRAFT
 * exhibition can be fully furnished before ever going public, an
 * ACTIVE/ENDED one can still be re-arranged (the backend doesn't block
 * either, see vea-api's addArtwork/removeArtwork).
 *
 * `useOwnExhibition` (GET /exhibitions/mine/:id), not `useExhibition`
 * (GET /exhibitions/:id) — the latter 404s a DRAFT exhibition even for its
 * owner, which would make this screen unusable before publishing.
 */
export default function ExhibitionArtworkPlacement({ exhibitionId, onDone }: ExhibitionArtworkPlacementProps) {
  const { t } = useTranslation();
  const { data: exhibition, isLoading } = useOwnExhibition(exhibitionId);
  const { data: orgArtworks } = useOrganizationArtworks();
  const addArtwork = useAddExhibitionArtwork(exhibitionId);
  const updateArtworkLink = useUpdateExhibitionArtworkLink(exhibitionId);
  const removeArtwork = useRemoveExhibitionArtwork(exhibitionId);
  const setCoverArtwork = useSetExhibitionCoverArtwork(exhibitionId);
  const [selectedWallId, setSelectedWallId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Draft height (meters, as typed text) per artworkId — covers both the
  // "not yet placed" add-flow rows and the "already placed" edit rows, keyed
  // the same way since an artwork is never in both lists at once.
  const [heightDrafts, setHeightDrafts] = useState<Record<string, string>>({});
  // Holds the artwork pending removal confirmation, not just its id — so the
  // ConfirmModal's message can interpolate its title without a second lookup.
  const [confirmRemove, setConfirmRemove] = useState<{ artworkId: string; title: string } | null>(null);
  const [isFinishing, setIsFinishing] = useState(false);

  const runs = useMemo(
    () => (exhibition ? wallRunsForSceneConfig(exhibition.sceneConfig, exhibition.exhibitionTemplate) : null),
    [exhibition]
  );
  const byWall = useMemo(() => groupByWallRun(exhibition?.artworkLinks ?? []), [exhibition]);
  const placedArtworkIds = useMemo(
    () => new Set((exhibition?.artworkLinks ?? []).map((link) => link.artworkId)),
    [exhibition]
  );

  if (isLoading) return null;

  if (!exhibition || !runs) {
    return <p className="text-sm text-brand-200">{t('placementUnavailable')}</p>;
  }

  const placedCount = placedArtworkIds.size;
  const isFull = exhibition.maxArtworks != null && placedCount >= exhibition.maxArtworks;

  // When the exhibition was pinned to a single artist at creation
  // (Exhibition.artistProfileId — see ExhibitionForm.tsx), narrow the picker
  // to just that artist's own artworks instead of the whole organization.
  // Artworks already placed *in this* exhibition are excluded here (they're
  // in the "placed on wall" list above instead) — everything else in this
  // org, LISTED or not, is a candidate for one of the two lists below.
  const pickerArtworks = (orgArtworks ?? []).filter(
    (artwork) =>
      !placedArtworkIds.has(artwork.id) &&
      (!exhibition.artistProfileId || artwork.artistProfileId === exhibition.artistProfileId)
  );
  // An artwork can only ever be placed in one exhibition at a time (backend
  // rejects a second placement, see vea-api's addArtwork) — exhibitionLinks
  // being non-empty here means "already in a *different* exhibition"
  // (this one's own links were already excluded via placedArtworkIds
  // above), so it's shown grayed out with that exhibition's title instead
  // of a silent omission or a confusing 409 on click.
  const placedElsewhereArtworks = pickerArtworks.filter(
    (artwork) => (artwork.exhibitionLinks?.length ?? 0) > 0
  );
  const availableArtworks = isFull
    ? []
    : pickerArtworks.filter(
        (artwork) => artwork.status === 'LISTED' && (artwork.exhibitionLinks?.length ?? 0) === 0
      );

  // Numbers each wall 1..N in the button row's order, matching the exact
  // order blueprintForSceneConfig()/ExhibitionBlueprint.tsx derives its own
  // wallRuns in (same underlying templateWallRuns/buildCustomRoomLayout
  // call, same inputs) — so a wall's number here is guaranteed to line up
  // with the same number drawn on the floor plan, without threading a
  // shared map through props.
  const wallNumbers = new Map(runs.map((run, i) => [run.id, i + 1]));

  function handleAdd(artwork: ApiArtwork) {
    if (!selectedWallId) return;
    setError(null);
    const order = byWall.get(selectedWallId)?.length ?? 0;
    const draft = heightDrafts[artwork.id];
    const heightY = draft ? Number(draft) : undefined;
    addArtwork.mutate(
      { artworkId: artwork.id, positionData: { wallRunId: selectedWallId, heightY }, order },
      { onError: (err) => setError(err instanceof ApiError ? err.message : t('placementError')) }
    );
  }

  function handleRemove(artworkId: string) {
    setError(null);
    removeArtwork.mutate(artworkId, {
      onSuccess: () => setConfirmRemove(null),
      onError: (err) => setError(err instanceof ApiError ? err.message : t('placementError')),
    });
  }

  // Toggle: clicking the cover of the already-set artwork clears it back to
  // "no explicit choice" (ExhibitionSelectCard.tsx's artworkLinks[0]
  // fallback), clicking any other placed artwork's star makes it the cover.
  function handleToggleCover(artworkId: string) {
    setError(null);
    const next = exhibition!.coverArtworkId === artworkId ? null : artworkId;
    setCoverArtwork.mutate(next, {
      onError: (err) => setError(err instanceof ApiError ? err.message : t('placementError')),
    });
  }

  // Flushes every typed-but-unsaved height draft for already-placed artworks
  // (favoriting/cover already saves immediately on click, see
  // handleToggleCover — only the height input is deferred), then leaves the
  // screen. No per-row save button needed anymore; "Bitti" is the one save
  // action for all pending height edits.
  async function handleDone() {
    setError(null);
    const pendingLinks = (exhibition!.artworkLinks ?? []).filter(
      (link) => heightDrafts[link.artworkId] !== undefined && link.positionData?.wallRunId
    );
    if (pendingLinks.length === 0) {
      onDone();
      return;
    }
    setIsFinishing(true);
    try {
      await Promise.all(
        pendingLinks.map((link) =>
          updateArtworkLink.mutateAsync({
            artworkId: link.artworkId,
            positionData: {
              wallRunId: link.positionData!.wallRunId,
              heightY: Number(heightDrafts[link.artworkId]),
            },
          })
        )
      );
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('placementError'));
    } finally {
      setIsFinishing(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 rounded-lg bg-brand-50 p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-brand-900">{exhibition.title}</h3>
        <button
          onClick={handleDone}
          disabled={isFinishing}
          className="rounded-md border border-brand-300 px-3 py-1.5 text-sm text-brand-700 hover:bg-brand-100 disabled:opacity-50"
        >
          {t('placementDone')}
        </button>
      </div>

      {exhibition.maxArtworks != null && (
        <p className={`text-sm ${isFull ? 'font-medium text-red-600' : 'text-brand-600'}`}>
          {t('placementCapCounter', { placed: placedCount, max: exhibition.maxArtworks })}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {runs.map((run) => (
          <button
            key={run.id}
            onClick={() => setSelectedWallId(run.id)}
            className={`rounded-md border px-3 py-1.5 text-sm ${
              selectedWallId === run.id
                ? 'border-brand-700 bg-brand-700 text-white'
                : 'border-brand-300 bg-white text-brand-800 hover:bg-brand-100'
            }`}
          >
            {t('placementWallNumber', { number: wallNumbers.get(run.id) })} ({byWall.get(run.id)?.length ?? 0})
          </button>
        ))}
      </div>

      {selectedWallId && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium text-brand-800">{t('placementPlacedOnWall')}</p>
            {(byWall.get(selectedWallId) ?? []).length === 0 && (
              <p className="text-xs text-brand-600">{t('placementNoneOnWall')}</p>
            )}
            <ul className="flex flex-col gap-1">
              {(byWall.get(selectedWallId) ?? []).map((link) => (
                <li key={link.id} className="flex items-center justify-between gap-2 rounded-md bg-white px-3 py-1.5 text-sm text-brand-900">
                  <span className="flex items-center gap-2">
                    <img
                      src={link.artwork.imageUrl}
                      alt=""
                      className="h-8 w-8 flex-shrink-0 rounded object-cover"
                    />
                    {link.artwork.title}
                  </span>
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-1 text-xs text-brand-700">
                      {t('placementHeightY')}
                      <input
                        type="number"
                        step="0.05"
                        min={0}
                        max={10}
                        value={heightDrafts[link.artworkId] ?? String(link.positionData?.heightY ?? defaultHangHeight(link.artwork))}
                        onChange={(e) => setHeightDrafts((prev) => ({ ...prev, [link.artworkId]: e.target.value }))}
                        className="w-16 rounded border border-brand-300 px-1.5 py-0.5 text-xs"
                      />
                    </label>
                    <Tooltip
                      label={exhibition.coverArtworkId === link.artworkId ? t('placementCoverActive') : t('placementSetCover')}
                      placement="top"
                    >
                      <button
                        onClick={() => handleToggleCover(link.artworkId)}
                        disabled={setCoverArtwork.isPending}
                        aria-label={exhibition.coverArtworkId === link.artworkId ? t('placementCoverActive') : t('placementSetCover')}
                        aria-pressed={exhibition.coverArtworkId === link.artworkId}
                        className={`flex h-8 w-8 items-center justify-center rounded-md border transition-colors disabled:opacity-50 ${
                          exhibition.coverArtworkId === link.artworkId
                            ? 'border-amber-400 bg-amber-50 text-amber-500'
                            : 'border-brand-300 text-brand-700 hover:bg-brand-100 hover:text-brand-900'
                        }`}
                      >
                        <StarIcon className="h-4 w-4" filled={exhibition.coverArtworkId === link.artworkId} />
                      </button>
                    </Tooltip>
                    <Tooltip label={t('placementRemove')} placement="top">
                      <button
                        onClick={() => setConfirmRemove({ artworkId: link.artworkId, title: link.artwork.title })}
                        disabled={removeArtwork.isPending}
                        aria-label={t('placementRemove')}
                        className="flex h-8 w-8 items-center justify-center rounded-md border border-brand-300 text-red-600 transition-colors hover:bg-red-50 hover:text-red-800 disabled:opacity-50"
                      >
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    </Tooltip>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium text-brand-800">{t('placementAddArtwork')}</p>
            {isFull && <p className="text-xs text-red-600">{t('placementCapReached')}</p>}
            {!isFull && availableArtworks.length === 0 && placedElsewhereArtworks.length === 0 && (
              <p className="text-xs text-brand-600">{t('placementNoAvailableArtworks')}</p>
            )}
            {/* Not-placed-anywhere artworks first (the ones a curator can
                actually add right now), placed-elsewhere ones last (grayed
                out, informational only) — swapped from insertion order so
                the actionable rows aren't buried below a long "already
                placed elsewhere" tail. */}
            <ul className="flex flex-col gap-1">
              {availableArtworks.map((artwork) => (
                <li key={artwork.id} className="flex items-center justify-between gap-2 rounded-md bg-white px-3 py-1.5 text-sm text-brand-900">
                  <span className="flex items-center gap-2">
                    <img
                      src={artwork.imageUrl}
                      alt=""
                      className="h-8 w-8 flex-shrink-0 rounded object-cover"
                    />
                    {artwork.title}
                    {artwork.artistProfile && (
                      <span className="text-xs text-brand-500">
                        {t('placementByArtist', { name: artwork.artistProfile.displayName })}
                      </span>
                    )}
                  </span>
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-1 text-xs text-brand-700">
                      {t('placementHeightY')}
                      <input
                        type="number"
                        step="0.05"
                        min={0}
                        max={10}
                        value={heightDrafts[artwork.id] ?? String(defaultHangHeight(artwork))}
                        onChange={(e) => setHeightDrafts((prev) => ({ ...prev, [artwork.id]: e.target.value }))}
                        className="w-16 rounded border border-brand-300 px-1.5 py-0.5 text-xs"
                      />
                    </label>
                    <Tooltip label={t('placementAdd')} placement="top">
                      <button
                        onClick={() => handleAdd(artwork)}
                        disabled={addArtwork.isPending}
                        aria-label={t('placementAdd')}
                        className="flex h-8 w-8 items-center justify-center rounded-md border border-brand-300 text-lg leading-none text-green-600 transition-colors hover:bg-green-50 hover:text-green-800 disabled:opacity-50"
                      >
                        +
                      </button>
                    </Tooltip>
                  </div>
                </li>
              ))}
              {placedElsewhereArtworks.map((artwork) => (
                <li
                  key={artwork.id}
                  className="flex items-center justify-between gap-2 rounded-md bg-white px-3 py-1.5 text-sm text-brand-400 opacity-50"
                >
                  <span className="flex items-center gap-2">
                    <img
                      src={artwork.imageUrl}
                      alt=""
                      className="h-8 w-8 flex-shrink-0 rounded object-cover"
                    />
                    {artwork.title}
                    <span className="text-xs">
                      {t('placementPlacedElsewhere', {
                        title: artwork.exhibitionLinks?.[0]?.exhibition.title ?? '',
                      })}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      {confirmRemove && (
        <ConfirmModal
          message={t('placementRemoveConfirm', { title: confirmRemove.title })}
          confirmLabel={t('placementRemove')}
          tone="danger"
          isSubmitting={removeArtwork.isPending}
          onConfirm={() => handleRemove(confirmRemove.artworkId)}
          onCancel={() => setConfirmRemove(null)}
        />
      )}

      <ExhibitionBlueprint
        sceneConfig={exhibition.sceneConfig}
        resolvedTemplate={exhibition.exhibitionTemplate}
        byWall={byWall}
        selectedWallId={selectedWallId}
        onSelectWall={setSelectedWallId}
      />
    </div>
  );
}
