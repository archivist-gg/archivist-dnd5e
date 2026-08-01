import { describe, it, expect } from "vitest";
import { ALL_LANGUAGES, STANDARD_LANGUAGES, EXOTIC_LANGUAGES } from "@archivist-gg/dnd5e/types/choice";
import { buildDecisionLedger } from "@archivist-gg/dnd5e/pc/pc.decision-engine";
import type { ResolvedCharacter } from "@archivist-gg/dnd5e/pc/pc.types";
// Relative import retained for locality; the module is also reachable as
// `@archivist-gg/dnd5e/pc/pc.proficiency-normalize` (added R4-P3b for plugin-side slug matching).
import { humanizeProficiency } from "../src/pc/pc.proficiency-normalize";

// A minimal registry: the select-proficiency branch never consults it.
const registry = {
  search: () => [],
  getByTypeAndSlug: () => undefined,
};

/** A single-class fighter whose only decision is a language pick with NO `from`,
 *  so enumerateOptions must fall back to the full ALL_LANGUAGES pool. */
function resolvedWithLanguageChoice(): ResolvedCharacter {
  const langFeature = {
    id: "extra-language", name: "Extra Language", description: "Choose a language.",
    choices: [{ kind: "select-proficiency", id: "extra-language", count: 1, domain: "language" }],
  };
  const entity = {
    slug: "srd-2024_fighter", name: "Fighter",
    // No skill_choices.from → the L1 skills decision is not synthesized.
    skill_choices: { count: 0, from: [] },
    features_by_level: { 1: [langFeature] }, starting_equipment: [],
  };
  const definition = {
    name: "T", edition: "2024", race: null, subrace: null, background: null,
    class: [{ name: "[[fighter]]", level: 1, subclass: null, choices: {} }],
    abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    ability_method: "manual", skills: { proficient: [], expertise: [] },
    spells: { known: [], overrides: [] }, equipment: [], overrides: {}, origin_choices: {},
    state: { hp: { current: 1, max: 1, temp: 0 }, hit_dice: {}, spell_slots: {}, concentration: null,
      conditions: [], exhaustion: 0, inspiration: 0, feature_uses: {} },
  } as unknown as ResolvedCharacter["definition"];
  const cls = { entity, level: 1, subclass: null, choices: {} } as unknown as ResolvedCharacter["classes"][number];
  const features = [{ feature: langFeature, source: { kind: "class", slug: entity.slug, level: 1 } }];
  return {
    definition, race: null, classes: [cls], background: null, feats: [],
    totalLevel: 1, features, spells: [], pools: [], state: definition.state,
  } as unknown as ResolvedCharacter;
}

describe("ALL_LANGUAGES", () => {
  it("contains the SRD standard + exotic set with common and deep-speech", () => {
    expect(ALL_LANGUAGES).toContain("common");
    expect(ALL_LANGUAGES).toContain("deep-speech");
    expect(ALL_LANGUAGES.length).toBe(16);
    expect(new Set(ALL_LANGUAGES).size).toBe(ALL_LANGUAGES.length); // no dupes
  });

  it("composes exactly the 8 standard + 8 exotic slugs", () => {
    expect(STANDARD_LANGUAGES).toEqual([
      "common", "dwarvish", "elvish", "giant", "gnomish", "goblin", "halfling", "orc",
    ]);
    expect(EXOTIC_LANGUAGES).toEqual([
      "abyssal", "celestial", "deep-speech", "draconic", "infernal", "primordial",
      "sylvan", "undercommon",
    ]);
    expect(ALL_LANGUAGES).toEqual([...STANDARD_LANGUAGES, ...EXOTIC_LANGUAGES]);
  });
});

describe("buildDecisionLedger: language picker options", () => {
  it("resolves a domain:\"language\" select-proficiency with no `from` to the full ALL_LANGUAGES pool, humanized", () => {
    const ledger = buildDecisionLedger(resolvedWithLanguageChoice(), { registry } as never);
    const item = ledger.classes[0].levels.flatMap((l) => l.items).find((i) => i.key === "extra-language")!;
    expect(item).toBeDefined();
    expect(item.choice.kind).toBe("select-proficiency");

    // Call the shared humanizer rather than transcribing a formula inline: the
    // old copy locked `\b\w`, which the implementation no longer uses. No label
    // here changes (no language slug contains an apostrophe, the only input the
    // two formulas disagree on), so this is hygiene, not a repair.
    const expected = ALL_LANGUAGES.map((v) => ({ value: v, label: humanizeProficiency(v) }));
    expect(item.options).toEqual(expected);

    // The compound slug humanizes both words.
    const deepSpeech = item.options.find((o) => o.value === "deep-speech")!;
    expect(deepSpeech.label).toBe("Deep Speech");
  });
});
