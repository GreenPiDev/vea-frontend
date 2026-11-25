// TEST FIXTURE ONLY — a complete ExhibitionTheme (the former "renaissance" demo room's), for tests that
// need some valid theme and don't care which.
import type { ExhibitionTheme } from "../exhibitions";

export const TEST_THEME: ExhibitionTheme = {
  wallColor: "#efe4cf",
  wallRoughness: 0.9,
  floorColor: "#8a6a45",
  floorRoughness: 0.4,
  floorMetalness: 0.02,
  ceilingColor: "#f7f0e0",
  fogColor: "#efe4cf",
  backgroundColor: "#e9dcc2",
  ambientColor: "#fff1d6",
  ambientIntensity: 0.38,
  hemisphereSkyColor: "#fff6e6",
  hemisphereGroundColor: "#c9a876",
  spotColor: "#fff2d0",
  spotIntensity: 20,
};
