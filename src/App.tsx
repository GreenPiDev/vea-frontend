import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { EXHIBITIONS } from "./components/3d/exhibitions";
import { ARTWORKS, type Artwork } from "./components/3d/artworks";
import type { ArtworkIconPosition } from "./components/3d/ArtworkIconProjector";
import { adaptApiExhibition, previewAccentColor } from "./components/3d/backendAdapter";
import { toFurnitureDef } from "./components/3d/furniture";
import type { SeatSpot } from "./components/3d/seating";
import ExhibitionSelect, { type ExhibitionCard } from "./components/ExhibitionSelect";
import ArtworkDetailCard from "./components/ArtworkDetailCard";
import GallerySceneCanvas from "./components/common/GallerySceneCanvas";
import FullscreenToggleButton from "./components/common/FullscreenToggleButton";
import LoadingScreen from "./components/common/LoadingScreen";
import Header from "./components/layout/Header";
import { useAuth } from "./lib/auth/AuthContext";
import { usePublicExhibitions, useExhibition } from "./lib/api/domains/exhibitions";
import { useFurnitureAssetsByOrganization } from "./lib/api/domains/furnitureAssets";
import { useRealtimeQuerySync } from "./lib/socket/useRealtimeQuerySync";
import { useExhibitionVisitorCount } from "./lib/socket/useExhibitionVisitorCount";
import { useMinimumLoadingTime, GALLERY_SCENE_MIN_LOADING_MS } from "./lib/useMinimumLoadingTime";
import { usePreloadImages } from "./lib/usePreloadImages";
import { enterMobileImmersive } from "./lib/mobileImmersive";
import { useForcedLandscape } from "./lib/useForcedLandscape";
import { isTouchPrimaryDevice } from "./lib/navigationMode";
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
  const [iconPositions, setIconPositions] = useState<ArtworkIconPosition[]>([]);
  const [selectedArtwork, setSelectedArtwork] = useState<Artwork | null>(null);
  const [nearestSeat, setNearestSeat] = useState<SeatSpot | null>(null);
  const [seatedSpot, setSeatedSpot] = useState<SeatSpot | null>(null);
  // Statik şablon sergiler (EXHIBITIONS) anında bulunduğu için hiçbir ağ
  // isteği beklemiyor — kart tıklamasıyla hemen `exhibition` dolduğundan,
  // sadece `backendId && backendLoading`'e bağlı eski kontrol bu sergiler
  // için hiç tetiklenmiyordu. Seçim anında true olup `exhibition` hazır
  // olunca otomatik false'a dönen bu bayrak, hem statik hem backend
  // sergilerinde kart tıklamasından sonra LoadingScreen'in garanti
  // gösterilmesini sağlıyor (bkz. useMinimumLoadingTime ile birleşimi altta).
  const [enteringExhibition, setEnteringExhibition] = useState(false);
  const canvasElRef = useRef<HTMLCanvasElement | null>(null);
  const exhibitionSelectScrollRef = useRef<HTMLDivElement | null>(null);
  // Whether the pointer was actually locked (player was walking) at the
  // moment the info card opened — only re-request pointer lock on close if
  // it was, so opening the card before ever clicking into the scene doesn't
  // force a lock the visitor never asked for.
  const pointerWasLockedRef = useRef(false);

  const forcedLandscape = useForcedLandscape();
  // Phones/tablets have no Enter key: sitting down/standing up gets an on-screen button instead.
  const [touchDevice] = useState(isTouchPrimaryDevice);
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
  const { data: furnitureAssets } = useFurnitureAssetsByOrganization(
    backendDetail?.exhibitionTemplate?.organizationId ?? null
  );

  const exhibition = useMemo(() => {
    if (localExhibition) return localExhibition;
    if (backendDetail) return adaptApiExhibition(backendDetail, (furnitureAssets ?? []).map(toFurnitureDef));
    return null;
  }, [localExhibition, backendDetail, furnitureAssets]);

  const exhibitionArtworks = useMemo(
    () => exhibition?.artworks ?? (exhibition ? ARTWORKS.filter((a) => a.exhibitionId === exhibition.id) : []),
    [exhibition]
  );

  // Preloaded outside the 3D canvas (see usePreloadImages's doc comment) so the loading
  // screen below can stay up until every painting's image is actually ready, instead of
  // the player spawning into a room where some walls are still visibly empty.
  const artworkImageUrls = useMemo(() => exhibitionArtworks.map((a) => a.image), [exhibitionArtworks]);
  const artworkImagesReady = usePreloadImages(artworkImageUrls);

  const showExhibitionLoadingScreen = useMinimumLoadingTime(
    (enteringExhibition && !exhibition) ||
      (Boolean(backendId) && backendLoading) ||
      (Boolean(exhibition) && !artworkImagesReady),
    GALLERY_SCENE_MIN_LOADING_MS
  );

  // Sergi hazır olur olmaz bayrağı indiriyor — aksi halde "← Sergiler" ile
  // seçiciye dönüldüğünde (`exhibition` tekrar null'a düşünce) bu bayrak
  // hâlâ true kalıp loading ekranını yanlışlıkla yeniden tetikleyebilirdi.
  useEffect(() => {
    if (exhibition) setEnteringExhibition(false);
  }, [exhibition]);

  // Stays null for the static demo exhibitions (their ids don't exist in
  // the backend, so ExhibitionGateway.handleJoin silently no-ops) — the HUD
  // badge below simply doesn't render in that case, no special-casing needed.
  const visitorCount = useExhibitionVisitorCount(exhibition?.id);

  // The closest in-range painting's "i" icon is drawn emphasized. (Paintings
  // open by clicking/tapping the painting or its "i" — there's deliberately
  // no keyboard shortcut for it; Enter/Space is the sit/stand key.)
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

  // Enter/Space state machine for sitting down / standing up. Pointer lock is
  // left untouched the whole time sitting: there's no real DOM UI to show a
  // cursor for, and mouse-look needs to stay active ("etrafı izleme serbest
  // kalır").
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (seatedSpot) {
        if (e.code === "Enter" || e.code === "Space" || e.code === "NumpadEnter" || e.code === "Escape") {
          e.preventDefault();
          setSeatedSpot(null);
        }
        return;
      }
      if (selectedArtwork || !nearestSeat) return;
      if (e.code !== "Enter" && e.code !== "Space" && e.code !== "NumpadEnter") return;
      e.preventDefault();
      setSeatedSpot(nearestSeat);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedArtwork, nearestSeat, seatedSpot]);

  // Escape deliberately does NOT close the open detail card — only its own
  // ✕ button does. Browsers disqualify an Escape keypress from ever being
  // a valid gesture for requestPointerLock() (it's reserved as the
  // always-available pointer-lock exit key), so closing via Escape could
  // never silently reacquire the lock like the ✕ click does — it would
  // always need an extra click, unlike ✕. Keeping the only close path be
  // one that's guaranteed to reacquire the lock avoids that inconsistency.

  // Strip the `?exhibition=` param after it's been read into state, so a
  // refresh/back-navigation doesn't keep re-selecting it.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).has("exhibition")) {
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  // Keeps selectedId in sync with the URL param on every change, not just
  // its initial value — selecting a card below navigates to
  // /exhibition/:id rather than calling setSelectedId directly, so the
  // address bar actually reflects which exhibition is open
  // (deep-linkable/shareable, same as ArtworkList.tsx's "on display" links
  // already relied on), and a browser-back from /exhibition/:id to /home
  // correctly drops back to the selector instead of leaving the 3D scene
  // mounted under a URL that no longer names an exhibition.
  const isInitialRouteSync = useRef(true);
  useEffect(() => {
    if (isInitialRouteSync.current) {
      isInitialRouteSync.current = false;
      return;
    }
    setSelectedId(routeExhibitionId ?? null);
  }, [routeExhibitionId]);

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
    if (showExhibitionLoadingScreen) {
      return <LoadingScreen />;
    }
    return (
      <>
        <Header scrollTargetRef={exhibitionSelectScrollRef} />
        <ExhibitionSelect
          exhibitions={backendCards}
          onSelect={(id) => {
            // Mobile: fullscreen + landscape must start inside this tap (browsers require a user gesture);
            // GallerySceneCanvas releases both when the visitor leaves the exhibition.
            void enterMobileImmersive();
            setEnteringExhibition(true);
            navigate(`/exhibition/${id}`);
          }}
          containerRef={exhibitionSelectScrollRef}
        />
      </>
    );
  }

  return (
    <div className={`app-root${forcedLandscape ? " force-landscape" : ""}`}>
      {/* Mounted as an overlay rather than gating GallerySceneCanvas's mount — the Canvas
          below has to actually start rendering for its paintings' textures to begin
          loading in the first place (see usePreloadImages's doc comment); hiding it until
          images are ready would create a deadlock where they never start loading. This
          sits on top (LoadingScreen's own fixed/z-[9999]) until artworkImagesReady flips,
          so the player never sees the empty-walled room underneath while that happens. */}
      {showExhibitionLoadingScreen && <LoadingScreen />}
      <GallerySceneCanvas
        exhibition={exhibition}
        overlayHidden={locked || Boolean(selectedArtwork)}
        onLockChange={setLocked}
        onIconPositionsChange={setIconPositions}
        onCanvasReady={(el) => (canvasElRef.current = el)}
        seatedSpot={seatedSpot}
        onNearestSeatChange={setNearestSeat}
        onArtworkClick={(id) => {
          const artwork = exhibitionArtworks.find((a) => a.id === id);
          if (artwork) openArtworkDetail(artwork);
        }}
      />

      {/* Rendered for every artwork (not just the currently-visible ones) so
          appearing/disappearing is a CSS opacity/scale transition rather than
          a mount/unmount pop. */}
      {!selectedArtwork &&
        iconPositions.map((p) => {
          const artwork = exhibitionArtworks.find((a) => a.id === p.id);
          if (!artwork) return null;
          const isNearest = nearestArtwork?.id === artwork.id;
          return (
            <button
              key={p.id}
              onClick={() => openArtworkDetail(artwork)}
              aria-label={t("artworkInfoIconLabel", { title: artwork.title })}
              tabIndex={p.visible ? 0 : -1}
              style={{ left: p.x, top: p.y }}
              // hover: variants only apply on devices with a real hover (Tailwind v4), so touch is unaffected.
              className={`group absolute z-40 flex -translate-x-1/2 -translate-y-1/2 cursor-pointer flex-col items-center gap-2 transition-[opacity,transform] duration-200 ease-out ${
                !p.visible
                  ? "pointer-events-none scale-90 opacity-0"
                  : isNearest
                    ? "scale-110 opacity-100 hover:scale-125"
                    : "scale-100 opacity-70 hover:scale-125 hover:opacity-100"
              }`}
            >
              <span
                className={`flex h-9 w-9 items-center justify-center rounded-full border shadow-md backdrop-blur-sm transition-[color,background-color,border-color,box-shadow] duration-200 group-hover:border-brand-100 group-hover:bg-brand-900/90 group-hover:shadow-lg ${
                  isNearest
                    ? "artwork-icon-ring animate-artwork-icon-breathe border-brand-200/80 bg-brand-950/70"
                    : "border-brand-200/30 bg-brand-950/50"
                }`}
              >
                <span className="font-serif text-[15px] italic leading-none text-brand-50">
                  i
                </span>
              </span>
            </button>
          );
        })}

      {!touchDevice && !selectedArtwork && !seatedSpot && nearestSeat && (
        <div className="fixed bottom-20 left-1/2 z-40 flex -translate-x-1/2 items-center gap-1 rounded-full border border-brand-200/20 bg-brand-950/80 px-2.5 py-1 text-[10px] font-medium uppercase tracking-wide text-brand-100 shadow-md">
          <span className="rounded-[4px] border border-brand-100/40 px-1 font-sans text-[9px] not-italic tracking-normal text-brand-50">
            ↵
          </span>
          {t("seatInteractHint")}
        </div>
      )}

      {!touchDevice && seatedSpot && (
        <div className="fixed bottom-20 left-1/2 z-40 flex -translate-x-1/2 items-center gap-1 rounded-full border border-brand-200/20 bg-brand-950/80 px-2.5 py-1 text-[10px] font-medium uppercase tracking-wide text-brand-100 shadow-md">
          <span className="rounded-[4px] border border-brand-100/40 px-1 font-sans text-[9px] not-italic tracking-normal text-brand-50">
            ↵ / Esc
          </span>
          {t("seatStandHint")}
        </div>
      )}

      {touchDevice && !selectedArtwork && (seatedSpot || nearestSeat) && (
        <button
          type="button"
          onClick={() => setSeatedSpot(seatedSpot ? null : nearestSeat)}
          className="fixed bottom-4 right-4 z-40 flex items-center gap-2 rounded-full border border-brand-200/30 bg-brand-950/75 px-5 py-3 text-sm font-medium uppercase tracking-wide text-brand-50 shadow-lg backdrop-blur-md active:scale-95"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M7 4v9h10M7 13v7M17 13v7M7 9h8a2 2 0 0 1 2 2v2" />
          </svg>
          {t(seatedSpot ? "seatStandHint" : "seatInteractHint")}
        </button>
      )}

      {selectedArtwork && (
        <ArtworkDetailCard
          artwork={selectedArtwork}
          exhibitionId={exhibition.id}
          onClose={closeArtworkDetail}
          fullscreen={touchDevice}
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
          {t("backToExhibitionSelect")}
        </button>
        <FullscreenToggleButton />
      </div>
    </div>
  );
}
