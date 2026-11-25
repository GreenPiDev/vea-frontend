import { describe, expect, it } from "vitest";
import type { ApiArtwork } from "../../lib/api/domains/artworks";
import type { ApiExhibition, ApiExhibitionArtwork } from "../../lib/api/domains/exhibitions";
import { ARTWORK_DISPLAY_SCALE } from "./artworkDisplayScale";
import { adaptApiExhibition } from "./backendAdapter";
import { EXHIBITIONS } from "./exhibitions";
import { staticArtworkPosition } from "./staticTemplatePlacement";

const VITRINS = EXHIBITIONS.filter((e) => e.id.startsWith("vitrin-"));

/** A backend exhibition on the static preset whose links carry the preset's own works at their derived positions. */
function backendCopy(templateId: string): ApiExhibition {
  const template = EXHIBITIONS.find((e) => e.id === templateId)!;
  const artworkLinks: ApiExhibitionArtwork[] = (template.artworks ?? []).map((a, i) => ({
    id: `link-${a.id}`,
    exhibitionId: "ex",
    artworkId: `art-${a.id}`,
    positionData: staticArtworkPosition(template, a),
    order: i,
    artwork: {
      id: `art-${a.id}`,
      title: a.title,
      artistDisplayName: a.artist,
      // Scaled back by the display scale so the rendered height equals the static room's real-size hang —
      // this test checks the placement math, not the ARTWORK_DISPLAY_SCALE knob.
      heightCm: a.heightCm! / ARTWORK_DISPLAY_SCALE,
      widthCm: (a.heightCm! / ARTWORK_DISPLAY_SCALE) * a.aspect,
      imageUrl: a.image,
    } as ApiArtwork,
  }));
  return {
    id: "ex",
    curatorUserId: "u",
    title: template.name,
    description: null,
    startDate: "",
    endDate: "",
    status: "ACTIVE",
    sceneConfig: { kind: "template", templateId },
    maxArtworks: null,
    createdAt: "",
    artworkLinks,
  };
}

describe("static vitrin presets as backend exhibitions", () => {
  it("covers all 11 vitrin rooms", () => {
    expect(VITRINS.map((e) => e.id)).toEqual(Array.from({ length: 11 }, (_, i) => `vitrin-${i + 1}`));
  });

  it.each(VITRINS.map((e) => [e.id]))("%s: every work renders where the static room hangs it", (id) => {
    const template = EXHIBITIONS.find((e) => e.id === id)!;
    const originals = template.artworks ?? [];
    const adapted = adaptApiExhibition(backendCopy(id))!;
    expect(adapted).not.toBeNull();
    expect(adapted.artworks).toHaveLength(originals.length);
    for (const original of originals) {
      const rendered = adapted.artworks?.find((a) => a.id === `link-${original.id}`);
      expect(rendered, original.id).toBeDefined();
      expect(rendered!.rotationY).toBeCloseTo(original.rotationY, 6);
      expect(rendered!.height).toBeCloseTo(original.height, 6);
      for (let k = 0; k < 3; k++) expect(rendered!.position[k], `${original.id}[${k}]`).toBeCloseTo(original.position[k], 6);
      expect(rendered!.floorY ?? 0).toBeCloseTo(original.floorY ?? 0, 6);
    }
  });

  it("keeps the preset's room (layout, furniture, seats, outdoor view)", () => {
    for (const template of VITRINS) {
      const adapted = adaptApiExhibition(backendCopy(template.id))!;
      expect(adapted.customLayout).toBe(template.customLayout);
      expect(adapted.furniture).toBe(template.furniture);
      expect(adapted.seats).toBe(template.seats);
      expect(adapted.outdoor).toBe(template.outdoor);
    }
  });
});
