import { describe, expect, it } from "vitest";
import { artistOfferCount, pendingOfferCount } from "./orgDetailFormat";
import type { ApiOrgOverviewArtist, ApiOrgOverviewOffer } from "../../lib/api/domains/organizations";

const offer = (status: ApiOrgOverviewOffer["status"]): ApiOrgOverviewOffer => ({
  id: Math.random().toString(36),
  amount: 100_000,
  currency: "TRY",
  status,
  artistDecision: null,
  createdAt: "2026-11-25T00:00:00.000Z",
  buyer: { email: "buyer@example.com" },
});

const artwork = (offers: ApiOrgOverviewOffer[]) => ({
  id: Math.random().toString(36),
  title: "Eser",
  status: "LISTED" as const,
  priceAmount: 5_000_000_000,
  currency: "TRY",
  createdAt: "2026-11-25T00:00:00.000Z",
  offers,
});

const artist = (artworks: ReturnType<typeof artwork>[] | null): ApiOrgOverviewArtist => ({
  id: "u1",
  email: "artist@example.com",
  createdAt: "2026-11-25T00:00:00.000Z",
  artistProfile: artworks === null ? null : { id: "p1", displayName: "Sanatçı", artworks },
});

describe("organization detail offer counts", () => {
  it("sums offers across every artwork of the artist", () => {
    const a = artist([artwork([offer("PENDING"), offer("REJECTED")]), artwork([]), artwork([offer("ACCEPTED")])]);
    expect(artistOfferCount(a)).toBe(3);
  });

  it("counts only PENDING offers as waiting", () => {
    const a = artist([artwork([offer("PENDING"), offer("CANCELLED")]), artwork([offer("PENDING")])]);
    expect(pendingOfferCount(a)).toBe(2);
  });

  it("is zero for an artist without a profile yet", () => {
    expect(artistOfferCount(artist(null))).toBe(0);
    expect(pendingOfferCount(artist(null))).toBe(0);
  });
});
