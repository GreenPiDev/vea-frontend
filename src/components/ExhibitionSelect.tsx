import ExhibitionSelectCard from "./ExhibitionSelectCard";
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
          <ExhibitionSelectCard key={ex.id} exhibition={ex} onSelect={onSelect} />
        ))}
      </div>
    </div>
  );
}
