import { describe, it, expect } from "vitest";
import * as path from "node:path";
import { toRaceCanonical, raceMergeRule } from "../../../tools/srd-canonical/merger-rules/race-merge";
import { loadOverlay } from "../../../tools/srd-canonical/sources/overlay";
import { ARTISANS_TOOLS } from "../../../src/types/choice";
import type { CanonicalEntry } from "../../../tools/srd-canonical/merger";

const baseEntry = (overrides: Partial<CanonicalEntry> & { base: unknown }): CanonicalEntry => ({
  slug: overrides.slug ?? "srd-5e_dwarf",
  edition: overrides.edition ?? ("2014" as const),
  kind: "race",
  base: overrides.base as never,
  structured: overrides.structured ?? null,
  activation: overrides.activation ?? null,
  overlay: overrides.overlay ?? null,
});

describe("race-merge: Open5e v2 species shape", () => {
  it("extracts size from traits[type=SIZE] (2024)", () => {
    const result = toRaceCanonical(baseEntry({
      slug: "srd-2024_dragonborn",
      edition: "2024",
      base: {
        key: "srd-2024_dragonborn",
        name: "Dragonborn",
        is_subspecies: false,
        subspecies_of: null,
        desc: "",
        traits: [
          { name: "Size", desc: "Medium", type: "SIZE", order: 1 },
          { name: "Speed", desc: "30 feet", type: "SPEED", order: 2 },
        ],
      },
    }));
    expect(result.size).toBe("medium");
    expect(result.speed.walk).toBe(30);
  });

  it("extracts size from traits[name=Size] (2014, untyped traits)", () => {
    const result = toRaceCanonical(baseEntry({
      slug: "srd-5e_dwarf",
      edition: "2014",
      base: {
        key: "srd_dwarf",
        name: "Dwarf",
        is_subspecies: false,
        subspecies_of: null,
        desc: "...",
        traits: [
          { name: "Ability Score Increase", desc: "Your Constitution score increases by 2.", type: null, order: null },
          { name: "Size", desc: "Dwarves stand between 4 and 5 feet tall... Your size is Medium.", type: null, order: null },
          { name: "Speed", desc: "Your base walking speed is 25 feet.", type: null, order: null },
        ],
      },
    }));
    expect(result.size).toBe("medium");
    expect(result.speed.walk).toBe(25);
  });

  it("uses native Open5e v2 subspecies_of object for wikilink", () => {
    const result = toRaceCanonical(baseEntry({
      slug: "srd-5e_hill-dwarf",
      edition: "2014",
      base: {
        key: "srd_hill-dwarf",
        name: "Hill Dwarf",
        is_subspecies: true,
        subspecies_of: { name: "Dwarf", key: "srd_dwarf" },
        desc: "...",
        traits: [],
      },
    }));
    expect(result.subspecies_of).toBe("[[SRD 5e/Races/Dwarf]]");
  });

  it("extracts additional movement modes (fly/swim/climb/burrow) from speed trait", () => {
    const result = toRaceCanonical(baseEntry({
      slug: "srd-2024_aarakocra",
      edition: "2024",
      base: {
        key: "srd-2024_aarakocra",
        name: "Aarakocra",
        is_subspecies: false,
        subspecies_of: null,
        desc: "",
        traits: [
          { name: "Speed", desc: "Your walking speed is 30 feet, and you have a fly speed of 50 feet.", type: "SPEED", order: 2 },
        ],
      },
    }));
    expect(result.speed.walk).toBe(30);
    expect(result.speed.fly).toBe(50);
  });
});

describe("raceMergeRule (legacy/structural cases)", () => {
  it("produces canonical Race from Open5e-only entry", () => {
    const canonical: CanonicalEntry = baseEntry({
      slug: "srd-5e_dwarf",
      edition: "2014",
      base: {
        key: "srd_dwarf",
        name: "Dwarf",
        desc: "Born of stone…",
        is_subspecies: false,
        subspecies_of: null,
        traits: [
          { name: "Size", desc: "Your size is Medium.", type: null, order: null },
          { name: "Speed", desc: "Your base walking speed is 25 feet.", type: null, order: null },
          { name: "Darkvision", desc: "{@i 60 feet}.", type: null, order: null },
          { name: "Stonecunning", desc: "Whenever you make an Intelligence (History) check related to stone…", type: null, order: null },
        ],
      },
    });
    const out = toRaceCanonical(canonical);
    expect(out.slug).toBe("srd-5e_dwarf");
    expect(out.edition).toBe("2014");
    expect(out.size).toBe("medium");
    expect(out.speed.walk).toBe(25);
    expect(out.traits.length).toBe(4);
    expect(out.subspecies_of).toBeUndefined();
  });

  it("populates additional_spells from structured-rules `additionalSpells`", () => {
    const canonical: CanonicalEntry = baseEntry({
      slug: "srd-5e_tiefling",
      edition: "2014",
      base: {
        key: "srd_tiefling",
        name: "Tiefling",
        desc: "...",
        is_subspecies: false,
        subspecies_of: null,
        traits: [],
      },
      structured: {
        name: "Tiefling",
        source: "PHB",
        additionalSpells: [{
          known: { "1": ["thaumaturgy"] },
          innate: { "3": ["hellish rebuke"], "5": ["darkness"] },
        }],
      } as never,
    });
    const out = toRaceCanonical(canonical);
    expect(out.additional_spells?.innate).toBeDefined();
    expect(out.additional_spells?.innate?.["3"]).toContain("[[SRD 5e/Spells/Hellish Rebuke|hellish rebuke]]");
  });

  it("merges overlay race_traits action economy onto matching trait by slug", () => {
    const canonical: CanonicalEntry = baseEntry({
      slug: "srd-5e_dragonborn",
      edition: "2014",
      base: {
        key: "srd_dragonborn",
        name: "Dragonborn",
        desc: "...",
        is_subspecies: false,
        subspecies_of: null,
        traits: [
          { name: "Breath Weapon", desc: "Use action to exhale destructive energy.", type: null, order: null },
        ],
      },
      overlay: {
        race_traits: {
          "breath-weapon": {
            action_cost: "action",
            save: { ability: "dex", dc_formula: "8 + PB + CON" },
            damage: { dice: "2d6", type: "(varies)" },
            recharge: "short-rest",
          },
        },
      } as never,
    });
    const out = toRaceCanonical(canonical);
    const breathWeapon = out.traits.find(t => t.name === "Breath Weapon");
    expect(breathWeapon?.action_cost).toBe("action");
    expect(breathWeapon?.save?.ability).toBe("dex");
    expect(breathWeapon?.damage?.dice).toBe("2d6");
  });

  it("emits minimum schema-required defaults for harness compatibility", () => {
    const result = toRaceCanonical(baseEntry({
      slug: "srd-5e_human",
      edition: "2014",
      base: {
        key: "srd_human",
        name: "Human",
        is_subspecies: false,
        subspecies_of: null,
        desc: "...",
        traits: [],
      },
    }));
    expect(result.ability_score_increases).toEqual([]);
    expect(typeof result.age).toBe("string");
    expect(typeof result.alignment).toBe("string");
    expect(result.vision).toBeDefined();
    expect(typeof result.vision).toBe("object");
    expect(result.languages).toBeDefined();
    expect(Array.isArray(result.languages.fixed)).toBe(true);
    expect(typeof result.variant_label).toBe("string");
    expect(result.variant_label.length).toBeGreaterThan(0);
  });

  it("renames trait field from `desc` to `description` to match feature schema", () => {
    const result = toRaceCanonical(baseEntry({
      slug: "srd-5e_dwarf",
      edition: "2014",
      base: {
        key: "srd_dwarf",
        name: "Dwarf",
        is_subspecies: false,
        subspecies_of: null,
        desc: "...",
        traits: [
          { name: "Stonecunning", desc: "Whenever you make...", type: null, order: null },
        ],
      },
    }));
    expect(result.traits[0].description).toContain("Whenever you make");
    expect((result.traits[0] as Record<string, unknown>).desc).toBeUndefined();
  });

  it("auto-extracts darkvision range from a Darkvision trait", () => {
    const result = toRaceCanonical(baseEntry({
      slug: "srd-5e_dwarf",
      edition: "2014",
      base: {
        key: "srd_dwarf",
        name: "Dwarf",
        is_subspecies: false,
        subspecies_of: null,
        desc: "...",
        traits: [
          { name: "Darkvision", desc: "60 feet", type: null, order: null },
        ],
      },
    }));
    expect(result.vision.darkvision).toBe(60);
  });

  it("activation companion fills gaps but loses to overlay", () => {
    const canonical: CanonicalEntry = baseEntry({
      slug: "srd-5e_dragonborn",
      edition: "2014",
      base: {
        key: "srd_dragonborn",
        name: "Dragonborn",
        desc: "...",
        is_subspecies: false,
        subspecies_of: null,
        traits: [{ name: "Breath Weapon", desc: "...", type: null, order: null }],
      },
      activation: { activation: { type: "passive", value: 0 } } as never,
      overlay: { race_traits: { "breath-weapon": { action_cost: "action" } } } as never,
    });
    const out = toRaceCanonical(canonical);
    expect(out.traits[0].action_cost).toBe("action");  // overlay wins over passive
  });

  it("attaches trait-level and entity-level choices from the overlay (SP2 Plan 3)", () => {
    const canonical: CanonicalEntry = baseEntry({
      slug: "srd-2024_elf",
      edition: "2024",
      base: {
        key: "srd-2024_elf",
        name: "Elf",
        desc: "...",
        is_subspecies: false,
        subspecies_of: null,
        traits: [
          { name: "Keen Senses", desc: "You have proficiency in a skill.", type: null, order: null },
        ],
      },
      overlay: {
        race_traits: {
          "keen-senses": {
            choices: [{ kind: "select-proficiency", id: "keen-skill", count: 1, domain: "skill", from: ["insight", "perception", "survival"] }],
          },
        },
        races: {
          elf: {
            choices: [{ kind: "select-entity", id: "elf-lineage", count: 1, entity_type: "race" }],
          },
        },
      } as never,
    });
    const out = toRaceCanonical(canonical);
    const ks = out.traits.find(t => t.name === "Keen Senses");
    expect(ks?.id).toBe("keen-senses");
    expect((ks as { choices?: Array<{ id: string }> }).choices?.[0]?.id).toBe("keen-skill");
    expect((out as { choices?: Array<{ id: string }> }).choices?.[0]?.id).toBe("elf-lineage");
  });

  it("attaches overlay resources (and a trait id) to the matching race trait", () => {
    const canonical: CanonicalEntry = baseEntry({
      slug: "srd-5e_dragonborn",
      edition: "2014",
      base: {
        key: "srd_dragonborn",
        name: "Dragonborn",
        desc: "...",
        is_subspecies: false,
        subspecies_of: null,
        traits: [
          { name: "Breath Weapon", desc: "Exhale destructive energy.", type: null, order: null },
        ],
      },
      overlay: {
        race_traits: {
          "breath-weapon": {
            resources: [{
              id: "dragonborn:breath-weapon", name: "Breath Weapon",
              max_formula: "1", reset: "short-rest",
            }],
          },
        },
      } as never,
    });
    const out = toRaceCanonical(canonical);
    const bw = out.traits.find(t => t.name === "Breath Weapon");
    expect(bw?.resources?.[0]?.id).toBe("dragonborn:breath-weapon");
    expect(bw?.id).toBe("breath-weapon");
  });
});

// R4-P3c: the five SRD-2014 traits that state a proficiency in prose and grant
// nothing. Task 11 authors these exact values into srd-5e.yaml; this pins that
// an authored `effects:` block survives the merge onto the matching trait.
// Weapon values are PLURAL on purpose: singular would render duplicate rows
// against the class data's display vocabulary.
const FIXED_GRANT_TRAITS: Array<[string, string, "skill" | "tool" | "weapon", string[]]> = [
  ["Keen Senses", "keen-senses", "skill", ["perception"]],
  ["Menacing", "menacing", "skill", ["intimidation"]],
  ["Dwarven Combat Training", "dwarven-combat-training", "weapon",
    ["battleaxes", "handaxes", "light hammers", "warhammers"]],
  ["Elf Weapon Training", "elf-weapon-training", "weapon",
    ["longswords", "shortswords", "shortbows", "longbows"]],
  ["Tinker", "tinker", "tool", ["tinker's-tools"]],
];

describe("race-merge: authored trait effects reach canonical (R4-P3c)", () => {
  it.each(FIXED_GRANT_TRAITS)(
    "carries the authored %s effects into the canonical trait",
    (traitName, traitSlug, proficiencyType, values) => {
      const effects = values.map(value => ({
        kind: "proficiency", proficiency_type: proficiencyType, value,
      }));
      const out = toRaceCanonical(baseEntry({
        slug: "srd-5e_elf",
        edition: "2014",
        base: {
          key: "srd_elf",
          name: "Elf",
          desc: "...",
          is_subspecies: false,
          subspecies_of: null,
          traits: [
            { name: traitName, desc: "You have proficiency (stated in prose only).", type: null, order: null },
          ],
        },
        overlay: { race_traits: { [traitSlug]: { effects } }, races: null } as never,
      }));
      expect(out.traits.find(t => t.name === traitName)?.effects).toEqual(effects);
    },
  );
});

// P3a task 7: the Dwarf's Tool Proficiency pool re-slugged from the old prose
// spellings ("smith's tools") to the canonical 35-slug vocabulary
// ("smith's-tools"). `class-merge.test.ts` cannot cover this: the Dwarf pool is
// a RACE TRAIT. Driven off the real srd-5e.yaml through loadOverlay (nothing
// else in this suite parses that file) + raceMergeRule.pickOverlay, because the
// authored value is otherwise inert until the next SRD regeneration.
describe("real overlay: Dwarf Tool Proficiency canonical slugs [P3a task 7]", () => {
  it("merges the three artisan's-tool slugs onto the tool-proficiency trait", async () => {
    const overlayPath = path.resolve(__dirname, "../../../tools/srd-canonical/overlays/srd-5e.yaml");
    const overlay = await loadOverlay(overlayPath);
    const out = toRaceCanonical(baseEntry({
      slug: "srd-5e_dwarf",
      edition: "2014",
      base: {
        key: "srd_dwarf",
        name: "Dwarf",
        desc: "",
        is_subspecies: false,
        subspecies_of: null,
        traits: [
          { name: "Size", desc: "Your size is Medium.", type: null, order: null },
          { name: "Speed", desc: "Your base walking speed is 25 feet.", type: null, order: null },
          {
            name: "Tool Proficiency",
            desc: "You gain proficiency with the artisan's tools of your choice: smith's tools, brewer's supplies, or mason's tools.",
            type: null, order: null,
          },
        ],
      },
      overlay: raceMergeRule.pickOverlay(overlay, "srd-5e_dwarf") as never,
    }));

    const trait = out.traits.find(t => t.name === "Tool Proficiency");
    expect(trait?.id).toBe("tool-proficiency");
    expect(trait?.choices).toHaveLength(1);
    const choice = trait?.choices?.[0];
    expect(choice).toMatchObject({ kind: "select-proficiency", id: "tool", domain: "tool", count: 1 });
    const from = (choice as { from?: string[] } | undefined)?.from;
    expect(from).toHaveLength(3);
    expect(from!.every(s => ARTISANS_TOOLS.includes(s))).toBe(true);
    expect(from).toEqual(["smith's-tools", "brewer's-supplies", "mason's-tools"]);
    // The old prose spelling must be GONE: it is what Volker.md persists today,
    // and it survives only via pool canonicalization, not by staying in the pool.
    expect(from).not.toContain("smith's tools");
  });
});
