import { describe, it, expect } from "vitest";
import { parseSubclass } from "@archivist-gg/dnd5e/subclass/subclass.parser";

// Frontmatter helper: a minimal ACCEPTED subclass, then the widened keys appended.
// `edition` is supplied by parseSubclass itself. `parent_class` MUST be quoted — an unquoted
// `[[bard]]` is a nested flow sequence to js-yaml, not a wikilink string.
const baseSub = `name: Testsub\nslug: test_subclass_testsub\nparent_class: '[[bard]]'\nsource: T\ndescription: d\nfeatures_by_level: {}\nresources: []\n`;

describe("subclass widening (§2.7) — declare-or-lose keys survive parseSubclass", () => {
  it("VALUE-asserts the twelve non-fluff declared keys plus image (ruling T2-carry)", () => {
    const r = parseSubclass(baseSub +
      `rendering_hint: ''\nshort_name: Giant\nhas_fluff: true\nhas_fluff_images: true\ntable_col_labels:\n  - Spells Prepared\ncantrip_progression:\n  - 2\n  - 3\nprepared_spells_change: restLong\nprepared_spells_progression:\n  - 4\n  - 5\nspells_known_progression:\n  - 2\n  - 3\nfeat_progression:\n  - name: Boon\n    category:\n      - EB\n    progression:\n      '7': 1\noptionalfeature_progression:\n  - name: Elemental Disciplines\n    featureType:\n      - MV:B\n    progression:\n      '3': 2\n    required:\n      '3':\n        - 'Elemental Attunement|PHB'\nadditional_spells:\n  - name: Circle Spells\n    resourceName: Wild Shape\n    prepared:\n      '3':\n        - barkskin\nimage: '[[SRD 2024/Images/Subclasses/College of Lore.webp]]'\n`);
    expect(r.success).toBe(true);
    if (r.success) {
      const d = r.data as unknown as Record<string, unknown>;   // gate2 F4
      // rendering_hint carries the empty string on all 346 converter carriers: .min(1) is FORBIDDEN.
      expect(d.rendering_hint).toBe("");
      expect(d.short_name).toBe("Giant");
      expect(d.has_fluff).toBe(true);
      expect(d.has_fluff_images).toBe(true);
      expect(d.table_col_labels).toEqual(["Spells Prepared"]);
      expect(d.cantrip_progression).toEqual([2, 3]);
      expect(d.prepared_spells_change).toBe("restLong");
      expect(d.prepared_spells_progression).toEqual([4, 5]);
      expect(d.spells_known_progression).toEqual([2, 3]);
      expect(d.feat_progression).toEqual([{ name: "Boon", category: ["EB"], progression: { "7": 1 } }]);
      // §9.3 · `featureType` (camelCase) is the ONLY spelling on all 13 subclass carriers, and
      // `required` rides only here (2 docs) — both survive VERBATIM beside the record progression.
      expect(d.optionalfeature_progression).toEqual([{
        name: "Elemental Disciplines", featureType: ["MV:B"],
        progression: { "3": 2 }, required: { "3": ["Elemental Attunement|PHB"] },
      }]);
      expect(d.additional_spells).toEqual([{
        name: "Circle Spells", resourceName: "Wild Shape", prepared: { "3": ["barkskin"] },
      }]);
      // The SINGLE-wikilink arm of imageField (the array arm is pinned on class, §9.4).
      expect(d.image).toBe("[[SRD 2024/Images/Subclasses/College of Lore.webp]]");
    }
  });
  it("§9.5 subclass half: the single measured `fluff` key-set {_subclassFluff:{…}} survives VERBATIM", () => {
    const r = parseSubclass(baseSub +
      `fluff:\n  _subclassFluff:\n    className: Barbarian\n    classSource: XPHB\n    name: Path of the Giant\n    shortName: Giant\n    source: BGG\n`);
    expect(r.success).toBe(true);
    if (r.success) {
      // The census is permanently BLIND under a z.unknown() leaf (classifies `kept` forever, §8),
      // so this key-set pin is the ONLY instrument that can see a shape loss here.
      expect((r.data as unknown as Record<string, unknown>).fluff).toEqual({
        _subclassFluff: {
          className: "Barbarian", classSource: "XPHB", name: "Path of the Giant",
          shortName: "Giant", source: "BGG",
        },
      });
    }
  });
});
