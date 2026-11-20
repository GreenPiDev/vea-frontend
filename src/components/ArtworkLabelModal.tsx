import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import type { Artwork } from "./3d/artworks";
import { labelContent } from "./3d/wallLabelLayout";

interface ArtworkLabelModalProps {
  artwork: Artwork;
  onClose: () => void;
  /** Opens the full artwork card (image, price, offer) instead. */
  onShowDetails: () => void;
}

/**
 * The wall label, opened by clicking it in the 3D scene: the same printed card (paper, ink, Helvetica,
 * artist / title, year / medium / dimensions), large enough to read without walking up to the wall.
 * Same content as the board on the wall — both come from wallLabelLayout.ts's labelContent.
 */
export default function ArtworkLabelModal({ artwork, onClose, onShowDetails }: ArtworkLabelModalProps) {
  const { t, i18n } = useTranslation();
  const content = labelContent(artwork, i18n.language);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex animate-loading-fade-in items-center justify-center bg-black/55 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("artworkLabelDialog", { title: content.title })}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-md rounded-[3px] bg-label-paper px-8 pb-6 pt-8 font-label text-label-ink shadow-[0_2px_4px_rgba(0,0,0,0.25),0_18px_50px_rgba(0,0,0,0.45)]"
      >
        <button
          onClick={onClose}
          aria-label={t("artworkLabelClose")}
          className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full text-label-muted transition hover:bg-black/5 hover:text-label-ink"
        >
          ✕
        </button>

        {content.artist && <p className="pr-8 text-2xl font-semibold leading-tight">{content.artist}</p>}
        <p className="mt-3 text-xl leading-snug">
          <span className="italic">{content.title}</span>
          {content.year && <span>, {content.year}</span>}
        </p>
        {content.meta.length > 0 && (
          <div className="mt-4 space-y-1 text-base leading-snug text-label-muted">
            {content.meta.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>
        )}

        <button
          onClick={onShowDetails}
          className="mt-6 text-sm text-label-muted underline decoration-label-muted/40 underline-offset-4 transition hover:text-label-ink hover:decoration-label-ink"
        >
          {t("artworkLabelDetails")} →
        </button>
      </div>
    </div>
  );
}
