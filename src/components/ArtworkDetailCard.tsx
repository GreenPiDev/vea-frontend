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

const CATEGORY_KEYS: Record<NonNullable<Artwork['category']>, string> = {
  PAINTING: 'categoryPainting',
  SCULPTURE: 'categorySculpture',
  PHOTOGRAPHY: 'categoryPhotography',
  OTHER: 'categoryOther',
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
  const [showOfferForm, setShowOfferForm] = useState(false);
  const [amount, setAmount] = useState('');
  const [offerError, setOfferError] = useState<string | null>(null);
  const [showMinAmountWarning, setShowMinAmountWarning] = useState(false);
  const [offerSent, setOfferSent] = useState(false);
  const [viewCount, setViewCount] = useState<number | null>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);

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
    if (!artwork.artworkId) return;
    if (belowMinimum) {
      setShowMinAmountWarning(true);
      return;
    }
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
    <>
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative flex max-h-[88vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-brand-50 shadow-2xl md:flex-row"
      >
        <button
          onClick={onClose}
          aria-label={t('artworkDetailClose')}
          className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm transition hover:bg-black/60"
        >
          ✕
        </button>

        <button
          type="button"
          onClick={() => setLightboxOpen(true)}
          aria-label={t('artworkDetailZoomLabel')}
          className="group flex shrink-0 cursor-pointer flex-col items-center justify-center gap-2 bg-brand-950 pb-4 md:w-[40%]"
        >
          <img
            src={artwork.image}
            alt={artwork.title}
            className="max-h-72 w-full object-contain p-4 transition group-hover:opacity-90 md:max-h-full md:p-6"
          />
          <span className="animate-pulse text-xs font-medium text-brand-200">
            {t('artworkDetailZoomHint')}
          </span>
        </button>

        <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-6">
          <div>
            <h2 className="text-2xl font-semibold leading-tight text-brand-900">{artwork.title}</h2>
            <p className="mt-1 text-base text-brand-600">
              {artwork.artist}
              {artwork.year ? ` · ${artwork.year}` : ''}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {artwork.category && (
              <span className="rounded-full bg-brand-100 px-3 py-1 text-sm font-medium text-brand-800">
                {t(CATEGORY_KEYS[artwork.category])}
              </span>
            )}
            {artwork.framed != null && (
              <span className="rounded-full bg-brand-100 px-3 py-1 text-sm font-medium text-brand-800">
                {t(artwork.framed ? 'artworkDetailFramed' : 'artworkDetailUnframed')}
              </span>
            )}
            {artwork.status && (
              <span className="rounded-full bg-brand-100 px-3 py-1 text-sm font-medium text-brand-800">
                {t(STATUS_KEYS[artwork.status])}
              </span>
            )}
          </div>

          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-base">
            {artwork.technique && (
              <div className="col-span-2">
                <dt className="text-sm text-brand-500">{t('artworkDetailTechniqueLabel')}</dt>
                <dd className="text-brand-800">{artwork.technique}</dd>
              </div>
            )}
            {artwork.heightCm != null && artwork.widthCm != null && (
              <div>
                <dt className="text-sm text-brand-500">{t('artworkDetailDimensionsLabel')}</dt>
                <dd className="text-brand-800">
                  {t('artworkDetailDimensions', { height: artwork.heightCm, width: artwork.widthCm })}
                </dd>
              </div>
            )}
            {priceLabel && (
              <div>
                <dt className="text-sm text-brand-500">{t('artworkFormPrice')}</dt>
                <dd className="font-medium text-brand-900">{priceLabel}</dd>
              </div>
            )}
          </dl>

          {artwork.story && (
            <div className="border-l-2 border-brand-300 pl-3">
              <p className="text-sm font-medium uppercase tracking-wide text-brand-500">
                {t('artworkDetailManifestoLabel')}
              </p>
              <p className="mt-1 whitespace-pre-line text-base italic text-brand-700">{artwork.story}</p>
            </div>
          )}

          {artwork.note && (
            <div>
              <p className="text-sm font-medium uppercase tracking-wide text-brand-500">
                {t('artworkDetailSpecialNotesLabel')}
              </p>
              <p className="mt-1 whitespace-pre-line text-base text-brand-700">{artwork.note}</p>
            </div>
          )}

          {viewCount !== null && (
            <p className="text-sm text-brand-500">{t('artworkViewCount', { count: viewCount })}</p>
          )}

          {!isPurchasable && (
            <p className="text-base text-brand-600">{t('artworkDetailDemoNotice')}</p>
          )}

          {isPurchasable && isSold && (
            <p className="text-base text-brand-600">{t('artworkDetailSoldNotice')}</p>
          )}

          {isPurchasable && !isSold && isOwnArtwork && (
            <p className="text-base text-brand-600">{t('artworkDetailOwnArtworkNotice')}</p>
          )}

          {isPurchasable && !isSold && !isOwnArtwork && !isAuthenticated && (
            <div>
              <p className="mb-2 text-base text-brand-600">{t('artworkDetailLoginPrompt')}</p>
              <Login />
            </div>
          )}

          {isPurchasable && !isSold && !isOwnArtwork && isAuthenticated && (
            <div className="border-t border-brand-200 pt-4">
              {offerSent ? (
                <p className="text-base font-medium text-brand-800">{t('artworkOfferSuccess')}</p>
              ) : !showOfferForm ? (
                <button
                  type="button"
                  onClick={() => setShowOfferForm(true)}
                  className="rounded-md bg-brand-700 px-3 py-2 text-base font-medium text-white hover:bg-brand-800"
                >
                  {t('artworkOfferSubmit')}
                </button>
              ) : (
                <form onSubmit={handleSubmitOffer} className="flex flex-col gap-2">
                  <label className="text-base text-brand-700" htmlFor="artwork-offer-amount">
                    {t('artworkOfferAmountLabel')}
                  </label>
                  <input
                    id="artwork-offer-amount"
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    autoFocus
                    value={amount}
                    onChange={(e) => {
                      setAmount(e.target.value);
                      setShowMinAmountWarning(false);
                    }}
                    className="rounded-md border border-brand-300 bg-white px-3 py-2 text-base text-brand-900 outline-none focus:border-brand-500"
                  />
                  {showMinAmountWarning && belowMinimum && minAmountLabel && (
                    <p className="text-base font-medium text-red-600">
                      {t('artworkOfferMinAmount', { amount: minAmountLabel })}
                    </p>
                  )}
                  <button
                    type="submit"
                    disabled={createOffer.isPending}
                    className="rounded-md bg-brand-700 px-3 py-2 text-base font-medium text-white hover:bg-brand-800 disabled:opacity-50"
                  >
                    {createOffer.isPending ? t('artworkOfferSending') : t('artworkOfferSubmit')}
                  </button>
                  {offerError && <p className="text-base text-red-600">{offerError}</p>}
                </form>
              )}
            </div>
          )}
        </div>
      </div>
    </div>

    {lightboxOpen && (
      <div
        className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 p-4"
        onClick={() => setLightboxOpen(false)}
      >
        <button
          onClick={() => setLightboxOpen(false)}
          aria-label={t('artworkDetailClose')}
          className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm transition hover:bg-black/60"
        >
          ✕
        </button>
        <img
          src={artwork.image}
          alt={artwork.title}
          onClick={(e) => e.stopPropagation()}
          className="h-full w-full cursor-zoom-out object-contain"
        />
      </div>
    )}
    </>
  );
}
