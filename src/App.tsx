import { Suspense, useEffect, useMemo, useState } from "react";
import Scene from "./components/3d/Scene";
import { EXHIBITIONS } from "./components/3d/exhibitions";
import { adaptApiExhibition, previewAccentColor } from "./components/3d/backendAdapter";
import ExhibitionSelect, { type ExhibitionCard } from "./components/ExhibitionSelect";
import AuthBar from "./components/auth/AuthBar";
import ArtistPanel from "./components/panel/ArtistPanel";
import CuratorPanel from "./components/panel/CuratorPanel";
import { useAuth } from "./lib/auth/AuthContext";
import { usePublicExhibitions, useExhibition } from "./lib/api/domains/exhibitions";
import "./App.css";

const LOCAL_CARDS: ExhibitionCard[] = EXHIBITIONS.map((e) => ({
  id: e.id,
  name: e.name,
  subtitle: e.subtitle,
  accent: e.theme.spotColor,
}));

export default function App() {
  const [screen, setScreen] = useState<"gallery" | "panel">("gallery");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const { user } = useAuth();
  const { data: backendExhibitions } = usePublicExhibitions();

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

  useEffect(() => {
    const onChange = () => setIsFullscreen(document.fullscreenElement != null);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
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

  if (screen === "panel") {
    return user?.role === "ADMIN" ? (
      <CuratorPanel onBack={() => setScreen("gallery")} />
    ) : (
      <ArtistPanel onBack={() => setScreen("gallery")} />
    );
  }

  if (!exhibition) {
    // Either nothing picked yet, or a backend exhibition is still loading
    // (backendId set, backendDetail not in yet), or adaptation failed (e.g.
    // an unknown templateId) — all fall back to the selector.
    if (backendId && backendLoading) {
      return <div className="loading-indicator" />;
    }
    return (
      <>
        <AuthBar onOpenPanel={() => setScreen("panel")} />
        <ExhibitionSelect exhibitions={[...LOCAL_CARDS, ...backendCards]} onSelect={setSelectedId} />
      </>
    );
  }

  return (
    <div className="app-root">
      <Suspense fallback={<div className="loading-indicator" />}>
        <Scene key={exhibition.id} exhibition={exhibition} onLockChange={setLocked} />
      </Suspense>

      <div className="hud-controls">
        <button
          className="hud-button"
          onClick={() => {
            setLocked(false);
            setSelectedId(null);
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

      <div className={`instructions-overlay ${locked ? "hidden" : ""}`}>
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
