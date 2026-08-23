import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { Artwork } from './3d/artworks';
import { useAuth } from '../lib/auth/AuthContext';
import { useCreateOffer } from '../lib/api/domains/offers';
import { ApiError } from '../lib/api/client';
import Login from './auth/Login';

const STATUS_KEYS: Record<NonNullable<Artwork['status']>, string> = {
  DRAFT: 'statusDraft',
  LISTED: 'statusListed',
  IN_EXHIBITION: 'statusInExhibition',
  SOLD: 'statusSold',
  ARCHIVED: 'statusArchived',
};

interface ArtworkDetailCardProps {
  artwork: Artwork;
  onClose: () => void;
}

/**
 * Opened from the "i" icon rendered over the 3D scene (see App.tsx /
 * ArtworkIconProjector.tsx) — shows the painting's details and, for a real
 * (backend-sourced, purchasable) artwork, a "make an offer" form. App.tsx
 * handles releasing/re-acquiring pointer lock around this card's lifetime;
 * this component only deals with its own content and close affordances.
 */
export default function ArtworkDetailCard({ artwork, onClose }: ArtworkDetailCardProps) {
  const { t } = useTranslation();
  const { user, isAuthenticated } = useAuth();
  const createOffer = useCreateOffer();
  const [amount, setAmount] = useState('');
  const [offerError, setOfferError] = useState<string | null>(null);
  const [offerSent, setOfferSent] = useState(false);

  const isPurchasable = artwork.artworkId != null;
  const isSold = artwork.status === 'SOLD';
  const isOwnArtwork = isAuthenticated && user?.id === artwork.sellerId;

  const priceLabel =
    artwork.priceAmount != null && artwork.currency
      ? new Intl.NumberFormat('tr-TR', { style: 'currency', currency: artwork.currency }).format(
          artwork.priceAmount / 100,
        )
      : null;

  function handleSubmitOffer(e: FormEvent) {
    e.preventDefault();
    if (!artwork.artworkId) return;
    setOfferError(null);
    createOffer.mutate(
      { artworkId: artwork.artworkId, amount: Math.round(Number(amount) * 100) },
      {
        onSuccess: () => setOfferSent(true),
        onError: (err) =>
          setOfferError(err instanceof ApiError ? err.message : t('artworkOfferError')),
      },
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-lg bg-brand-50 p-6 shadow-lg"
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-brand-900">{artwork.title}</h2>
            <p className="text-sm text-brand-600">
              {artwork.artist}
              {artwork.year ? ` · ${artwork.year}` : ''}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label={t('artworkDetailClose')}
            className="shrink-0 rounded-md px-2 py-1 text-brand-500 hover:bg-brand-100 hover:text-brand-800"
          >
            ✕
          </button>
        </div>

        {artwork.technique && (
          <p className="mb-1 text-sm text-brand-700">
            {t('artworkDetailTechnique', { technique: artwork.technique })}
          </p>
        )}

        {priceLabel && (
          <p className="mb-1 text-sm font-medium text-brand-900">
            {t('artworkFormPrice')}: {priceLabel}
          </p>
        )}

        {artwork.status && (
          <p className="mb-3 text-xs text-brand-500">{t(STATUS_KEYS[artwork.status])}</p>
        )}

        {!isPurchasable && (
          <p className="mt-2 text-sm text-brand-600">{t('artworkDetailDemoNotice')}</p>
        )}

        {isPurchasable && isSold && (
          <p className="mt-2 text-sm text-brand-600">{t('artworkDetailSoldNotice')}</p>
        )}

        {isPurchasable && !isSold && isOwnArtwork && (
          <p className="mt-2 text-sm text-brand-600">{t('artworkDetailOwnArtworkNotice')}</p>
        )}

        {isPurchasable && !isSold && !isOwnArtwork && !isAuthenticated && (
          <div className="mt-3">
            <p className="mb-2 text-sm text-brand-600">{t('artworkDetailLoginPrompt')}</p>
            <Login />
          </div>
        )}

        {isPurchasable && !isSold && !isOwnArtwork && isAuthenticated && (
          <>
            {offerSent ? (
              <p className="mt-3 text-sm font-medium text-brand-800">{t('artworkOfferSuccess')}</p>
            ) : (
              <form onSubmit={handleSubmitOffer} className="mt-3 flex flex-col gap-2">
                <label className="text-sm text-brand-700" htmlFor="artwork-offer-amount">
                  {t('artworkOfferAmountLabel')}
                </label>
                <input
                  id="artwork-offer-amount"
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="rounded-md border border-brand-300 bg-white px-3 py-2 text-sm text-brand-900 outline-none focus:border-brand-500"
                />
                <button
                  type="submit"
                  disabled={createOffer.isPending}
                  className="rounded-md bg-brand-700 px-3 py-2 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-50"
                >
                  {createOffer.isPending ? t('artworkOfferSending') : t('artworkOfferSubmit')}
                </button>
                {offerError && <p className="text-sm text-red-600">{offerError}</p>}
              </form>
            )}
          </>
        )}
      </div>
    </div>
  );
}
