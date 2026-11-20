// Inverse of backendAdapter.ts's static-template branch: where a static EXHIBITIONS preset's own hung work
// (showcaseExhibition.ts / conceptRooms.ts) sits, expressed as the backend's ArtworkPositionData. Used to turn
// the vitrin demo rooms into real backend exhibitions (sceneConfig {kind:"template", templateId:"vitrin-N"})
// whose artworks render exactly where the static room hangs them — see staticTemplatePlacement.test.ts.
import type { ArtworkPositionData } from "../../lib/api/domains/exhibitions";
import type { Artwork } from "./artworks";
import type { Exhibition } from "./exhibitions";
import { templateWallRuns } from "./backendAdapter";
import { MEZZ_RUN_SUFFIX } from "./mezzanineTemplate";

const WALL_BY_ROTATION: [number, string][] = [
  [0, "north"],
  [Math.PI, "south"],
  [-Math.PI / 2, "east"],
  [Math.PI / 2, "west"],
];

export function staticArtworkPosition(template: Exhibition, artwork: Artwork): ArtworkPositionData {
  if (!template.roomSize) throw new Error(`${template.id}: not a rectangle preset`);
  const wall = WALL_BY_ROTATION.find(([r]) => Math.abs(r - artwork.rotationY) < 1e-6)?.[1];
  if (!wall) throw new Error(`${template.id}/${artwork.id}: rotation ${artwork.rotationY} is not one of the 4 walls`);
  const run = templateWallRuns(template.roomSize).find((r) => r.id === wall)!;
  const along = run.orientation === "horizontal" ? artwork.position[0] : artwork.position[2];
  const floorY = artwork.floorY ?? 0;
  return {
    wallRunId: floorY ? `${wall}${MEZZ_RUN_SUFFIX}` : wall,
    alongFraction: (along - run.start) / (run.end - run.start),
    heightY: artwork.position[1] - floorY,
  };
}
