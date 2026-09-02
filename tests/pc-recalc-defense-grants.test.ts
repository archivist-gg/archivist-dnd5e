import { describe, it, expect } from "vitest";
import { recalc } from "../src/pc/pc.recalc";
import type { ResolvedCharacter, ResolvedClass, ResolvedFeature } from "../src/pc/pc.types";
import type { FeatureEffect } from "../src/types/feature-effect";

// Builders copied from tests/pc-recalc-feature-effects.test.ts (the sibling file whose
// `recalc — feature effects: defenses` describe covers the resistance path). `emptyResolved`
// carries `pools: []` and `weaponMasteries: []`, which the sibling omits: both are NON-optional
// on ResolvedCharacter, and this file is held to zero per-file `tsc --noEmit` errors, so the
// omission the sibling can afford (its base carries that TS2739) is spelled out here instead.
// Behaviour is identical · every reader of both fields is `?? []`.
function mkClass(slug: string, die: string, level: number): ResolvedClass {
  return {
    entity: {
      slug,
      name: slug,
      edition: "2014",
      hit_die: die,
      primary_abilities: ["str"],
      saving_throws: [],
      features_by_level: {},
    } as never,
    level,
    subclass: null,
    choices: {},
  };
}

function emptyResolved(): ResolvedCharacter {
  return {
    definition: {
      name: "T",
      edition: "2014",
      race: null,
      subrace: null,
      background: null,
      class: [],
      abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
      ability_method: "manual",
      skills: { proficient: [], expertise: [] },
      spells: { known: [], overrides: [] },
      equipment: [],
      overrides: {},
      state: { hp: { current: 1, max: 1, temp: 0 }, hit_dice: {}, spell_slots: {}, concentration: null, conditions: [] },
    } as never,
    race: null,
    classes: [],
    background: null,
    feats: [],
    totalLevel: 0,
    features: [],
    spells: [],
    pools: [],
    weaponMasteries: [],
    state: { hp: { current: 1, max: 1, temp: 0 }, hit_dice: {}, spell_slots: {}, concentration: null, conditions: [] } as never,
  };
}

function effectFeature(effects: FeatureEffect[], name = "Effect Source"): ResolvedFeature {
  return { feature: { name, effects } as never, source: { kind: "race", slug: "test-race" } };
}

function resolvedWith(level: ResolvedClass, effects: FeatureEffect[], name = "Effect Source"): ResolvedCharacter {
  const r = emptyResolved();
  r.classes = [level];
  r.features.push(effectFeature(effects, name));
  return r;
}

function withTwo(a: [FeatureEffect[], string], b: [FeatureEffect[], string]): ResolvedCharacter {
  const r = emptyResolved();
  r.classes = [mkClass("monk", "d8", 10)];
  r.features.push(effectFeature(a[0], a[1]), effectFeature(b[0], b[1]));
  return r;
}

describe("defense grants (R4-G3a §3)", () => {
  it("folds immunity into immunities with origin grant and the feature name as source", () => {
    const d = recalc(resolvedWith(mkClass("monk", "d8", 10),
      [{ kind: "immunity", damage_type: "poison", subject: "self" }], "Purity of Body"));
    const e = d.defenses.immunities.find((x) => x.value === "poison");
    expect(e?.origin).toBe("grant");
    expect(e?.label).toBe("poison");
    expect(e?.sources).toEqual(["Purity of Body"]);
    expect(e?.condition).toBeUndefined();
  });

  it("folds vulnerability into vulnerabilities", () => {
    const d = recalc(resolvedWith(mkClass("warlock", "d8", 5),
      [{ kind: "vulnerability", damage_type: "fire" }], "Tomb of Levistus"));
    expect(d.defenses.vulnerabilities.map((x) => x.value)).toEqual(["fire"]);
    expect(d.defenses.vulnerabilities[0]?.sources).toEqual(["Tomb of Levistus"]);
  });

  it("folds REGARDLESS of condition and carries it (Undead-Patron-shaped)", () => {
    const d = recalc(resolvedWith(mkClass("warlock", "d8", 6),
      [{ kind: "immunity", damage_type: "necrotic", subject: "self", condition: "While using your Form of Dread" }],
      "Form of Dread"));
    expect(d.defenses.immunities.map((x) => x.value)).toEqual(["necrotic"]);
    expect(d.defenses.immunities[0]?.condition).toBe("While using your Form of Dread");
  });

  it("merges sources for the same value from two features", () => {
    const d = recalc(withTwo(
      [[{ kind: "immunity", damage_type: "poison", subject: "self" }], "Purity of Body"],
      [[{ kind: "immunity", damage_type: "Poison" }], "Yuan-ti Heritage"]));
    expect(d.defenses.immunities).toHaveLength(1);
    expect(d.defenses.immunities[0]?.sources).toEqual(["Purity of Body", "Yuan-ti Heritage"]);
  });

  it("suppression removes a granted immunity", () => {
    const r = resolvedWith(mkClass("monk", "d8", 10), [{ kind: "immunity", damage_type: "poison", subject: "self" }], "Purity of Body");
    (r.definition as unknown as { overrides: { defenses: { immunities: { remove: string[] } } } }).overrides =
      { defenses: { immunities: { remove: ["poison"] } } };
    const d = recalc(r);
    expect(d.defenses.immunities.find((x) => x.value === "poison")).toBeUndefined();
  });

  it("a manual entry colliding with a grant keeps the manual spelling, promotes origin, attaches the source", () => {
    const r = resolvedWith(mkClass("monk", "d8", 10), [{ kind: "immunity", damage_type: "Poison", subject: "self" }], "Purity of Body");
    r.definition.defenses = { resistances: [], immunities: ["poison"], vulnerabilities: [], condition_immunities: [] };
    const d = recalc(r);
    expect(d.defenses.immunities).toHaveLength(1);
    expect(d.defenses.immunities[0]).toMatchObject({ value: "poison", label: "poison", origin: "grant", sources: ["Purity of Body"] });
  });

  it("resistance keeps the G1a shape through the reshape (regression)", () => {
    const d = recalc(resolvedWith(mkClass("rogue", "d8", 1),
      [{ kind: "resistance", damage_type: "Fire" }, { kind: "resistance", damage_type: "Cold" }]));
    expect(d.defenses.resistances.map((e) => e.label)).toEqual(["Fire", "Cold"]);
    expect(d.defenses.resistances[0]?.origin).toBe("grant");
  });
});

/**
 * §14 row 20's ENGINE half. The row's declared RED was the plugin's `pc-ac-tooltip` title test,
 * but that test hands `renderACTooltip` an ACTerm[] literal and never calls `recalc`, so dropping
 * the carry in `featureAcTermsFor` leaves it green (MEASURED: the mutant survived the plugin file
 * 8/8 and the whole dnd5e suite 1748/1748). The row needs an assertion on the OUTPUT of the carry,
 * which is this. The plugin test still guards the render half · a `title` the row does not set.
 */
describe("AC term qualifier (R4-G3a §3.2.5)", () => {
  it("an ac-bonus effect's condition rides the ACTerm into acBreakdown", () => {
    // No `requires_armor`: this fixture has no registry, so recalc takes the unarmored branch
    // (`featureAcTermsFor(false)`) and an armor-gated term would be filtered out before the
    // assertion could see its condition at all.
    const d = recalc(resolvedWith(mkClass("fighter", "d10", 1),
      [{ kind: "ac-bonus", value: 1, condition: "While wearing heavy armor" }], "Defense"));
    const t = d.acBreakdown.find((x) => x.source === "Defense");
    expect(t?.kind).toBe("feature");
    expect(t?.amount).toBe(1);
    expect(t?.condition).toBe("While wearing heavy armor");
  });

  it("an ac-bonus effect with no condition leaves the ACTerm unqualified", () => {
    const d = recalc(resolvedWith(mkClass("fighter", "d10", 1),
      [{ kind: "ac-bonus", value: 1 }], "Defense"));
    expect(d.acBreakdown.find((x) => x.source === "Defense")?.condition).toBeUndefined();
  });
});
