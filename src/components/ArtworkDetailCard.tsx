import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { Artwork } from './3d/artworks';
import { useAuth } from '../lib/auth/AuthContext';
import { useCreateOffer } from '../lib/api/domains/offers';
import { useRecordArtworkView } from '../lib/api/domains/exhibitions';
import { getViewSessionId } from '../lib/viewSession';
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
  exhibitionId: string;
  onClose: () => void;
}

/**
 * Opened from the "i" icon rendered over the 3D scene (see App.tsx /
 * ArtworkIconProjector.tsx) — shows the painting's details and, for a real
 * (backend-sourced, purchasable) artwork, a "make an offer" form. App.tsx
 * handles releasing/re-acquiring pointer lock around this card's lifetime;
 * this component only deals with its own content and close affordances.
 */
export default function ArtworkDetailCard({ artwork, exhibitionId, onClose }: ArtworkDetailCardProps) {
  const { t } = useTranslation();
  const { user, isAuthenticated } = useAuth();
  const createOffer = useCreateOffer();
  const recordView = useRecordArtworkView();
  const [amount, setAmount] = useState('');
  const [offerError, setOfferError] = useState<string | null>(null);
  const [offerSent, setOfferSent] = useState(false);
  const [viewCount, setViewCount] = useState<number | null>(null);

  const isPurchasable = artwork.artworkId != null;

  // One view recorded per card open — no dedup, a re-open counts again
  // (matches the literal ask: "opened" == "viewed"). Static demo paintings
  // (no artworkId) have nothing to attach a VisitEvent to, so they're skipped.
  const recordViewMutate = recordView.mutate;
  useEffect(() => {
    if (!artwork.artworkId) return;
    recordViewMutate(
      { exhibitionId, artworkId: artwork.artworkId, sessionId: getViewSessionId() },
      { onSuccess: (data) => setViewCount(data.count) },
    );
  }, [artwork.artworkId, exhibitionId, recordViewMutate]);
  // hasApprovedOffer is the informal "artist already accepted a buyer"
  // signal (see Offer.artistDecision) — treated the same as the real SOLD
  // status here even though Artwork.status may not have flipped yet, since
  // the backend also refuses new offers once it's true (see OffersService.create).
  const isSold = artwork.status === 'SOLD' || artwork.hasApprovedOffer === true;
  const isOwnArtwork = isAuthenticated && user?.id === artwork.sellerId;

  const priceLabel =
    artwork.priceAmount != null && artwork.currency
      ? new Intl.NumberFormat('tr-TR', { style: 'currency', currency: artwork.currency }).format(
          artwork.priceAmount / 100,
        )
      : null;

  // Artist-set floor (Artwork.maxDiscountPercent) — same
  // Math.ceil(priceAmount * (1 - pct/100)) formula OffersService.create
  // enforces server-side; this is only a UX convenience so the buyer sees
  // the constraint and the button disables before hitting a 400.
  const minAmountMajor =
    artwork.priceAmount != null && artwork.maxDiscountPercent != null
      ? Math.ceil(artwork.priceAmount * (1 - artwork.maxDiscountPercent / 100)) / 100
      : null;
  const enteredAmount = Number(amount);
  const belowMinimum = minAmountMajor != null && amount !== '' && enteredAmount < minAmountMajor;
  const minAmountLabel =
    minAmountMajor != null && artwork.currency
      ? new Intl.NumberFormat('tr-TR', { style: 'currency', currency: artwork.currency }).format(minAmountMajor)
      : null;

  function handleSubmitOffer(e: FormEvent) {
    e.preventDefault();
    if (!artwork.artworkId || belowMinimum) return;
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

        {artwork.framed != null && (
          <p className="mb-1 text-sm text-brand-700">
            {t(artwork.framed ? 'artworkDetailFramed' : 'artworkDetailUnframed')}
          </p>
        )}

        {priceLabel && (
          <p className="mb-1 text-sm font-medium text-brand-900">
            {t('artworkFormPrice')}: {priceLabel}
          </p>
        )}

        {artwork.status && (
          <p className="mb-1 text-xs text-brand-500">{t(STATUS_KEYS[artwork.status])}</p>
        )}

        {viewCount !== null && (
          <p className="mb-3 text-xs text-brand-500">{t('artworkViewCount', { count: viewCount })}</p>
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
                {minAmountLabel && (
                  <p className="text-sm font-medium text-red-600">
                    {t('artworkOfferMinAmount', { amount: minAmountLabel })}
                  </p>
                )}
                <button
                  type="submit"
                  disabled={createOffer.isPending || belowMinimum}
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
