import { describe, it, expect } from "vitest";
import { parseBackground } from "@archivist-gg/dnd5e/background/background.parser";

// Frontmatter helper: a minimal ACCEPTED background, then the widened keys appended.
// `edition` is supplied by parseBackground itself. `ability_score_increases`, `origin_feat`
// and `suggested_characteristics` are `.nullable()` and REQUIRED — omitting them refuses the
// base fixture, which would make every RED below the wrong red.
const baseBg = `name: Testbg\nslug: test_background_testbg\nsource: T\ndescription: d\nskill_proficiencies: []\ntool_proficiencies: []\nlanguage_proficiencies: []\nequipment: []\nfeature:\n  name: F\n  description: D\nability_score_increases: null\norigin_feat: null\nsuggested_characteristics: null\n`;

describe("background widening (§2.6) — declare-or-lose keys survive parseBackground", () => {
  it("VALUE-asserts rendering_hint, has_fluff_images, tables and image (ruling T2-carry: every declared key)", () => {
    const r = parseBackground(baseBg +
      `rendering_hint: ''\nhas_fluff_images: true\ntables:\n  - name: Guild Business\n    dice: d8\n    rows:\n      - roll: '1'\n        text: Alchemist\n      - roll: '2-3'\n        text: Armorer\nimage: '[[SRD 2024/Images/Backgrounds/Acolyte.webp]]'\n`);
    expect(r.success).toBe(true);
    if (r.success) {
      const d = r.data as unknown as Record<string, unknown>;
      // rendering_hint carries the empty string on its converter carriers: .min(1) is FORBIDDEN.
      expect(d.rendering_hint).toBe("");
      expect(d.has_fluff_images).toBe(true);
      // `roll` is a STRING on both arms — the YAML-quoted '1' is the trap: unquoted it is a
      // number and the declared leaf would REFUSE 67 accepted documents.
      expect(d.tables).toEqual([{
        name: "Guild Business", dice: "d8",
        rows: [{ roll: "1", text: "Alchemist" }, { roll: "2-3", text: "Armorer" }],
      }]);
      // The SINGLE-wikilink arm of imageField (the array arm is pinned on class, §9.4).
      expect(d.image).toBe("[[SRD 2024/Images/Backgrounds/Acolyte.webp]]");
    }
  });
  it("additional_spells survives VERBATIM (15 carriers, all `expanded`-keyed)", () => {
    const r = parseBackground(baseBg +
      `additional_spells:\n  - expanded:\n      s1:\n        - bless\n      s2:\n        - aid\n`);
    expect(r.success).toBe(true);
    if (r.success) {
      expect((r.data as unknown as Record<string, unknown>).additional_spells)
        .toEqual([{ expanded: { s1: ["bless"], s2: ["aid"] } }]);
    }
  });
  it("prerequisites: the ONE-ARM campaign union survives verbatim (closed at the emitter, §2.6 adjudication)", () => {
    const r = parseBackground(baseBg +
      `prerequisites:\n  - kind: campaign\n    slug: dragonlance\n`);
    expect(r.success).toBe(true);
    if (r.success) {
      expect((r.data as unknown as Record<string, unknown>).prerequisites)
        .toEqual([{ kind: "campaign", slug: "dragonlance" }]);
    }
  });
  it("a NON-campaign prerequisite kind still REFUSES — the deliberate loud failure the census would see", () => {
    const r = parseBackground(baseBg + `prerequisites:\n  - kind: level\n    slug: x\n`);
    expect(r.success).toBe(false);
  });
});
