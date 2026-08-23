import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  useAddExhibitionArtwork,
  useOwnExhibition,
  useRemoveExhibitionArtwork,
  useUpdateExhibitionArtworkLink,
} from '../../lib/api/domains/exhibitions';
import { useOrganizationArtworks, type ApiArtwork } from '../../lib/api/domains/artworks';
import { groupByWallRun, wallRunsForSceneConfig } from '../3d/backendAdapter';
import { FLOOR_CLEARANCE, type WallRunGeometry } from '../3d/galleryLayout';
import { ApiError } from '../../lib/api/client';

/** Same formula placeArtworksAlongWall() falls back to when no curator override is set — used here only to pre-fill a sensible starting value in the height input, not as a hard default. */
function defaultHangHeight(artwork: ApiArtwork): number {
  return artwork.heightCm / 100 / 2 + FLOOR_CLEARANCE;
}

const NAMED_WALL_KEYS: Record<string, string> = {
  north: 'placementWallNorth',
  south: 'placementWallSouth',
  east: 'placementWallEast',
  west: 'placementWallWest',
};

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
  const [selectedWallId, setSelectedWallId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Draft height (meters, as typed text) per artworkId — covers both the
  // "not yet placed" add-flow rows and the "already placed" edit rows, keyed
  // the same way since an artwork is never in both lists at once.
  const [heightDrafts, setHeightDrafts] = useState<Record<string, string>>({});

  const runs = useMemo(
    () => (exhibition ? wallRunsForSceneConfig(exhibition.sceneConfig) : null),
    [exhibition]
  );
  const byWall = useMemo(() => groupByWallRun(exhibition?.artworkLinks ?? []), [exhibition]);
  const placedArtworkIds = useMemo(
    () => new Set((exhibition?.artworkLinks ?? []).map((link) => link.artworkId)),
    [exhibition]
  );

  if (isLoading) return null;

  if (!exhibition || !runs) {
    return <p className="text-sm text-brand-600">{t('placementUnavailable')}</p>;
  }

  const placedCount = placedArtworkIds.size;
  const isFull = exhibition.maxArtworks != null && placedCount >= exhibition.maxArtworks;

  // LISTED only — public list also includes IN_EXHIBITION artworks (already
  // showing somewhere else), which shouldn't be offered here as if free.
  const availableArtworks = isFull
    ? []
    : (orgArtworks ?? []).filter(
        (artwork) => artwork.status === 'LISTED' && !placedArtworkIds.has(artwork.id)
      );

  function wallLabel(run: WallRunGeometry & { id: string }): string {
    const namedKey = NAMED_WALL_KEYS[run.id];
    if (namedKey) return t(namedKey);
    const length = (run.end - run.start).toFixed(1);
    const orientation = t(run.orientation === 'horizontal' ? 'placementWallHorizontal' : 'placementWallVertical');
    return `${orientation} (${length}m)`;
  }

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
      onError: (err) => setError(err instanceof ApiError ? err.message : t('placementError')),
    });
  }

  function handleUpdateHeight(wallRunId: string, artworkId: string) {
    setError(null);
    const draft = heightDrafts[artworkId];
    const heightY = draft ? Number(draft) : undefined;
    updateArtworkLink.mutate(
      { artworkId, positionData: { wallRunId, heightY } },
      { onError: (err) => setError(err instanceof ApiError ? err.message : t('placementError')) }
    );
  }

  return (
    <div className="flex flex-col gap-4 rounded-lg bg-brand-50 p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-brand-900">{exhibition.title}</h3>
        <button onClick={onDone} className="rounded-md border border-brand-300 px-3 py-1.5 text-sm text-brand-700 hover:bg-brand-100">
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
            {wallLabel(run)} ({byWall.get(run.id)?.length ?? 0})
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
                  <span>{link.artwork.title}</span>
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
                    <button
                      onClick={() => handleUpdateHeight(selectedWallId, link.artworkId)}
                      disabled={updateArtworkLink.isPending}
                      className="text-brand-700 underline hover:text-brand-900 disabled:opacity-50"
                    >
                      {t('placementSaveHeight')}
                    </button>
                    <button
                      onClick={() => handleRemove(link.artworkId)}
                      disabled={removeArtwork.isPending}
                      className="text-red-600 underline hover:text-red-800 disabled:opacity-50"
                    >
                      {t('placementRemove')}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium text-brand-800">{t('placementAddArtwork')}</p>
            {isFull && <p className="text-xs text-red-600">{t('placementCapReached')}</p>}
            {!isFull && availableArtworks.length === 0 && (
              <p className="text-xs text-brand-600">{t('placementNoAvailableArtworks')}</p>
            )}
            <ul className="flex flex-col gap-1">
              {availableArtworks.map((artwork) => (
                <li key={artwork.id} className="flex items-center justify-between gap-2 rounded-md bg-white px-3 py-1.5 text-sm text-brand-900">
                  <span>
                    {artwork.title}
                    {artwork.artistProfile && (
                      <span className="ml-1 text-xs text-brand-500">
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
                    <button
                      onClick={() => handleAdd(artwork)}
                      disabled={addArtwork.isPending}
                      className="text-brand-700 underline hover:text-brand-900 disabled:opacity-50"
                    >
                      {t('placementAdd')}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
