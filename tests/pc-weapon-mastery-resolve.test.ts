import { describe, it, expect } from "vitest";
import { PCResolver } from "../src/pc/pc.resolver";
import { buildMockRegistry } from "./mock-entity-registry";
import type { Character, ResolvedCharacter } from "../src/pc/pc.types";

// Task 2: consume the weapon-mastery choose-N selection. A 2024 martial class
// authors a `weapon-mastery` select-entity{entity_type:"weapon"} choice; the
// picked weapon slugs persist under key "weapon-mastery". The resolver unions
// the picks (bare-normalized) into ResolvedCharacter.weaponMasteries and folds
// the chosen weapon NAMES onto the Weapon-Mastery feature's chosenInline.
//
// Fixture pattern COPIED from the local (non-exported) hexbladeChar()
// (tests/pc-inline-pick.e2e.test.ts) / ravagerChar() (tests/pc-damage-rider.e2e.test.ts).

const FIGHTER_2024 = {
  slug: "fighter", name: "Fighter", edition: "2024", hit_die: "d10",
  primary_abilities: ["str"], saving_throws: ["str", "con"],
  features_by_level: {
    1: [{
      id: "weapon-mastery", name: "Weapon Mastery",
      description: "You gain mastery with a number of weapons.",
      choices: [{ kind: "select-entity", id: "weapon-mastery", entity_type: "weapon", count: 3 }],
    }],
  },
};

const ILLRIGGER = {
  slug: "illrigger", name: "Illrigger", edition: "2014", hit_die: "d10",
  primary_abilities: ["cha"], saving_throws: ["con", "cha"],
  features_by_level: {
    1: [{ id: "hellish-invocations", name: "Hellish Invocations", description: "Infernal knacks." }],
  },
};

function fighterChar(picks: string[]): Character {
  return {
    name: "Fig", edition: "2024", race: null, subrace: null, background: null,
    class: [{ name: "[[fighter]]", level: 1, subclass: null, choices: { 1: { "weapon-mastery": picks } } }],
    abilities: { str: 16, dex: 12, con: 14, int: 10, wis: 10, cha: 8 },
    ability_method: "manual",
    skills: { proficient: [], expertise: [] },
    spells: { known: [], overrides: [] },
    equipment: [],
    overrides: {},
    state: { hp: { current: 10, max: 10, temp: 0 }, hit_dice: {}, spell_slots: {}, concentration: null, conditions: [] },
  } as unknown as Character;
}

function illriggerChar(): Character {
  return {
    name: "Ill", edition: "2014", race: null, subrace: null, background: null,
    class: [{ name: "[[illrigger]]", level: 1, subclass: null, choices: {} }],
    abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 16 },
    ability_method: "manual",
    skills: { proficient: [], expertise: [] },
    spells: { known: [], overrides: [] },
    equipment: [],
    overrides: {},
    state: { hp: { current: 10, max: 10, temp: 0 }, hit_dice: {}, spell_slots: {}, concentration: null, conditions: [] },
  } as unknown as Character;
}

function resolveFighterWith(picks: string[]): ResolvedCharacter {
  const reg = buildMockRegistry([
    { slug: "fighter", entityType: "class", data: FIGHTER_2024 },
    { slug: "srd-2024_greatsword", entityType: "weapon", name: "Greatsword", data: { slug: "srd-2024_greatsword", name: "Greatsword" } },
    { slug: "srd-2024_longsword", entityType: "weapon", name: "Longsword", data: { slug: "srd-2024_longsword", name: "Longsword" } },
    { slug: "srd-2024_dagger", entityType: "weapon", name: "Dagger", data: { slug: "srd-2024_dagger", name: "Dagger" } },
  ]);
  return new PCResolver(reg).resolve(fighterChar(picks)).character;
}

function resolveIllrigger(): ResolvedCharacter {
  const reg = buildMockRegistry([{ slug: "illrigger", entityType: "class", data: ILLRIGGER }]);
  return new PCResolver(reg).resolve(illriggerChar()).character;
}

describe("Task 2: resolve chosen weapon masteries + fold names onto the feature card", () => {
  // Fighter with weapon-mastery picks → resolved.weaponMasteries = bare slugs; feature card lists names.
  // NB (Gate-2 MF-2): ResolvedFeature is { feature, source, chosenInline? } — id/choices live on .feature.
  it("collects chosen weapon masteries (bare) across levels + folds names onto the feature", () => {
    const resolved = resolveFighterWith(["srd-2024_greatsword", "srd-2024_longsword", "srd-2024_dagger"]);
    expect([...resolved.weaponMasteries].sort()).toEqual(["dagger", "greatsword", "longsword"]);
    const wm = resolved.features.find(rf => rf.feature.id === "weapon-mastery");
    const chosen = wm?.chosenInline?.find(c => c.label === "Mastered weapons");
    expect(chosen?.description).toContain("Greatsword");
    expect(chosen?.description).toContain("Longsword");
  });

  it("normalizes a bare-authored pick too, and an Illrigger has no masteries", () => {
    expect([...resolveFighterWith(["greatsword"]).weaponMasteries]).toEqual(["greatsword"]);
    expect(resolveIllrigger().weaponMasteries).toEqual([]);
  });
});
