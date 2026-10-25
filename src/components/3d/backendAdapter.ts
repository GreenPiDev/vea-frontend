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
import type { ApiExhibitionTemplate, FurniturePlacement } from "../../lib/api/domains/exhibitionTemplates";
import type { Artwork } from "./artworks";
import { EXHIBITIONS, type Exhibition, type ExhibitionTheme } from "./exhibitions";
import type { FurnitureDef } from "./furniture";
import {
  buildCustomRoomLayout,
  buildRoomLayout,
  placeArtworksAlongWall,
  type GridCell,
  type PlacedFurnitureInput,
  type WallRunGeometry,
} from "./galleryLayout";

/**
 * Resolves a template's stored furniture placements against a fetched
 * furniture catalog (see lib/api/domains/furnitureAssets.ts's
 * useMyFurnitureAssets/useFurnitureAssetsByOrganization + furniture.ts's
 * toFurnitureDef — callers fetch this, it's no longer a static import),
 * producing both the collider inputs galleryLayout.ts needs and the
 * render-ready list Exhibition.furniture/GalleryFurniture.tsx consume. An
 * unknown furnitureId (deleted asset, or a catalog that hasn't loaded yet)
 * is silently dropped — same "don't let stale stored data break the scene"
 * approach as a wallRunId that no longer resolves to a real wall.
 */
function resolveFurniture(
  placements: FurniturePlacement[] | undefined,
  catalog: FurnitureDef[]
): {
  colliderInputs: PlacedFurnitureInput[];
  renderList: Exhibition["furniture"];
} {
  const colliderInputs: PlacedFurnitureInput[] = [];
  const renderList: Exhibition["furniture"] = [];
  for (const placement of placements ?? []) {
    const def = catalog.find((f) => f.id === placement.furnitureId);
    if (!def) continue;
    colliderInputs.push({
      x: placement.x,
      z: placement.z,
      rotationY: placement.rotationY,
      halfWidth: def.footprint.width / 2,
      halfDepth: def.footprint.depth / 2,
    });
    renderList.push({
      modelUrl: def.modelUrl,
      position: [placement.x, 0, placement.z],
      rotationY: placement.rotationY,
      scale: def.scale,
    });
  }
  return { colliderInputs, renderList };
}

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
    artist: artwork.artistDisplayName || artwork.artistProfile?.displayName || "Bilinmeyen Sanatçı",
    year: artwork.yearCreated ? String(artwork.yearCreated) : "",
    exhibitionId,
    image: artwork.imageUrl,
    aspect: artwork.widthCm / artwork.heightCm,
    height: placement.height,
    // artwork.framed: true means the artist's uploaded image already shows
    // its own physical frame (no extra mesh needed); false means we hang a
    // default modern-black frame around the bare canvas.
    frame: artwork.framed ? null : "modernBlack",
    position: placement.position,
    rotationY: placement.rotationY,
    artworkId: link.artworkId,
    technique: artwork.technique,
    framed: artwork.framed,
    category: artwork.category,
    heightCm: artwork.heightCm,
    widthCm: artwork.widthCm,
    story: artwork.story,
    note: artwork.note,
    priceAmount: artwork.priceAmount,
    currency: artwork.currency,
    maxDiscountPercent: artwork.maxDiscountPercent,
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
/** A backend ExhibitionTemplate's wall runs, regardless of its roomShape.kind (rectangle or custom-drawn — same grid contract useRoomGridEditor/galleryLayout.ts's buildCustomRoomLayout uses for a custom Exhibition room). */
function backendTemplateWallRuns(template: ApiExhibitionTemplate): (WallRunGeometry & { id: string })[] {
  return template.roomShape.kind === "rectangle"
    ? templateWallRuns([template.roomShape.width, template.roomShape.depth])
    : buildCustomRoomLayout(template.roomShape.cells, template.wallHeight, template.roomShape.spawn).wallRuns;
}

export function wallRunsForSceneConfig(
  config: ApiSceneConfig | null,
  resolvedTemplate?: ApiExhibitionTemplate | null
): (WallRunGeometry & { id: string })[] | null {
  if (!config) return null;
  if (config.kind === "template") {
    const template = EXHIBITIONS.find((e) => e.id === config.templateId);
    if (template && template.roomSize) return templateWallRuns(template.roomSize);
    if (resolvedTemplate) return backendTemplateWallRuns(resolvedTemplate);
    return null;
  }
  return buildCustomRoomLayout(config.cells, config.wallHeight, config.spawn).wallRuns;
}

export interface BlueprintLayout {
  /** Occupied unit cells for a "custom" room's exact footprint (draw each as a 1x1 square) — null for "template", whose floor is just the bounding rectangle in `bounds`. */
  cells: GridCell[] | null;
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  wallRuns: (WallRunGeometry & { id: string })[];
  /** Spawn position (x/z, meters) + facing already converted to SVG rotate() degrees (clockwise), for a top-down floor-plan marker. */
  spawn: { x: number; z: number; rotationDeg: number };
}

/**
 * Same idea as wallRunsForSceneConfig, but for panel/ExhibitionBlueprint.tsx's
 * top-down floor-plan sketch — also needs the floor shape and spawn point,
 * not just wall runs. wallHeight passed to buildRoomLayout/buildCustomRoomLayout
 * below is arbitrary (1) since none of the x/z values this reads depend on it,
 * only the unused ceiling/collider math does.
 */
// Exported (beyond blueprintForSceneConfig's own use) so CeilingLightEditor.tsx's
// callers (ExhibitionTemplateForm.tsx/ExhibitionForm.tsx) can render a live
// floor-plan preview of the *in-progress*, not-yet-saved room shape the curator
// is currently editing — there's no ApiSceneConfig/ApiExhibitionTemplate to feed
// blueprintForSceneConfig until that first save round-trips.
export function rectangleBlueprint(roomSize: [number, number]): BlueprintLayout {
  const [W, D] = roomSize;
  const { playerStart, playerStartYaw } = buildRoomLayout(roomSize, 1);
  return {
    cells: null,
    bounds: { minX: -W / 2, maxX: W / 2, minZ: -D / 2, maxZ: D / 2 },
    wallRuns: templateWallRuns(roomSize),
    // rotate() is clockwise in SVG; yaw's convention (0 = -Z/"up" in this
    // top-down mapping, increasing toward +X/"east") is the opposite
    // sense, hence the negation — see SpawnOverride's yaw doc comment.
    spawn: { x: playerStart[0], z: playerStart[2], rotationDeg: -(playerStartYaw * 180) / Math.PI },
  };
}

export function customBlueprint(cells: GridCell[], wallHeight: number, spawn: { x: number; z: number; yaw: number }): BlueprintLayout {
  const { layout, wallRuns } = buildCustomRoomLayout(cells, wallHeight, spawn);
  const [cx, cz] = layout.room.center;
  const [W, D] = layout.room.size;
  return {
    cells,
    bounds: { minX: cx - W / 2, maxX: cx + W / 2, minZ: cz - D / 2, maxZ: cz + D / 2 },
    wallRuns,
    spawn: {
      x: layout.playerStart[0],
      z: layout.playerStart[2],
      rotationDeg: -(layout.playerStartYaw * 180) / Math.PI,
    },
  };
}

export function blueprintForSceneConfig(
  config: ApiSceneConfig | null,
  resolvedTemplate?: ApiExhibitionTemplate | null
): BlueprintLayout | null {
  if (!config) return null;
  if (config.kind === "template") {
    const staticTemplate = EXHIBITIONS.find((e) => e.id === config.templateId);
    if (staticTemplate?.roomSize) return rectangleBlueprint(staticTemplate.roomSize);
    if (!resolvedTemplate) return null;
    return resolvedTemplate.roomShape.kind === "rectangle"
      ? rectangleBlueprint([resolvedTemplate.roomShape.width, resolvedTemplate.roomShape.depth])
      : customBlueprint(resolvedTemplate.roomShape.cells, resolvedTemplate.wallHeight, resolvedTemplate.roomShape.spawn);
  }
  return customBlueprint(config.cells, config.wallHeight, config.spawn);
}

/**
 * Converts a backend ApiExhibition (must include artworkLinks — i.e. come
 * from useExhibition(id), not usePublicExhibitions/useMyExhibitions) into a
 * renderable Exhibition, or null if it can't be rendered yet (no
 * sceneConfig, or a "template" pointing at an unknown/removed preset id).
 */
export function adaptApiExhibition(exhibition: ApiExhibition, furnitureCatalog: FurnitureDef[] = []): Exhibition | null {
  const config = exhibition.sceneConfig;
  if (!config) return null;

  const byWall = groupByWallRun(exhibition.artworkLinks ?? []);

  if (config.kind === "template") {
    const staticTemplate = EXHIBITIONS.find((e) => e.id === config.templateId);
    if (staticTemplate && staticTemplate.roomSize) {
      const runs = templateWallRuns(staticTemplate.roomSize);
      return {
        ...staticTemplate,
        id: exhibition.id,
        name: exhibition.title,
        artworks: placeAll(runs, staticTemplate.wallHeight, byWall, exhibition.id),
      };
    }

    // Not a static preset — resolve against the org's own backend
    // ExhibitionTemplate (only present when GET included the relation, i.e.
    // came from useExhibition/useOwnExhibition, not a list endpoint).
    const backendTemplate = exhibition.exhibitionTemplate;
    if (!backendTemplate) return null;

    const runs = backendTemplateWallRuns(backendTemplate);
    return exhibitionFromBackendTemplate(
      backendTemplate,
      { id: exhibition.id, name: exhibition.title },
      placeAll(runs, backendTemplate.wallHeight, byWall, exhibition.id),
      furnitureCatalog
    );
  }

  const { layout, wallRuns } = buildCustomRoomLayout(
    config.cells,
    config.wallHeight,
    config.spawn,
    config.ceilingLights
  );
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

/** Shared by adaptApiExhibition's backend-template branch and adaptExhibitionTemplate below — builds the renderable Exhibition shell from an ApiExhibitionTemplate, with whichever id/name/artworks the caller has (a real exhibition's own, or the template's own for an empty preview). */
function exhibitionFromBackendTemplate(
  backendTemplate: ApiExhibitionTemplate,
  identity: { id: string; name: string },
  artworks: Artwork[],
  furnitureCatalog: FurnitureDef[] = []
): Exhibition {
  const { colliderInputs, renderList } = resolveFurniture(backendTemplate.roomShape.furniture, furnitureCatalog);
  const base = {
    id: identity.id,
    name: identity.name,
    subtitle: backendTemplate.subtitle ?? "",
    wallHeight: backendTemplate.wallHeight,
    theme: backendTemplate.theme,
    artworks,
    furniture: renderList,
  };
  if (backendTemplate.roomShape.kind === "rectangle") {
    const { width, depth, ceilingLights } = backendTemplate.roomShape;
    // Rectangle templates normally render via roomSize alone (Scene.tsx computes
    // the layout at render time via buildRoomLayout) — but that call site has no
    // way to pass curator-placed ceiling lights/furniture through, so when either
    // exists, eagerly build the full layout here instead and piggyback on the same
    // `customLayout` field a custom-shaped room already uses (Scene.tsx's
    // `customLayout ?? buildRoomLayout(...)` fallback picks it up with no further
    // changes needed).
    if (ceilingLights?.length || colliderInputs.length) {
      const layout = buildRoomLayout([width, depth], backendTemplate.wallHeight, ceilingLights, colliderInputs);
      return { ...base, customLayout: layout };
    }
    return { ...base, roomSize: [width, depth] };
  }
  const { layout } = buildCustomRoomLayout(
    backendTemplate.roomShape.cells,
    backendTemplate.wallHeight,
    backendTemplate.roomShape.spawn,
    backendTemplate.roomShape.ceilingLights,
    colliderInputs
  );
  return { ...base, custom: true, customLayout: layout };
}

/**
 * Renders a backend ExhibitionTemplate on its own, with no exhibition/
 * artworks — used by the curator panel's "Önizle" action on the templates
 * table (ExhibitionTemplatePreviewPage.tsx) so an admin can walk through
 * what a template's empty room looks like before picking it for a real
 * exhibition, the same 3D Scene component exhibition previews use.
 */
export function adaptExhibitionTemplate(template: ApiExhibitionTemplate, furnitureCatalog: FurnitureDef[] = []): Exhibition {
  return exhibitionFromBackendTemplate(template, { id: template.id, name: template.name }, [], furnitureCatalog);
}
