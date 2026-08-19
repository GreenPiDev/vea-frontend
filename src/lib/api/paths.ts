// Single source of truth for backend REST paths — mirrors vea-api's
// controllers 1:1. Never inline a path string elsewhere; add it here so a
// route rename is a one-line change instead of a grep-and-hope.
export const Paths = {
  AuthRequestCode: '/auth/request-code',
  AuthVerifyCode: '/auth/verify-code',
  AuthMe: '/auth/me',

  ArtistProfiles: '/artist-profiles',
  ArtistProfileMe: '/artist-profiles/me',

  Artworks: '/artworks',
  ArtworksMine: '/artworks/mine',

  Exhibitions: '/exhibitions',
  ExhibitionsMine: '/exhibitions/mine',

  OffersMineBuying: '/offers/mine/buying',
  OffersMineSelling: '/offers/mine/selling',
} as const;
