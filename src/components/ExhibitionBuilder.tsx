import { useEffect, useMemo, useRef, useState } from "react";
import {
  buildCustomRoomLayout,
  WALL_CLEARANCE,
  type CustomWallRun,
  type GridCell,
} from "../components/3d/galleryLayout";
import { ARTWORKS, type Artwork } from "../components/3d/artworks";
import type { Exhibition } from "../components/3d/exhibitions";
import {
  CEILING_TEXTURES,
  FLOOR_TEXTURES,
  WALL_TEXTURES,
  type SurfaceTexture,
} from "../components/3d/surfaceTextures";
import "./ExhibitionBuilder.css";

const DEFAULT_COLS = 20;
const DEFAULT_ROWS = 14;
const MIN_GRID = 6;
const MAX_GRID = 40;
const CELL_PX = 26;

function clampGrid(v: number): number {
  return Math.min(MAX_GRID, Math.max(MIN_GRID, Math.round(v) || MIN_GRID));
}

// Every custom-exhibition painting hangs with the same floor-to-frame-bottom
// gap, regardless of its own height, so a room never looks like paintings are
// floating at random heights. Ceiling height must clear a painting's own
// height plus this same gap plus headroom above the frame — see
// minCeilingFor() below, used for both the live hint and the actual clamp in
// handleFinish().
const FLOOR_CLEARANCE = 0.57;
const CEILING_HEADROOM = 0.73;
const MIN_CEILING_MARGIN = FLOOR_CLEARANCE + CEILING_HEADROOM; // 1.2

function minCeilingFor(paintingHeight: number): number {
  return paintingHeight + MIN_CEILING_MARGIN;
}

type Step = "draw" | "place";

function TexturePicker({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: SurfaceTexture[];
  value: string | undefined;
  onChange: (id: string | undefined) => void;
}) {
  return (
    <div className="builder-texture-picker">
      <span className="builder-texture-picker-label">{label}</span>
      <div className="builder-texture-swatches">
        <button
          type="button"
          className={`builder-texture-swatch builder-texture-swatch-none ${value ? "" : "active"}`}
          onClick={() => onChange(undefined)}
          title="Düz renk kullan"
        >
          ✕
        </button>
        {options.map((t) => (
          <button
            type="button"
            key={t.id}
            className={`builder-texture-swatch ${value === t.id ? "active" : ""}`}
            onClick={() => onChange(t.id)}
            title={t.label}
          >
            <img src={t.thumbnail} alt={t.label} loading="lazy" />
          </button>
        ))}
      </div>
    </div>
  );
}

interface ExhibitionBuilderProps {
  onCancel: () => void;
  onCreate: (exhibition: Exhibition) => void;
  /** When set, the builder opens pre-filled with this exhibition's saved state and overwrites it on finish instead of creating a new one. */
  editing?: Exhibition | null;
}

export default function ExhibitionBuilder({ onCancel, onCreate, editing }: ExhibitionBuilderProps) {
  const source = editing?.builderSource;
  const [step, setStep] = useState<Step>("draw");
  const [name, setName] = useState(source?.name ?? "Yeni Sergim");
  const [wallHeight, setWallHeight] = useState(source?.wallHeight ?? 6);
  const [wallColor, setWallColor] = useState(source?.wallColor ?? "#efe4cf");
  const [floorColor, setFloorColor] = useState(source?.floorColor ?? "#8a6a45");
  const [ceilingColor, setCeilingColor] = useState(source?.ceilingColor ?? "#f7f0e0");
  const [floorTextureId, setFloorTextureId] = useState<string | undefined>(source?.floorTextureId);
  const [wallTextureId, setWallTextureId] = useState<string | undefined>(source?.wallTextureId);
  const [ceilingTextureId, setCeilingTextureId] = useState<string | undefined>(
    source?.ceilingTextureId
  );
  const [cells, setCells] = useState<Set<string>>(
    () => new Set((source?.cells ?? []).map((c) => `${c.x},${c.z}`))
  );
  const [gridCols, setGridCols] = useState(() => {
    const maxX = source?.cells.length ? Math.max(...source.cells.map((c) => c.x)) + 1 : 0;
    return clampGrid(Math.max(DEFAULT_COLS, maxX + 2));
  });
  const [gridRows, setGridRows] = useState(() => {
    const maxZ = source?.cells.length ? Math.max(...source.cells.map((c) => c.z)) + 1 : 0;
    return clampGrid(Math.max(DEFAULT_ROWS, maxZ + 2));
  });
  const [placements, setPlacements] = useState<Record<string, string>>(source?.placements ?? {});
  const [selectedWallId, setSelectedWallId] = useState<string | null>(null);
  const [spawnCell, setSpawnCell] = useState<GridCell | null>(
    source?.spawn ? { x: source.spawn.x, z: source.spawn.z } : null
  );
  const [spawnYaw, setSpawnYaw] = useState(source?.spawn?.yaw ?? 0);
  const [pickingSpawn, setPickingSpawn] = useState(false);
  const paintValue = useRef(true);
  const painting = useRef(false);

  // A spawn point painted over/erased no longer sits on real floor — drop it
  // so the player can never spawn inside a wall or outside the room.
  useEffect(() => {
    if (spawnCell && !cells.has(`${spawnCell.x},${spawnCell.z}`)) {
      setSpawnCell(null);
    }
  }, [cells, spawnCell]);

  const requiredCeiling = useMemo(() => {
    const heights = Object.values(placements)
      .map((id) => ARTWORKS.find((a) => a.id === id)?.height)
      .filter((h): h is number => h != null);
    if (heights.length === 0) return null;
    return minCeilingFor(Math.max(...heights));
  }, [placements]);

  const cellList: GridCell[] = useMemo(
    () =>
      Array.from(cells).map((s) => {
        const [x, z] = s.split(",").map(Number);
        return { x, z };
      }),
    [cells]
  );

  const { wallRuns } = useMemo(() => {
    if (cellList.length === 0) return { wallRuns: [] as CustomWallRun[] };
    return buildCustomRoomLayout(cellList, wallHeight);
  }, [cellList, wallHeight]);

  function handleGridColsChange(value: number) {
    const cols = clampGrid(value);
    setGridCols(cols);
    setCells((prev) => new Set([...prev].filter((k) => Number(k.split(",")[0]) < cols)));
  }

  function handleGridRowsChange(value: number) {
    const rows = clampGrid(value);
    setGridRows(rows);
    setCells((prev) => new Set([...prev].filter((k) => Number(k.split(",")[1]) < rows)));
  }

  function toggleCell(x: number, z: number, value: boolean) {
    const key = `${x},${z}`;
    setCells((prev) => {
      const has = prev.has(key);
      if (value === has) return prev;
      const next = new Set(prev);
      if (value) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  function handleCellDown(x: number, z: number) {
    if (pickingSpawn) {
      if (cells.has(`${x},${z}`)) {
        setSpawnCell({ x, z });
        setPickingSpawn(false);
      }
      return;
    }
    const key = `${x},${z}`;
    const willAdd = !cells.has(key);
    paintValue.current = willAdd;
    painting.current = true;
    toggleCell(x, z, willAdd);
  }

  function handleCellEnter(x: number, z: number) {
    if (!painting.current) return;
    toggleCell(x, z, paintValue.current);
  }

  function assignArtwork(artworkId: string) {
    if (!selectedWallId) return;
    setPlacements((prev) => ({ ...prev, [selectedWallId]: artworkId }));
  }

  function clearAssignment() {
    if (!selectedWallId) return;
    setPlacements((prev) => {
      const next = { ...prev };
      delete next[selectedWallId];
      return next;
    });
  }

  function handleFinish() {
    if (!spawnCell) return;
    const { layout, wallRuns: finalRuns } = buildCustomRoomLayout(cellList, wallHeight, {
      x: spawnCell.x,
      z: spawnCell.z,
      yaw: spawnYaw,
    });
    const artworks: Artwork[] = [];

    for (const run of finalRuns) {
      const artworkId = placements[run.id];
      if (!artworkId) continue;
      const template = ARTWORKS.find((a) => a.id === artworkId);
      if (!template) continue;

      const runLength = run.end - run.start;
      const maxWidth = Math.max(0.6, runLength - 2 * WALL_CLEARANCE - 0.4);
      let height = template.height;
      if (height * template.aspect > maxWidth) height = maxWidth / template.aspect;
      height = Math.min(height, wallHeight - MIN_CEILING_MARGIN);
      const hangCenterY = height / 2 + FLOOR_CLEARANCE;
      const interior = -run.outward;

      let x: number;
      let z: number;
      let rotationY: number;
      if (run.orientation === "horizontal") {
        x = (run.start + run.end) / 2;
        z = run.fixed + interior * WALL_CLEARANCE;
        rotationY = run.outward === -1 ? 0 : Math.PI;
      } else {
        x = run.fixed + interior * WALL_CLEARANCE;
        z = (run.start + run.end) / 2;
        rotationY = run.outward === -1 ? Math.PI / 2 : -Math.PI / 2;
      }

      artworks.push({
        id: `${run.id}-${template.id}`,
        title: template.title,
        artist: template.artist,
        year: template.year,
        exhibitionId: "custom",
        image: template.image,
        aspect: template.aspect,
        height,
        frame: template.frame,
        position: [x, hangCenterY, z],
        rotationY,
      });
    }

    const exhibition: Exhibition = {
      id: editing?.id ?? `custom-${Date.now()}`,
      name: name.trim() || "Adsız Sergi",
      subtitle: "Kullanıcı tarafından oluşturuldu",
      wallHeight,
      custom: true,
      customLayout: layout,
      artworks,
      builderSource: {
        name: name.trim() || "Adsız Sergi",
        wallHeight,
        wallColor,
        floorColor,
        ceilingColor,
        floorTextureId,
        wallTextureId,
        ceilingTextureId,
        cells: cellList,
        placements,
        spawn: { x: spawnCell.x, z: spawnCell.z, yaw: spawnYaw },
      },
      theme: {
        wallColor,
        wallRoughness: 0.85,
        floorColor,
        floorRoughness: 0.35,
        floorMetalness: 0.05,
        ceilingColor,
        fogColor: floorColor,
        backgroundColor: wallColor,
        ambientColor: "#fff4e0",
        ambientIntensity: 0.42,
        hemisphereSkyColor: "#ffffff",
        hemisphereGroundColor: floorColor,
        spotColor: "#fff4e0",
        spotIntensity: 22,
        floorTextureId,
        wallTextureId,
        ceilingTextureId,
      },
    };

    onCreate(exhibition);
  }

  return (
    <div className="builder-root" onMouseUp={() => (painting.current = false)}>
      <div className="builder-header">
        <p className="builder-title">Özel Sergi Oluştur</p>
        <button className="builder-cancel" onClick={onCancel}>
          ✕ Vazgeç
        </button>
      </div>

      {step === "draw" && (
        <div className="builder-body">
          <div className="builder-panel">
            <label className="builder-field">
              <span>Sergi Adı</span>
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
            </label>
            <div className="builder-field builder-field-row">
              <label className="builder-field">
                <span>Izgara Genişliği (m)</span>
                <input
                  type="number"
                  min={MIN_GRID}
                  max={MAX_GRID}
                  step={1}
                  value={gridCols}
                  onChange={(e) => handleGridColsChange(Number(e.target.value))}
                />
              </label>
              <label className="builder-field">
                <span>Izgara Derinliği (m)</span>
                <input
                  type="number"
                  min={MIN_GRID}
                  max={MAX_GRID}
                  step={1}
                  value={gridRows}
                  onChange={(e) => handleGridRowsChange(Number(e.target.value))}
                />
              </label>
            </div>
            <p className="builder-hint">
              Izgarayı küçültürseniz sınırların dışında kalan boyalı kareler silinir.
            </p>
            <label className="builder-field">
              <span>Tavan Yüksekliği (metre)</span>
              <input
                type="number"
                min={2.5}
                max={20}
                step={0.5}
                value={wallHeight}
                onChange={(e) => setWallHeight(Number(e.target.value) || 6)}
              />
              {requiredCeiling != null && (
                <span className={`builder-ceiling-hint ${wallHeight < requiredCeiling ? "warn" : ""}`}>
                  Yerleştirdiğiniz tablolar için en az {requiredCeiling.toFixed(1)} m tavan
                  yüksekliği olmalı.
                </span>
              )}
            </label>
            <label className="builder-field builder-field-color">
              <span>Duvar Rengi</span>
              <input type="color" value={wallColor} onChange={(e) => setWallColor(e.target.value)} />
            </label>
            <TexturePicker
              label="Duvar Dokusu"
              options={WALL_TEXTURES}
              value={wallTextureId}
              onChange={setWallTextureId}
            />
            <label className="builder-field builder-field-color">
              <span>Zemin Rengi</span>
              <input type="color" value={floorColor} onChange={(e) => setFloorColor(e.target.value)} />
            </label>
            <TexturePicker
              label="Zemin Dokusu"
              options={FLOOR_TEXTURES}
              value={floorTextureId}
              onChange={setFloorTextureId}
            />
            <label className="builder-field builder-field-color">
              <span>Tavan Rengi</span>
              <input
                type="color"
                value={ceilingColor}
                onChange={(e) => setCeilingColor(e.target.value)}
              />
            </label>
            <TexturePicker
              label="Tavan Dokusu"
              options={CEILING_TEXTURES}
              value={ceilingTextureId}
              onChange={setCeilingTextureId}
            />
            <p className="builder-hint">
              Bir doku seçerseniz o yüzeyde gerçek fotoğraf malzeme (parke, mermer, tuğla vb.)
              kullanılır; seçmezseniz düz renk kullanılır. Işıklandırma otomatik ayarlanır.
            </p>
            <p className="builder-hint">
              Zemini kareler halinde boyayarak salonunuzun şeklini çizin. Boyalı bir kareye
              tekrar tıklamak onu siler.
            </p>

            <div className="builder-spawn-panel">
              <span className="builder-spawn-panel-label">Başlangıç Noktası</span>
              <button
                className={`builder-back ${pickingSpawn ? "active" : ""}`}
                disabled={cells.size === 0}
                onClick={() => setPickingSpawn((v) => !v)}
              >
                {pickingSpawn
                  ? "Izgarada bir kareye tıklayın…"
                  : spawnCell
                    ? "📍 Konumu Değiştir"
                    : "📍 Konumu Seç"}
              </button>
              {spawnCell && (
                <>
                  <span className="builder-spawn-panel-label">Bakış Yönü</span>
                  <div className="builder-direction-pad">
                    <button
                      className={spawnYaw === 0 ? "active" : ""}
                      style={{ gridArea: "n" }}
                      onClick={() => setSpawnYaw(0)}
                      title="Yukarı"
                    >
                      ▲
                    </button>
                    <button
                      className={spawnYaw === Math.PI / 2 ? "active" : ""}
                      style={{ gridArea: "w" }}
                      onClick={() => setSpawnYaw(Math.PI / 2)}
                      title="Sola"
                    >
                      ◄
                    </button>
                    <button
                      className={spawnYaw === -Math.PI / 2 ? "active" : ""}
                      style={{ gridArea: "e" }}
                      onClick={() => setSpawnYaw(-Math.PI / 2)}
                      title="Sağa"
                    >
                      ►
                    </button>
                    <button
                      className={spawnYaw === Math.PI ? "active" : ""}
                      style={{ gridArea: "s" }}
                      onClick={() => setSpawnYaw(Math.PI)}
                      title="Aşağı"
                    >
                      ▼
                    </button>
                  </div>
                </>
              )}
              <p className="builder-hint">
                Mavi ok, sergiye girdiğinizde nerede ve hangi yöne bakarak başlayacağınızı
                gösterir.
              </p>
            </div>

            <button
              className="builder-primary"
              disabled={cells.size === 0 || !spawnCell}
              onClick={() => setStep("place")}
            >
              Devam Et: Tabloları Yerleştir →
            </button>
          </div>

          <div
            className="builder-grid"
            style={{ gridTemplateColumns: `repeat(${gridCols}, ${CELL_PX}px)` }}
          >
            {Array.from({ length: gridRows }).map((_, z) =>
              Array.from({ length: gridCols }).map((_, x) => {
                const filled = cells.has(`${x},${z}`);
                return (
                  <div
                    key={`${x},${z}`}
                    className={`builder-cell ${filled ? "filled" : ""} ${
                      pickingSpawn && filled ? "pickable" : ""
                    }`}
                    style={filled ? { background: floorColor } : undefined}
                    onMouseDown={() => handleCellDown(x, z)}
                    onMouseEnter={() => handleCellEnter(x, z)}
                  />
                );
              })
            )}
            {spawnCell && (
              <div
                className="builder-spawn"
                style={{
                  left: spawnCell.x * CELL_PX,
                  top: spawnCell.z * CELL_PX,
                  transform: `rotate(${(-spawnYaw * 180) / Math.PI}deg)`,
                }}
                title="Başlangıç konumu ve bakış yönü"
              >
                ▲
              </div>
            )}
          </div>
        </div>
      )}

      {step === "place" && (
        <div className="builder-body">
          <div className="builder-panel">
            <button className="builder-back" onClick={() => setStep("draw")}>
              ← Taban Çizimine Dön
            </button>
            <p className="builder-hint">
              Bir duvarı (kalın çizgi) seçin, ardından sağdaki listeden bir tablo seçerek o
              duvara asın.
            </p>
            {selectedWallId ? (
              <>
                <p className="builder-selected-wall">Seçili duvar: {selectedWallId}</p>
                {placements[selectedWallId] && (
                  <button className="builder-back" onClick={clearAssignment}>
                    Tabloyu Kaldır
                  </button>
                )}
                <div className="builder-artwork-list">
                  {ARTWORKS.map((a) => (
                    <button
                      key={a.id}
                      className={`builder-artwork-item ${
                        placements[selectedWallId] === a.id ? "active" : ""
                      }`}
                      onClick={() => assignArtwork(a.id)}
                    >
                      <img src={a.image} alt="" />
                      <span>
                        <strong>{a.title}</strong>
                        <em>{a.artist}</em>
                        <small
                          className={wallHeight < minCeilingFor(a.height) ? "warn" : ""}
                        >
                          en az {minCeilingFor(a.height).toFixed(1)} m tavan
                        </small>
                      </span>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <p className="builder-hint">Henüz bir duvar seçilmedi.</p>
            )}
            <button className="builder-primary" onClick={handleFinish}>
              Sergiyi Oluştur ve Gir →
            </button>
          </div>

          <div
            className="builder-grid builder-grid-place"
            style={{ gridTemplateColumns: `repeat(${gridCols}, ${CELL_PX}px)` }}
          >
            {Array.from({ length: gridRows }).map((_, z) =>
              Array.from({ length: gridCols }).map((_, x) => {
                const filled = cells.has(`${x},${z}`);
                return (
                  <div
                    key={`${x},${z}`}
                    className={`builder-cell ${filled ? "filled" : ""}`}
                    style={filled ? { background: floorColor } : undefined}
                  />
                );
              })
            )}
            {wallRuns.map((run) => {
              const isHorizontal = run.orientation === "horizontal";
              const style = isHorizontal
                ? {
                    left: run.start * CELL_PX,
                    top: run.fixed * CELL_PX - 3,
                    width: (run.end - run.start) * CELL_PX,
                    height: 6,
                  }
                : {
                    left: run.fixed * CELL_PX - 3,
                    top: run.start * CELL_PX,
                    width: 6,
                    height: (run.end - run.start) * CELL_PX,
                  };
              const assigned = placements[run.id];
              return (
                <div
                  key={run.id}
                  className={`builder-wall ${selectedWallId === run.id ? "selected" : ""} ${
                    assigned ? "assigned" : ""
                  }`}
                  style={style}
                  title={assigned ? ARTWORKS.find((a) => a.id === assigned)?.title : "Boş duvar"}
                  onClick={() => setSelectedWallId(run.id)}
                />
              );
            })}
            {spawnCell && (
              <div
                className="builder-spawn"
                style={{
                  left: spawnCell.x * CELL_PX,
                  top: spawnCell.z * CELL_PX,
                  transform: `rotate(${(-spawnYaw * 180) / Math.PI}deg)`,
                }}
                title="Başlangıç konumu ve bakış yönü"
              >
                ▲
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
