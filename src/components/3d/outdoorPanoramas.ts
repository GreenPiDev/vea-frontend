// The views seen through a room's windows: 360° equirectangular photos shown as the scene background
// (OutdoorPanorama.tsx). Infinitely far away, so they never need geometry, collide with nothing and cost one
// texture. Sources: Poly Haven (CC0), tonemapped JPG exports downsized to 4096 × 2048.
//
//   garden   symmetrical_garden_02  sunny formal garden, midday, partly cloudy
//   seaside  spiaggia_di_mondello   sandy beach and sea, morning, clear
//   city     canary_wharf           glass office towers by the water, overcast
//   park     sunny_vondelpark       autumn park, low golden sun (~13°) — long sun patches deep into the room
//
// The light each one casts through a window (sky colour, sun direction) is generated from the same photo
// into outdoorPanoramaLight.ts by scripts/panorama-light.py — re-run it after adding/replacing a photo.
// Which way the view faces is per room (Exhibition.outdoor.rotationY), so the sun turns with it.

export interface OutdoorPanorama {
  id: string;
  url: string;
  /** 480 px preview for the panel's picker (public/panoramas/thumbs/). */
  thumbnailUrl: string;
  /** i18n key of the display name (panel pickers). */
  labelKey: string;
  /** scene.backgroundIntensity — outside is brighter than the room; values past ~1.5 start to bloom. */
  intensity: number;
}

export const OUTDOOR_PANORAMAS: OutdoorPanorama[] = [
  { id: "garden", url: "/panoramas/garden.jpg", thumbnailUrl: "/panoramas/thumbs/garden.jpg", labelKey: "outdoorGarden", intensity: 1.3 },
  { id: "seaside", url: "/panoramas/seaside.jpg", thumbnailUrl: "/panoramas/thumbs/seaside.jpg", labelKey: "outdoorSeaside", intensity: 1.25 },
  { id: "city", url: "/panoramas/city.jpg", thumbnailUrl: "/panoramas/thumbs/city.jpg", labelKey: "outdoorCity", intensity: 1.35 },
  { id: "park", url: "/panoramas/park.jpg", thumbnailUrl: "/panoramas/thumbs/park.jpg", labelKey: "outdoorPark", intensity: 1.25 },
];

export const DEFAULT_OUTDOOR_PANORAMA = OUTDOOR_PANORAMAS[0];

export function findOutdoorPanorama(id: string | undefined): OutdoorPanorama {
  return OUTDOOR_PANORAMAS.find((p) => p.id === id) ?? DEFAULT_OUTDOOR_PANORAMA;
}
