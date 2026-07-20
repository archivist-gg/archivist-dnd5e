import { describe, it, expect } from "vitest";
import { buildCanonicalSlug } from "../../tools/srd-canonical/merger";
import { slugifyName } from "../../tools/srd-canonical/sources/slug-normalize";

describe("type-namespaced slug builder", () => {
  it("weaves the singular entity_type between prefix and name", () => {
    expect(buildCanonicalSlug("2024", "armor", "Shield")).toBe("srd-2024_armor_shield");
    expect(buildCanonicalSlug("2024", "spell", "Shield")).toBe("srd-2024_spell_shield");
    expect(buildCanonicalSlug("2014", "background", "Acolyte")).toBe("srd-5e_background_acolyte");
    expect(buildCanonicalSlug("2014", "monster", "Acolyte")).toBe("srd-5e_monster_acolyte");
    expect(buildCanonicalSlug("2024", "optional-feature", "Bedevil")).toBe("srd-2024_optional-feature_bedevil");
  });
  it("slugifyName never emits an underscore (delimiter invariant)", () => {
    for (const n of ["Bag of Holding", "Cloak_of Test", "Mordenkainen's Sword", "A/B (C)"]) {
      expect(slugifyName(n)).not.toContain("_");
    }
    // every part splits cleanly
    expect(buildCanonicalSlug("2024", "item", "Bag of Holding").split("_")).toHaveLength(3);
  });
});
