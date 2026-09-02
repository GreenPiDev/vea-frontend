import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import Scene from "./components/3d/Scene";
import { EXHIBITIONS } from "./components/3d/exhibitions";
import { ARTWORKS, type Artwork } from "./components/3d/artworks";
import type { ArtworkIconPosition } from "./components/3d/ArtworkIconProjector";
import { adaptApiExhibition, previewAccentColor } from "./components/3d/backendAdapter";
import ExhibitionSelect, { type ExhibitionCard } from "./components/ExhibitionSelect";
import ArtworkDetailCard from "./components/ArtworkDetailCard";
import Header from "./components/layout/Header";
import { useAuth } from "./lib/auth/AuthContext";
import { usePublicExhibitions, useExhibition } from "./lib/api/domains/exhibitions";
import { useRealtimeQuerySync } from "./lib/socket/useRealtimeQuerySync";
import { useExhibitionVisitorCount } from "./lib/socket/useExhibitionVisitorCount";
import "./App.css";

export default function App() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  // /exhibition/:id (ArtworkList.tsx's "on display" links, opened in a new
  // tab) drops the artist straight into that exhibition's 3D scene. The
  // older `/?exhibition=<id>` query-param form is still read as a fallback
  // for any stale bookmarked links — read once on mount. The URL cleanup
  // (below, in an effect) is deliberately kept out of this initializer:
  // StrictMode double-invokes state initializers in dev, and a
  // read-then-strip side effect inside it would strip the query string on
  // the first invocation, then read nothing on the second — losing the id.
  const { id: routeExhibitionId } = useParams<{ id?: string }>();
  const [selectedId, setSelectedId] = useState<string | null>(
    () => routeExhibitionId ?? new URLSearchParams(window.location.search).get("exhibition")
  );
  const [locked, setLocked] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [iconPositions, setIconPositions] = useState<ArtworkIconPosition[]>([]);
  const [selectedArtwork, setSelectedArtwork] = useState<Artwork | null>(null);
  const canvasElRef = useRef<HTMLCanvasElement | null>(null);
  const exhibitionSelectScrollRef = useRef<HTMLDivElement | null>(null);
  // Whether the pointer was actually locked (player was walking) at the
  // moment the info card opened — only re-request pointer lock on close if
  // it was, so opening the card before ever clicking into the scene doesn't
  // force a lock the visitor never asked for.
  const pointerWasLockedRef = useRef(false);

  const { isAuthenticated } = useAuth();
  const { data: backendExhibitions } = usePublicExhibitions();
  useRealtimeQuerySync(isAuthenticated);

  // The static demo templates (EXHIBITIONS) are no longer offered on the
  // homepage selector or the exhibition-creation picker (see
  // ExhibitionForm.tsx) — org-scoped backend ExhibitionTemplates replaced
  // them as the "hazır şablon" source. This lookup stays only so that any
  // already-existing exhibition/bookmark built on one of those 4 static ids
  // (sceneConfig.kind:'template', templateId:'renaissance' etc.) keeps
  // rendering — see backendAdapter.ts's identical fallback.
  const localExhibition = useMemo(
    () => (selectedId ? (EXHIBITIONS.find((e) => e.id === selectedId) ?? null) : null),
    [selectedId]
  );
  const backendId = selectedId && !localExhibition ? selectedId : "";
  // Kept as a live query (not copied into local state once) so that if this
  // exhibition's cached detail is stale (e.g. fetched earlier before an
  // artwork was placed on it), the background refetch TanStack Query does
  // automatically still reaches the screen — a one-shot "adapt once on
  // fetch, then forget the query" effect would freeze on whatever data
  // happened to be cached at the moment of the first click.
  const { data: backendDetail, isLoading: backendLoading } = useExhibition(backendId);

  const exhibition = useMemo(() => {
    if (localExhibition) return localExhibition;
    if (backendDetail) return adaptApiExhibition(backendDetail);
    return null;
  }, [localExhibition, backendDetail]);

  // Stays null for the static demo exhibitions (their ids don't exist in
  // the backend, so ExhibitionGateway.handleJoin silently no-ops) — the HUD
  // badge below simply doesn't render in that case, no special-casing needed.
  const visitorCount = useExhibitionVisitorCount(exhibition?.id);

  const exhibitionArtworks = useMemo(
    () => exhibition?.artworks ?? (exhibition ? ARTWORKS.filter((a) => a.exhibitionId === exhibition.id) : []),
    [exhibition]
  );

  // Only the closest in-range painting responds to the interact key — with
  // several icons on screen at once (e.g. a row of paintings on one wall),
  // "which one does Enter open" needs to be unambiguous.
  const nearestArtwork = useMemo(() => {
    let nearest: { artwork: Artwork; distanceSq: number } | null = null;
    for (const pos of iconPositions) {
      if (!pos.visible) continue;
      if (nearest && pos.distanceSq >= nearest.distanceSq) continue;
      const artwork = exhibitionArtworks.find((a) => a.id === pos.id);
      if (artwork) nearest = { artwork, distanceSq: pos.distanceSq };
    }
    return nearest?.artwork ?? null;
  }, [iconPositions, exhibitionArtworks]);

  function openArtworkDetail(artwork: Artwork) {
    pointerWasLockedRef.current = locked;
    document.exitPointerLock();
    setSelectedArtwork(artwork);
  }

  function closeArtworkDetail() {
    setSelectedArtwork(null);
    if (pointerWasLockedRef.current) {
      canvasElRef.current?.requestPointerLock();
    }
  }

  // Interact key (Enter/Space) opens the nearest in-range painting's detail
  // card — the primary way in while pointer-locked (no visible cursor to
  // click the on-screen icon with). Clicking the icon itself still works
  // whenever the cursor happens to be visible (see the icon button below).
  useEffect(() => {
    if (selectedArtwork || !nearestArtwork) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== "Enter" && e.code !== "Space" && e.code !== "NumpadEnter") return;
      e.preventDefault();
      pointerWasLockedRef.current = locked;
      document.exitPointerLock();
      setSelectedArtwork(nearestArtwork);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedArtwork, nearestArtwork, locked]);

  // Escape closes the open detail card (in addition to its own ✕ button).
  useEffect(() => {
    if (!selectedArtwork) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== "Escape") return;
      closeArtworkDetail();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedArtwork]);

  useEffect(() => {
    const onChange = () => setIsFullscreen(document.fullscreenElement != null);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  // Strip the `?exhibition=` param after it's been read into state, so a
  // refresh/back-navigation doesn't keep re-selecting it.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).has("exhibition")) {
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  const backendCards: ExhibitionCard[] = useMemo(
    () =>
      (backendExhibitions ?? []).map((e) => ({
        id: e.id,
        name: e.title,
        subtitle: e.description ?? "",
        accent: previewAccentColor(e.sceneConfig),
      })),
    [backendExhibitions]
  );

  if (!exhibition) {
    // Either nothing picked yet, or a backend exhibition is still loading
    // (backendId set, backendDetail not in yet), or adaptation failed (e.g.
    // an unknown templateId) — all fall back to the selector.
    if (backendId && backendLoading) {
      return <div className="loading-indicator" />;
    }
    return (
      <>
        <Header scrollTargetRef={exhibitionSelectScrollRef} />
        <ExhibitionSelect
          exhibitions={backendCards}
          onSelect={setSelectedId}
          containerRef={exhibitionSelectScrollRef}
        />
      </>
    );
  }

  return (
    <div className="app-root">
      <Suspense fallback={<div className="loading-indicator" />}>
        <Scene
          key={exhibition.id}
          exhibition={exhibition}
          onLockChange={setLocked}
          onIconPositionsChange={setIconPositions}
          onCanvasReady={(el) => (canvasElRef.current = el)}
        />
      </Suspense>

      {!selectedArtwork &&
        iconPositions
          .filter((p) => p.visible)
          .map((p) => {
            const artwork = exhibitionArtworks.find((a) => a.id === p.id);
            if (!artwork) return null;
            const isNearest = nearestArtwork?.id === artwork.id;
            return (
              <button
                key={p.id}
                onClick={() => openArtworkDetail(artwork)}
                aria-label={t("artworkInfoIconLabel", { title: artwork.title })}
                style={{ left: p.x, top: p.y }}
                className={`absolute z-40 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1 ${
                  isNearest ? "scale-110" : "opacity-80"
                }`}
              >
                <span className="flex h-8 w-8 animate-pulse items-center justify-center rounded-full bg-brand-700/90 text-sm font-semibold text-white shadow-md">
                  i
                </span>
                {isNearest && (
                  <span className="rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
                    {t("artworkInteractHint")}
                  </span>
                )}
              </button>
            );
          })}

      {selectedArtwork && (
        <ArtworkDetailCard
          artwork={selectedArtwork}
          exhibitionId={exhibition.id}
          onClose={closeArtworkDetail}
        />
      )}

      {visitorCount !== null && (
        <div className="fixed right-3 top-3 z-40 flex items-center gap-1.5 rounded-md bg-black/55 px-3 py-1.5 text-sm font-medium text-white backdrop-blur">
          <span className="h-2 w-2 rounded-full bg-green-400" />
          {t("hudVisitorCount", { count: visitorCount })}
        </div>
      )}

      <div className="hud-controls">
        <button
          className="hud-button"
          onClick={() => {
            setLocked(false);
            setSelectedId(null);
            navigate("/home");
          }}
        >
          ← Sergiler
        </button>
        <button
          className="hud-button"
          onClick={() => {
            if (document.fullscreenElement) {
              document.exitFullscreen();
            } else {
              document.documentElement.requestFullscreen();
            }
          }}
        >
          {isFullscreen ? "⤡ Tam Ekrandan Çık" : "⤢ Tam Ekran"}
        </button>
      </div>

      <div className={`instructions-overlay ${locked || selectedArtwork ? "hidden" : ""}`}>
        <div className="instructions-card">
          <p className="instructions-title">{exhibition.name}</p>
          <p className="instructions-text">
            Galeride gezinmek için <strong>WASD</strong> tuşlarını, etrafa
            bakmak için <strong>mouse</strong>'u kullanın.
          </p>
          <p className="instructions-hint">Başlamak için tıklayın · Çıkmak için ESC</p>
        </div>
      </div>
    </div>
  );
}
