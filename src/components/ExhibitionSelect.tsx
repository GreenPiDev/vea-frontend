import type { Exhibition } from "./3d/exhibitions";
import "./ExhibitionSelect.css";

interface ExhibitionSelectProps {
  exhibitions: Exhibition[];
  onSelect: (exhibition: Exhibition) => void;
  onCreateNew: () => void;
  onEdit: (exhibition: Exhibition) => void;
  onDelete: (id: string) => void;
}

export default function ExhibitionSelect({
  exhibitions,
  onSelect,
  onCreateNew,
  onEdit,
  onDelete,
}: ExhibitionSelectProps) {
  return (
    <div className="exhibition-select">
      <p className="exhibition-select-title">Sanal Sergi</p>
      <p className="exhibition-select-heading">Hangi Sergiye Gireceğinizi Seçiniz</p>
      <div className="exhibition-select-grid">
        {exhibitions.map((ex) => (
          <div key={ex.id} className="exhibition-select-card-wrap">
            <button
              className="exhibition-select-card"
              style={{ "--accent": ex.theme.spotColor } as React.CSSProperties}
              onClick={() => onSelect(ex)}
            >
              <span className="exhibition-select-name">{ex.name}</span>
              <span className="exhibition-select-subtitle">{ex.subtitle}</span>
            </button>
            {ex.custom && (
              <div className="exhibition-select-card-actions">
                {ex.builderSource && (
                  <button
                    className="exhibition-select-action"
                    title="Sergiyi düzenle"
                    onClick={(e) => {
                      e.stopPropagation();
                      onEdit(ex);
                    }}
                  >
                    ✎
                  </button>
                )}
                <button
                  className="exhibition-select-action exhibition-select-delete"
                  title="Sergiyi sil"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(ex.id);
                  }}
                >
                  ✕
                </button>
              </div>
            )}
          </div>
        ))}
        <button className="exhibition-select-card exhibition-select-card-new" onClick={onCreateNew}>
          <span className="exhibition-select-name">+ Yeni Sergi Oluştur</span>
          <span className="exhibition-select-subtitle">Kendi salonunuzu çizin</span>
        </button>
      </div>
    </div>
  );
}
