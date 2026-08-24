import { useTranslation } from 'react-i18next';
import { useExhibitionWatcherCount } from '../lib/socket/useExhibitionVisitorCount';
import type { ExhibitionCard } from './ExhibitionSelect';

interface ExhibitionSelectCardProps {
  exhibition: ExhibitionCard;
  onSelect: (id: string) => void;
}

// Its own component (not inlined in ExhibitionSelect.tsx's .map()) because
// useExhibitionWatcherCount is a hook — each card needs its own instance to
// call it, hooks can't run inside a loop. Stays null for the static demo
// exhibitions (no real backend id to watch), so the badge just never
// appears for those — no special-casing needed.
export default function ExhibitionSelectCard({ exhibition, onSelect }: ExhibitionSelectCardProps) {
  const { t } = useTranslation();
  const count = useExhibitionWatcherCount(exhibition.id);

  return (
    <button
      className="exhibition-select-card"
      style={{ '--accent': exhibition.accent } as React.CSSProperties}
      onClick={() => onSelect(exhibition.id)}
    >
      {count !== null && count > 0 && (
        <span
          className="exhibition-select-live-badge"
          aria-label={t('exhibitionLiveCount', { count })}
        >
          <span className="exhibition-select-live-dot" />
          {count}
        </span>
      )}
      <span className="exhibition-select-name">{exhibition.name}</span>
      <span className="exhibition-select-card-subtitle">{exhibition.subtitle}</span>
    </button>
  );
}
