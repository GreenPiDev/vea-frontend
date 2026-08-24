// Converts a backend ApiExhibition (vea-api's GET /exhibitions/:id shape,
// see lib/api/domains/exhibitions.ts) into the renderable Exhibition/Artwork
// shapes this codebase's Scene/Gallery already consume (see exhibitions.ts,
// artworks.ts). View-only for now (Faz 3b) — no builder UI writes through
// this yet, that's Faz 3c/3d.
//
// The static ARTWORKS/EXHIBITIONS demo data and this adapter's output are
// both just Exhibition/Artwork values from the room's point of view — Scene/
// Gallery/GalleryArtworks don't know or care whether an Exhibition came from
// exhibitions.ts or from here.
import type {
  ApiExhibition,
  ApiExhibitionArtwork,
  ApiSceneConfig,
  CustomSceneConfig,
} from "../../lib/api/domains/exhibitions";
import type { Artwork } from "./artworks";
import { EXHIBITIONS, type Exhibition, type ExhibitionTheme } from "./exhibitions";
import {
  buildCustomRoomLayout,
  placeArtworksAlongWall,
  type WallRunGeometry,
} from "./galleryLayout";

/** The 4 fixed walls of a rectangular template room, in the same {start,end,orientation,fixed,outward} shape buildCustomRoomLayout's CustomWallRun uses — lets template and custom rooms share one placement function. Geometry/ids match buildRoomLayout exactly (see galleryLayout.ts). */
export function templateWallRuns(roomSize: [number, number]): (WallRunGeometry & { id: string })[] {
  const [W, D] = roomSize;
  return [
    { id: "north", orientation: "horizontal", start: -W / 2, end: W / 2, fixed: -D / 2, outward: -1 },
    { id: "south", orientation: "horizontal", start: -W / 2, end: W / 2, fixed: D / 2, outward: 1 },
    { id: "east", orientation: "vertical", start: -D / 2, end: D / 2, fixed: W / 2, outward: 1 },
    { id: "west", orientation: "vertical", start: -D / 2, end: D / 2, fixed: -W / 2, outward: -1 },
  ];
}

/** Groups artworkLinks by their positionData.wallRunId, sorted by the sibling `order` column (nulls last, then by id for a stable tie-break). Links with no positionData/wallRunId aren't placed (not hung yet). */
export function groupByWallRun(links: ApiExhibitionArtwork[]): Map<string, ApiExhibitionArtwork[]> {
  const byWall = new Map<string, ApiExhibitionArtwork[]>();
  for (const link of links) {
    const wallRunId = link.positionData?.wallRunId;
    if (!wallRunId) continue;
    const list = byWall.get(wallRunId);
    if (list) list.push(link);
    else byWall.set(wallRunId, [link]);
  }
  for (const list of byWall.values()) {
    list.sort((a, b) => (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER) || a.id.localeCompare(b.id));
  }
  return byWall;
}

function toRenderableArtwork(link: ApiExhibitionArtwork, exhibitionId: string, placement: ReturnType<typeof placeArtworksAlongWall>[number]): Artwork {
  const { artwork } = link;
  return {
    id: link.id,
    title: artwork.title,
    artist: artwork.artistProfile?.displayName ?? "Bilinmeyen Sanatçı",
    year: artwork.yearCreated ? String(artwork.yearCreated) : "",
    exhibitionId,
    image: artwork.imageUrl,
    aspect: artwork.widthCm / artwork.heightCm,
    height: placement.height,
    // Backend-sourced artworks never get an extra 3D frame mesh — the
    // artist's uploaded image already includes its own frame.
    frame: null,
    position: placement.position,
    rotationY: placement.rotationY,
    artworkId: link.artworkId,
    technique: artwork.technique,
    priceAmount: artwork.priceAmount,
    currency: artwork.currency,
    status: artwork.status,
    sellerId: artwork.artistProfile?.userId,
    hasApprovedOffer: artwork.hasApprovedOffer,
  };
}

function placeAll(
  runs: (WallRunGeometry & { id: string })[],
  wallHeight: number,
  byWall: Map<string, ApiExhibitionArtwork[]>,
  exhibitionId: string
): Artwork[] {
  const artworks: Artwork[] = [];
  for (const run of runs) {
    const links = byWall.get(run.id);
    if (!links || links.length === 0) continue;
    const placements = placeArtworksAlongWall(
      run,
      wallHeight,
      links.map((link) => ({
        aspect: link.artwork.widthCm / link.artwork.heightCm,
        height: link.artwork.heightCm / 100,
        heightYOverride: link.positionData?.heightY,
      }))
    );
    links.forEach((link, i) => artworks.push(toRenderableArtwork(link, exhibitionId, placements[i])));
  }
  return artworks;
}

/** The user only picks 3 flat colors + optional textures (panel/ExhibitionForm.tsx); everything else (roughness, fog/background/ambient/spot colors, hemisphere) is a fixed/derived value tuned for a neutral, gallery-appropriate look — same formula the retired local-demo ExhibitionBuilder.tsx used to compute inline. Keep this in sync with ExhibitionForm.tsx if the picked-color set ever changes. */
function buildCustomTheme(config: CustomSceneConfig): ExhibitionTheme {
  return {
    wallColor: config.wallColor,
    wallRoughness: 0.85,
    floorColor: config.floorColor,
    floorRoughness: 0.35,
    floorMetalness: 0.05,
    ceilingColor: config.ceilingColor,
    fogColor: config.floorColor,
    backgroundColor: config.wallColor,
    ambientColor: "#fff4e0",
    ambientIntensity: 0.42,
    hemisphereSkyColor: "#ffffff",
    hemisphereGroundColor: config.floorColor,
    spotColor: "#fff4e0",
    spotIntensity: 22,
    floorTextureId: config.textureIds?.floor,
    wallTextureId: config.textureIds?.wall,
    ceilingTextureId: config.textureIds?.ceiling,
  };
}

/**
 * A cheap accent color for an ExhibitionSelect card, computed straight from
 * sceneConfig alone (no artworkLinks needed) — used to render the public
 * gallery's list of backend exhibitions without fetching each one's full
 * detail (that only happens lazily on selection, see adaptApiExhibition).
 */
export function previewAccentColor(config: ApiSceneConfig | null): string {
  if (!config) return "#b9924a";
  if (config.kind === "template") {
    return EXHIBITIONS.find((e) => e.id === config.templateId)?.theme.spotColor ?? "#b9924a";
  }
  return config.wallColor;
}

/**
 * The wall runs a given sceneConfig produces, regardless of kind — used by
 * the panel's artwork-placement screen (Faz 3d) to know which wallRunIds
 * exist and how long each one is, without needing to render anything.
 * Returns null under the same "can't resolve" conditions as
 * adaptApiExhibition (missing sceneConfig, unknown templateId).
 */
export function wallRunsForSceneConfig(config: ApiSceneConfig | null): (WallRunGeometry & { id: string })[] | null {
  if (!config) return null;
  if (config.kind === "template") {
    const template = EXHIBITIONS.find((e) => e.id === config.templateId);
    if (!template || !template.roomSize) return null;
    return templateWallRuns(template.roomSize);
  }
  return buildCustomRoomLayout(config.cells, config.wallHeight, config.spawn).wallRuns;
}

/**
 * Converts a backend ApiExhibition (must include artworkLinks — i.e. come
 * from useExhibition(id), not usePublicExhibitions/useMyExhibitions) into a
 * renderable Exhibition, or null if it can't be rendered yet (no
 * sceneConfig, or a "template" pointing at an unknown/removed preset id).
 */
export function adaptApiExhibition(exhibition: ApiExhibition): Exhibition | null {
  const config = exhibition.sceneConfig;
  if (!config) return null;

  const byWall = groupByWallRun(exhibition.artworkLinks ?? []);

  if (config.kind === "template") {
    const template = EXHIBITIONS.find((e) => e.id === config.templateId);
    if (!template || !template.roomSize) return null;

    const runs = templateWallRuns(template.roomSize);
    return {
      ...template,
      id: exhibition.id,
      name: exhibition.title,
      artworks: placeAll(runs, template.wallHeight, byWall, exhibition.id),
    };
  }

  const { layout, wallRuns } = buildCustomRoomLayout(config.cells, config.wallHeight, config.spawn);
  return {
    id: exhibition.id,
    name: exhibition.title,
    subtitle: exhibition.description ?? "",
    wallHeight: config.wallHeight,
    custom: true,
    customLayout: layout,
    artworks: placeAll(wallRuns, config.wallHeight, byWall, exhibition.id),
    theme: buildCustomTheme(config),
  };
}
