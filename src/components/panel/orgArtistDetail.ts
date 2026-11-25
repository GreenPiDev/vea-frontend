import type { OfferStatus } from '../../lib/api/domains/offers';
import type { ApiArtistDetailArtwork, ApiArtistDetailOffer } from '../../lib/api/domains/organizations';

// Pure derivations for the curator's artist detail page
// (OrgArtistDetailPage.tsx), tested in orgArtistDetail.test.ts. Everything
// is computed client-side from the single getArtistDetail payload.

/** Offers whose sale has been accepted and is somewhere in the payment flow. */
const IN_PROGRESS_STATUSES: ReadonlySet<OfferStatus> = new Set(['ACCEPTED', 'PAYMENT_HELD', 'DELIVERED']);

export interface ArtworkOfferStats {
  count: number;
  pending: number;
  /** Highest offer that isn't rejected/cancelled — null if none. */
  highest: ApiArtistDetailOffer | null;
}

export function artworkOfferStats(artwork: ApiArtistDetailArtwork): ArtworkOfferStats {
  let pending = 0;
  let highest: ApiArtistDetailOffer | null = null;
  for (const offer of artwork.offers) {
    if (offer.status === 'PENDING') pending += 1;
    if (offer.status === 'REJECTED' || offer.status === 'CANCELLED') continue;
    if (!highest || offer.amount > highest.amount) highest = offer;
  }
  return { count: artwork.offers.length, pending, highest };
}

/** Offer amount as a whole percent of the asking price (negative = under). Null when the price is 0. */
export function offerVsPricePercent(offerAmount: number, priceAmount: number): number | null {
  if (priceAmount <= 0) return null;
  return Math.round(((offerAmount - priceAmount) / priceAmount) * 100);
}

export interface ArtistSummary {
  artworkCount: number;
  /** Artworks currently visible to visitors (LISTED / IN_EXHIBITION). */
  activeArtworkCount: number;
  offerCount: number;
  pendingOfferCount: number;
  /** Sales accepted but not yet completed (ACCEPTED → DELIVERED). */
  inProgressSaleCount: number;
  soldArtworkCount: number;
  totalViews: number;
  /** Completed (RELEASED) sale totals, minor units, one entry per currency — never summed across currencies. */
  salesByCurrency: { currency: string; amount: number }[];
}

export function summarizeArtist(artworks: ApiArtistDetailArtwork[]): ArtistSummary {
  const sales = new Map<string, number>();
  const summary: Omit<ArtistSummary, 'salesByCurrency'> = {
    artworkCount: artworks.length,
    activeArtworkCount: 0,
    offerCount: 0,
    pendingOfferCount: 0,
    inProgressSaleCount: 0,
    soldArtworkCount: 0,
    totalViews: 0,
  };
  for (const artwork of artworks) {
    if (artwork.status === 'LISTED' || artwork.status === 'IN_EXHIBITION') summary.activeArtworkCount += 1;
    if (artwork.status === 'SOLD') summary.soldArtworkCount += 1;
    summary.totalViews += artwork._count.visitEvents;
    for (const offer of artwork.offers) {
      summary.offerCount += 1;
      if (offer.status === 'PENDING') summary.pendingOfferCount += 1;
      if (IN_PROGRESS_STATUSES.has(offer.status)) summary.inProgressSaleCount += 1;
      if (offer.status === 'RELEASED') sales.set(offer.currency, (sales.get(offer.currency) ?? 0) + offer.amount);
    }
  }
  return {
    ...summary,
    salesByCurrency: [...sales].map(([currency, amount]) => ({ currency, amount })).sort((a, b) => a.currency.localeCompare(b.currency)),
  };
}

export type ArtistOfferRow = ApiArtistDetailOffer & {
  artwork: Pick<ApiArtistDetailArtwork, 'id' | 'title' | 'imageUrl' | 'priceAmount' | 'currency'>;
};

/** Every offer across the artist's artworks, newest first, each tagged with its artwork. */
export function flattenOffers(artworks: ApiArtistDetailArtwork[]): ArtistOfferRow[] {
  return artworks
    .flatMap((artwork) =>
      artwork.offers.map((offer) => ({
        ...offer,
        artwork: {
          id: artwork.id,
          title: artwork.title,
          imageUrl: artwork.imageUrl,
          priceAmount: artwork.priceAmount,
          currency: artwork.currency,
        },
      })),
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
