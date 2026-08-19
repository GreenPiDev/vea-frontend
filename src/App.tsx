import { Suspense, useEffect, useState } from "react";
import Scene from "./components/3d/Scene";
import { EXHIBITIONS, type Exhibition } from "./components/3d/exhibitions";
import { loadCustomExhibitions, saveCustomExhibitions } from "./components/3d/customExhibitions";
import ExhibitionSelect from "./components/ExhibitionSelect";
import ExhibitionBuilder from "./components/ExhibitionBuilder";
import "./App.css";

export default function App() {
  const [exhibition, setExhibition] = useState<Exhibition | null>(null);
  const [building, setBuilding] = useState(false);
  const [editingExhibition, setEditingExhibition] = useState<Exhibition | null>(null);
  const [customExhibitions, setCustomExhibitions] = useState<Exhibition[]>(loadCustomExhibitions);
  const [locked, setLocked] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const onChange = () => setIsFullscreen(document.fullscreenElement != null);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  function handleCreate(created: Exhibition) {
    const exists = customExhibitions.some((ex) => ex.id === created.id);
    const next = exists
      ? customExhibitions.map((ex) => (ex.id === created.id ? created : ex))
      : [...customExhibitions, created];
    setCustomExhibitions(next);
    saveCustomExhibitions(next);
    setBuilding(false);
    setEditingExhibition(null);
    setExhibition(created);
  }

  function handleDelete(id: string) {
    const next = customExhibitions.filter((ex) => ex.id !== id);
    setCustomExhibitions(next);
    saveCustomExhibitions(next);
  }

  if (building) {
    return (
      <ExhibitionBuilder
        editing={editingExhibition}
        onCancel={() => {
          setBuilding(false);
          setEditingExhibition(null);
        }}
        onCreate={handleCreate}
      />
    );
  }

  if (!exhibition) {
    return (
      <ExhibitionSelect
        exhibitions={[...EXHIBITIONS, ...customExhibitions]}
        onSelect={setExhibition}
        onCreateNew={() => {
          setEditingExhibition(null);
          setBuilding(true);
        }}
        onEdit={(ex) => {
          setEditingExhibition(ex);
          setBuilding(true);
        }}
        onDelete={handleDelete}
      />
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
            setExhibition(null);
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
