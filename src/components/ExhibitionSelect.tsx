import "./ExhibitionSelect.css";

export interface ExhibitionCard {
  id: string;
  name: string;
  subtitle: string;
  /** Accent color for the card's hover border, e.g. a theme's spotColor or a custom room's wallColor. */
  accent: string;
}

interface ExhibitionSelectProps {
  exhibitions: ExhibitionCard[];
  onSelect: (id: string) => void;
}

export default function ExhibitionSelect({ exhibitions, onSelect }: ExhibitionSelectProps) {
  return (
    <div className="exhibition-select">
      <p className="exhibition-select-title">Sanal Sergi</p>
      <p className="exhibition-select-heading">Hangi Sergiye Gireceğinizi Seçiniz</p>
      <div className="exhibition-select-grid">
        {exhibitions.map((ex) => (
          <button
            key={ex.id}
            className="exhibition-select-card"
            style={{ "--accent": ex.accent } as React.CSSProperties}
            onClick={() => onSelect(ex.id)}
          >
            <span className="exhibition-select-name">{ex.name}</span>
            <span className="exhibition-select-subtitle">{ex.subtitle}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
