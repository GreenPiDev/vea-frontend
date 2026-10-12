import { useTranslation } from 'react-i18next';
import { useExhibitionWatcherCount } from '../lib/socket/useExhibitionVisitorCount';
import { useExhibition } from '../lib/api/domains/exhibitions';
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
  // usePublicExhibitions()'un liste yanıtı artworkLinks taşımıyor (bkz.
  // exhibitions.ts'teki ApiExhibition yorumu), bu yüzden kart görseli için
  // her kart kendi detay sorgusunu açıyor. Kart sayısı homepage'de küçük
  // (küratörlerin yayınladığı sergiler) olduğundan N ayrı istek burada kabul
  // edilebilir bir trade-off — ayrıca bu sorgu aynı query key'i App.tsx'in
  // sergiye tıklanınca açtığı detay sorgusuyla paylaştığından, karta
  // tıklandığında sahne genelde zaten önbellekte olur.
  const { data: detail } = useExhibition(exhibition.id);
  // Küratörün ExhibitionArtworkPlacement.tsx'teki "Kapak Yap" seçimi
  // (coverArtworkId) öncelikli — eşleşen eser artık yerleştirilmemiş/
  // kaldırılmışsa (ör. placement ekranından silinmiş) sessizce
  // artworkLinks[0] varsayılanına düşülüyor.
  const coverLink = detail?.artworkLinks?.find((link) => link.artworkId === detail.coverArtworkId);
  const previewImage = (coverLink ?? detail?.artworkLinks?.[0])?.artwork.imageUrl ?? null;

  return (
    <button
      className="exhibition-select-card"
      style={{ '--accent': exhibition.accent } as React.CSSProperties}
      onClick={() => onSelect(exhibition.id)}
    >
      {previewImage && (
        <img src={previewImage} alt="" aria-hidden="true" className="exhibition-select-card-bg" />
      )}
      <span className="exhibition-select-card-shade" />
      {count !== null && count > 0 && (
        <span
          className="exhibition-select-live-badge"
          aria-label={t('exhibitionLiveCount', { count })}
        >
          <span className="exhibition-select-live-dot" />
          {count}
        </span>
      )}
      <span className="exhibition-select-card-content">
        <span className="exhibition-select-name">{exhibition.name}</span>
        <span className="exhibition-select-card-subtitle">{exhibition.subtitle}</span>
      </span>
    </button>
  );
}
