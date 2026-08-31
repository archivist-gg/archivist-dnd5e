import { describe, it, expect } from "vitest";
import { parseFeat } from "@archivist-gg/dnd5e/feat/feat.parser";

// Frontmatter helper: a minimal ACCEPTED feat, then the widened keys appended.
// `edition` is supplied by parseFeat itself.
const baseFeat = `name: Testfeat\nslug: test_feat_testfeat\nsource: T\ncategory: general\ndescription: d\nprerequisites: []\nbenefits: []\neffects: []\ngrants_asi: null\nrepeatable: false\nchoices: []\n`;

describe("feat widening (§2.4) — declare-or-lose keys survive parseFeat", () => {
  it("VALUE-asserts the five converter-measured keys plus image (ruling T2-carry of T1-I2)", () => {
    const r = parseFeat(baseFeat +
      `rendering_hint: ''\nhas_fluff_images: true\ntrait_tags:\n  - Spellcasting\nadditional_spells:\n  - name: Magic Initiate\n    ability: int\n    innate:\n      _:\n        daily:\n          '1':\n            - 'detect magic#c'\noptionalfeature_progression:\n  - name: Infusions\n    feature_type:\n      - AI\n    progression:\n      '2': 4\n      '*': 2\nimage:\n  - '[[SRD 2024/Images/Feats/A.webp]]'\n  - '[[SRD 2024/Images/Feats/B.webp]]'\n`);
    expect(r.success).toBe(true);
    if (r.success) {
      const d = r.data as unknown as Record<string, unknown>;
      // rendering_hint carries the empty string on all 287 converter carriers: .min(1) is FORBIDDEN.
      expect(d.rendering_hint).toBe("");
      expect(d.has_fluff_images).toBe(true);
      expect("trait_tags" in d).toBe(true);                 // same z.unknown() passthrough family as race
      expect(d.trait_tags).toEqual(["Spellcasting"]);
      expect(d.additional_spells).toEqual([{
        name: "Magic Initiate", ability: "int",
        innate: { _: { daily: { "1": ["detect magic#c"] } } },
      }]);
      expect(d.optionalfeature_progression).toEqual([
        { name: "Infusions", feature_type: ["AI"], progression: { "2": 4, "*": 2 } },
      ]);
      expect(d.image).toEqual(["[[SRD 2024/Images/Feats/A.webp]]", "[[SRD 2024/Images/Feats/B.webp]]"]);
    }
  });
  it("R-G1b-5 · the bundle's TOP-LEVEL action_cost survives (Boon of the Night Spirit's ninth SRD row)", () => {
    const r = parseFeat(baseFeat + `action_cost: bonus-action\n`);
    expect(r.success).toBe(true);
    if (r.success) expect((r.data as unknown as Record<string, unknown>).action_cost).toBe("bonus-action");
  });
  it("§9.7 · FeatEntity.resources round-trip (CHARACTERISATION — red if the schema drops the key)", () => {
    const r = parseFeat(baseFeat + `resources:\n  - id: 'feat:test'\n    name: T\n    max_formula: '1'\n    reset: long-rest\n`);
    expect(r.success).toBe(true);
    if (r.success) {
      const res = (r.data as unknown as Record<string, unknown>).resources as Array<{ id: string }>;
      expect(res[0].id).toBe("feat:test");   // ROUND-TRIP — Array.isArray alone stays green under z.array(z.unknown()) (gate2 M-5)
    }
  });
  it("§9.4 second half · feat has_fluff survives (ZERO carriers — this fixture IS its only kill power, gate2 M-3)", () => {
    const r = parseFeat(baseFeat + `has_fluff: true\n`);
    expect(r.success).toBe(true);
    if (r.success) expect((r.data as unknown as Record<string, unknown>).has_fluff).toBe(true);
  });
  it("§9.4 · the image SINGLE-wikilink arm survives too", () => {
    const r = parseFeat(baseFeat + `image: '[[SRD 2024/Images/Feats/Solo.webp]]'\n`);
    expect(r.success).toBe(true);
    if (r.success) expect((r.data as unknown as Record<string, unknown>).image)
      .toBe("[[SRD 2024/Images/Feats/Solo.webp]]");
  });
});
