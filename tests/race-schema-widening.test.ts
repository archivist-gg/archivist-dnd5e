import { describe, it, expect } from "vitest";
import { parseRace } from "@archivist-gg/dnd5e/race/race.parser";

// Frontmatter helper: build a minimal ACCEPTED race then append the widened keys.
const baseRace = `name: Testling\nslug: test_race_testling\nsource: T\ndescription: d\nsize: medium\nspeed:\n  walk: 30\nability_score_increases: []\nage: a\nalignment: n\nvision: {}\nlanguages:\n  fixed: []\nvariant_label: Testling\ntraits: []\n`;

describe("race widening (§2.3) — declare-or-lose keys survive parseRace", () => {
  it("keeps the four RAW passthroughs verbatim incl. their measured null/boolean variants (§9.5), and VALUE-asserts every other key §2.3 declares", () => {
    const r = parseRace(baseRace +
      `rendering_hint: ''\nhas_fluff: true\ntrait_tags: null\nlineage: false\nheight_and_weight:\n  baseHeight: 41\n  baseWeight: 35\nsound_clip:\n  type: internal\n  path: races/goblin.opus\ncreature_type:\n  - humanoid\nhas_fluff_images: true\ncreature_type_tags:\n  - goblinoid\nimage: '[[SRD 2024/Images/Races/Goblin.webp]]'\n`);
    expect(r.success).toBe(true);
    if (r.success) {
      const d = r.data as unknown as Record<string, unknown>;   // TS2352 without the unknown hop (gate2 F4)
      expect("trait_tags" in d).toBe(true);      // KEY presence — null trap (spec §7 R-G1b-4)
      expect(d.trait_tags).toBeNull();
      expect(d.lineage).toBe(false);             // the measured boolean variant
      expect(d.height_and_weight).toEqual({ baseHeight: 41, baseWeight: 35 });
      expect(d.sound_clip).toEqual({ type: "internal", path: "races/goblin.opus" });
      // Ruling T2-carry of T1-I2: every key the §2.3 block declares is asserted BY VALUE, never
      // by presence alone. rendering_hint doubles as the ".min(1) is FORBIDDEN here" guard: the
      // empty string is what all 373 converter carriers hold.
      expect(d.rendering_hint).toBe("");
      expect(d.has_fluff).toBe(true);
      expect(d.has_fluff_images).toBe(true);
      expect(d.creature_type).toEqual(["humanoid"]);
      expect(d.creature_type_tags).toEqual(["goblinoid"]);
      expect(d.image).toBe("[[SRD 2024/Images/Races/Goblin.webp]]");
    }
  });
  it("§9.5 · the passthroughs' OTHER measured variant classes (trait_tags array · lineage string · height_and_weight null)", () => {
    const r = parseRace(baseRace +
      `trait_tags:\n  - Uncommon Race\n  - Skill Proficiency\nlineage: 'VRGR'\nheight_and_weight: null\n`);
    expect(r.success).toBe(true);
    if (r.success) {
      const d = r.data as unknown as Record<string, unknown>;
      expect(d.trait_tags).toEqual(["Uncommon Race", "Skill Proficiency"]);
      expect(d.lineage).toBe("VRGR");
      expect("height_and_weight" in d).toBe(true);
      expect(d.height_and_weight).toBeNull();
    }
  });
  it("§9.5 · lineage's NULL variant: pinned on its OWN key, since a per-key tightening to string|boolean would leave every other assertion green while refusing every real null carrier", () => {
    const r = parseRace(baseRace + `lineage: null\n`);
    expect(r.success).toBe(true);
    if (r.success) {
      const d = r.data as unknown as Record<string, unknown>;
      expect("lineage" in d).toBe(true);   // KEY presence — the null trap again (spec §7 R-G1b-4)
      expect(d.lineage).toBeNull();
    }
  });
  it("§9.4 · the image ARRAY arm survives on a real root too (zero census carriers — fixtures are the only kill power)", () => {
    const r = parseRace(baseRace + `image:\n  - '[[SRD 2024/Images/Races/A.webp]]'\n  - '[[SRD 2024/Images/Races/B.webp]]'\n`);
    expect(r.success).toBe(true);
    if (r.success) {
      expect((r.data as unknown as Record<string, unknown>).image)
        .toEqual(["[[SRD 2024/Images/Races/A.webp]]", "[[SRD 2024/Images/Races/B.webp]]"]);
    }
  });
  it("§2.8/§9.9 · additional_spells DUAL ARITY: the Elf bundle bare-object form survives VERBATIM; the converter array form parses", () => {
    const bundleElf = `additional_spells:\n  known:\n    '1':\n      - '[[SRD 2024/Spells/Druidcraft|xphb|druidcraft|xphb]]'\n`;
    const converterForm = `additional_spells:\n  - innate:\n      '3':\n        - druidcraft#c\n`;
    const r1 = parseRace(baseRace + bundleElf);
    expect(r1.success).toBe(true);
    if (r1.success) {
      const spells = (r1.data as unknown as Record<string, unknown>).additional_spells as Record<string, unknown>;
      expect(spells.known).toEqual({ "1": ["[[SRD 2024/Spells/Druidcraft|xphb|druidcraft|xphb]]"] }); // deep-equal, not presence (gate2 M-4)
    }
    const r2 = parseRace(baseRace + converterForm);
    expect(r2.success).toBe(true);
    if (r2.success) expect("additional_spells" in (r2.data as unknown as Record<string, unknown>)).toBe(true);
  });
  // §9.9 asks for ALL THREE bundle carriers (gate2 M-6). The two below are the remaining ones,
  // copied VERBATIM from `.compendium-bundle/SRD 2024/Races/Tiefling.md:85-89` and
  // `.compendium-bundle/SRD 5e/Races/Tiefling.md:52-55`.
  it("§9.9 · SRD 2024 Tiefling's bare-object block (TWO wikilinks under known.'1') survives verbatim", () => {
    const r = parseRace(baseRace +
      `additional_spells:\n  known:\n    '1':\n      - '[[SRD 2024/Spells/Thaumaturgy|xphb|thaumaturgy|xphb]]'\n      - '[[SRD 2024/Spells/Fire Bolt|xphb|fire bolt|xphb]]'\n`);
    expect(r.success).toBe(true);
    if (r.success) {
      const spells = (r.data as unknown as Record<string, unknown>).additional_spells as Record<string, unknown>;
      expect(spells.known).toEqual({ "1": [
        "[[SRD 2024/Spells/Thaumaturgy|xphb|thaumaturgy|xphb]]",
        "[[SRD 2024/Spells/Fire Bolt|xphb|fire bolt|xphb]]",
      ] });
    }
  });
  it("§9.9 · SRD 5e Tiefling's bare-object block survives verbatim", () => {
    const r = parseRace(baseRace +
      `additional_spells:\n  known:\n    '1':\n      - '[[SRD 5e/Spells/Thaumaturgy|thaumaturgy]]'\n`);
    expect(r.success).toBe(true);
    if (r.success) {
      const spells = (r.data as unknown as Record<string, unknown>).additional_spells as Record<string, unknown>;
      expect(spells.known).toEqual({ "1": ["[[SRD 5e/Spells/Thaumaturgy|thaumaturgy]]"] });
    }
  });
});
