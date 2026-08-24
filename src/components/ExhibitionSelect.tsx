import type { RefObject } from "react";
import { useTranslation } from "react-i18next";
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
  /** Scroll container ref, shared with Header so it can auto-hide/color on scroll. */
  containerRef?: RefObject<HTMLDivElement | null>;
}

export default function ExhibitionSelect({ exhibitions, onSelect, containerRef }: ExhibitionSelectProps) {
  const { t } = useTranslation();
  return (
    <div className="exhibition-select" ref={containerRef}>
      <p className="exhibition-select-welcome">{t("exhibitionSelectWelcome")}</p>
      <p className="exhibition-select-subtitle">{t("exhibitionSelectSubtitle")}</p>
      <div className="exhibition-select-grid">
        {exhibitions.map((ex) => (
          <ExhibitionSelectCard key={ex.id} exhibition={ex} onSelect={onSelect} />
        ))}
      </div>
    </div>
  );
}
