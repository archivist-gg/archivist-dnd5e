import { describe, it, expect } from "vitest";
import { parseOptionalFeature } from "@archivist-gg/dnd5e/optional-feature/optional-feature.parser";

// Frontmatter helper: a minimal ACCEPTED optional-feature, then the widened keys appended.
const baseOf = `name: Testinvocation\nslug: test_optional-feature_testinvocation\nsource: T\nfeature_type: invocation\ndescription: d\nprerequisites: []\navailable_to: []\neffects: []\n`;

describe("optional-feature widening (§2.5) — declare-or-lose keys survive parseOptionalFeature", () => {
  it("VALUE-asserts all six §2.5 keys plus image (ruling T2-carry of T1-I2)", () => {
    const r = parseOptionalFeature(baseOf +
      `rendering_hint: ''\nis_class_feature_variant: true\nhas_fluff_images: true\nadditional_spells:\n  - resourceName: Sorcery Points\n    innate:\n      _:\n        daily:\n          '1e':\n            - 'darkness#c'\nfeat_progression:\n  - name: Epic Boon\n    category:\n      - EB\n    progression:\n      '19': 1\n      '*': 2\noptionalfeature_progression:\n  - name: Elemental Disciplines\n    featureType:\n      - ED\n    progression:\n      '3': 1\n    required:\n      '3':\n        - 'Elemental Attunement|PHB'\nimage: '[[SRD 2024/Images/OptionalFeatures/A.webp]]'\n`);
    expect(r.success).toBe(true);
    if (r.success) {
      const d = r.data as unknown as Record<string, unknown>;
      // MEASURED over the converter tree: all 226 optional-feature docs carry rendering_hint, but
      // only 138 hold ""; the other 88 carry a real marker (dice-pool 39, point-pool 32,
      // pool-selection 10, granted-die-to-ally 4, stance 3) — G4's load-bearing values, which is
      // why §2.5 calls this the ONE root whose VALUES matter. `.min(1)` is still FORBIDDEN: it
      // would refuse those 138. Both classes are pinned — "" here, a real marker in the next case.
      expect(d.rendering_hint).toBe("");
      expect(d.is_class_feature_variant).toBe(true);
      expect(d.has_fluff_images).toBe(true);
      expect(d.additional_spells).toEqual([{
        resourceName: "Sorcery Points",
        innate: { _: { daily: { "1e": ["darkness#c"] } } },
      }]);
      expect(d.feat_progression).toEqual([
        { name: "Epic Boon", category: ["EB"], progression: { "19": 1, "*": 2 } },
      ]);
      expect(d.optionalfeature_progression).toEqual([{
        name: "Elemental Disciplines", featureType: ["ED"],
        progression: { "3": 1 }, required: { "3": ["Elemental Attunement|PHB"] },
      }]);
      expect(d.image).toBe("[[SRD 2024/Images/OptionalFeatures/A.webp]]");
    }
  });
  it("rendering_hint carries a REAL marker value too — this is the ONE root whose values are load-bearing (88 records, G4's)", () => {
    const r = parseOptionalFeature(baseOf + `rendering_hint: dice-pool\n`);
    expect(r.success).toBe(true);
    if (r.success) expect((r.data as unknown as Record<string, unknown>).rendering_hint).toBe("dice-pool");
  });
  it("§9.4 · the image ARRAY arm survives", () => {
    const r = parseOptionalFeature(baseOf + `image:\n  - '[[SRD 2024/Images/OptionalFeatures/A.webp]]'\n  - '[[SRD 2024/Images/OptionalFeatures/B.webp]]'\n`);
    expect(r.success).toBe(true);
    if (r.success) expect((r.data as unknown as Record<string, unknown>).image).toEqual([
      "[[SRD 2024/Images/OptionalFeatures/A.webp]]", "[[SRD 2024/Images/OptionalFeatures/B.webp]]",
    ]);
  });
});
