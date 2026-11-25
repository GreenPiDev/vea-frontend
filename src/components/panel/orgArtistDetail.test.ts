import { describe, expect, it } from 'vitest';
import type { ApiArtistDetailArtwork, ApiArtistDetailOffer } from '../../lib/api/domains/organizations';
import { artworkOfferStats, flattenOffers, offerVsPricePercent, summarizeArtist } from './orgArtistDetail';

function offer(overrides: Partial<ApiArtistDetailOffer> = {}): ApiArtistDetailOffer {
  return {
    id: 'o',
    amount: 1000,
    currency: 'TRY',
    status: 'PENDING',
    artistDecision: null,
    commissionAmount: null,
    commissionTaxAmount: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    respondedAt: null,
    buyer: { email: 'b@x.com', name: null },
    transaction: null,
    ...overrides,
  };
}

function artwork(overrides: Partial<ApiArtistDetailArtwork> = {}): ApiArtistDetailArtwork {
  return {
    id: 'a',
    title: 'Eser',
    artistDisplayName: 'Sanatçı',
    technique: null,
    yearCreated: null,
    heightCm: 50,
    widthCm: 40,
    category: 'PAINTING',
    priceAmount: 10_000,
    maxDiscountPercent: null,
    currency: 'TRY',
    imageUrl: '/img.webp',
    status: 'LISTED',
    createdAt: '2026-01-01T00:00:00.000Z',
    exhibitionLinks: [],
    _count: { visitEvents: 0 },
    offers: [],
    ...overrides,
  };
}

describe('artworkOfferStats', () => {
  it('ignores rejected/cancelled offers when picking the highest', () => {
    const stats = artworkOfferStats(
      artwork({
        offers: [
          offer({ id: '1', amount: 9000, status: 'REJECTED' }),
          offer({ id: '2', amount: 5000 }),
          offer({ id: '3', amount: 7000, status: 'CANCELLED' }),
          offer({ id: '4', amount: 6000 }),
        ],
      }),
    );
    expect(stats.count).toBe(4);
    expect(stats.pending).toBe(2);
    expect(stats.highest?.id).toBe('4');
  });

  it('has no highest offer without live offers', () => {
    expect(artworkOfferStats(artwork()).highest).toBeNull();
  });
});

describe('offerVsPricePercent', () => {
  it('rounds to whole percent, negative when under the price', () => {
    expect(offerVsPricePercent(8_500, 10_000)).toBe(-15);
    expect(offerVsPricePercent(10_000, 10_000)).toBe(0);
    expect(offerVsPricePercent(10_333, 10_000)).toBe(3);
  });

  it('is null for a zero price', () => {
    expect(offerVsPricePercent(100, 0)).toBeNull();
  });
});

describe('summarizeArtist', () => {
  it('counts statuses and keeps sales per currency', () => {
    const summary = summarizeArtist([
      artwork({
        status: 'SOLD',
        _count: { visitEvents: 4 },
        offers: [offer({ status: 'RELEASED', amount: 20_000 }), offer({ status: 'CANCELLED' })],
      }),
      artwork({
        status: 'IN_EXHIBITION',
        currency: 'USD',
        _count: { visitEvents: 6 },
        offers: [offer({ status: 'PAYMENT_HELD', currency: 'USD' }), offer({ currency: 'USD' })],
      }),
      artwork({
        status: 'SOLD',
        currency: 'USD',
        offers: [offer({ status: 'RELEASED', currency: 'USD', amount: 500 })],
      }),
      artwork({ status: 'ARCHIVED' }),
    ]);
    expect(summary).toEqual({
      artworkCount: 4,
      activeArtworkCount: 1,
      offerCount: 5,
      pendingOfferCount: 1,
      inProgressSaleCount: 1,
      soldArtworkCount: 2,
      totalViews: 10,
      salesByCurrency: [
        { currency: 'TRY', amount: 20_000 },
        { currency: 'USD', amount: 500 },
      ],
    });
  });

  it('is all zeros for an empty portfolio', () => {
    expect(summarizeArtist([]).salesByCurrency).toEqual([]);
    expect(summarizeArtist([]).offerCount).toBe(0);
  });
});

describe('flattenOffers', () => {
  it('merges every artwork offer newest first, tagged with its artwork', () => {
    const rows = flattenOffers([
      artwork({ id: 'a1', title: 'A', offers: [offer({ id: 'old', createdAt: '2026-01-01T00:00:00.000Z' })] }),
      artwork({ id: 'a2', title: 'B', offers: [offer({ id: 'new', createdAt: '2026-03-01T00:00:00.000Z' })] }),
    ]);
    expect(rows.map((r) => [r.id, r.artwork.title])).toEqual([
      ['new', 'B'],
      ['old', 'A'],
    ]);
  });
});
