import { describe, it, expect } from "vitest";
import { abilityBonusBreakdown, recalc } from "../src/pc/pc.recalc";
import { assembleEffectFeatures, computeFeatureEffects } from "../src/pc/pc.feature-effects";
import type { ResolvedCharacter, ResolvedClass, ResolvedFeature } from "../src/pc/pc.types";
import type { Character } from "../src/pc/pc.types";
import type { FeatureEffect } from "@archivist-gg/dnd5e/types/feature-effect";
import { buildMockRegistry } from "./mock-entity-registry";

// R4-G3b §4 (user ruling 4, 2026-09-03): the three fixed-list level-20 capstones fold FLAT into
// the ability scores, with NO cap of any kind. The five helpers below are copied VERBATIM from
// tests/pc-recalc-feature-effects.test.ts (its :11-74 on dnd5e cc9d9a4) so this file owns its own
// fixtures and neither file's edits can silently move the other's ground, EXCEPT two keys added to
// `emptyResolved`: `pools: []` and `weaponMasteries: []`. The source omits both and carries TS2739 at
// its :29 for it; this file has to typecheck clean. Every reader of either key is `?? []`-guarded
// (pc.feature-effects.ts `resolved.pools ?? []`, pc.recalc.ts `resolved.weaponMasteries ?? []`; the one
// unguarded `for (const pool of resolved.pools)` is in buildDecisionLedger, off recalc's path), and
// recalc's output for all four fixtures below is deep-equal with and without them (measured, evidence
// g3b-t2-emptyresolved-neutrality-out.txt).

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

function resolvedWith(level: ResolvedClass, effects: FeatureEffect[]): ResolvedCharacter {
  const r = emptyResolved();
  r.classes = [level];
  r.features.push(effectFeature(effects));
  return r;
}

function resolvedWithEquipment(
  effects: FeatureEffect[],
  equipment: Character["equipment"],
): ResolvedCharacter {
  const r = resolvedWith(mkClass("fighter", "d10", 1), effects);
  r.definition.equipment = equipment;
  return r;
}

const PRIMAL_CHAMPION = [{ kind: "ability-score-increase", abilities: ["str", "con"], amount: 4, choose: null, max: 24 }] as FeatureEffect[];

/** PHB 2014 Barbarian 20 carrying Primal Champion, with the two capstone abilities seeded. */
const barb = (str: number, con: number) => {
  const r = resolvedWith(mkClass("barbarian", "d12", 20), PRIMAL_CHAMPION);
  r.definition.abilities = { ...r.definition.abilities, str, con };
  return r;
};

describe("recalc · the flat capstone fold (R4-G3b §4)", () => {
  it("Barbarian 20 base Str 20 / Con 14 with EMPTY equipment → 24 / 18", () => {
    const d = recalc(barb(20, 14));
    // RED FIRST before Task 2 (cc9d9a4): 20 (the fold was not wired into the item-bonus loop).
    expect(d.scores.str).toBe(24);
    expect(d.scores.con).toBe(18);
  });

  // RED FIRST before Task 2 (cc9d9a4): 25.
  it("no clamp anywhere: a base 25 becomes 29 (user ruling 4)", () => expect(recalc(barb(25, 10)).scores.str).toBe(29));

  it("the fold lands BEFORE the raise-only item static: base 17 + 4 = 21, then a Belt static 21 does not raise it", () => {
    const BELT = { name: "Belt of Hill Giant Strength", slug: "belt-21", type: "wondrous", rarity: "rare",
      bonuses: { ability_scores: { static: { str: 21 } } }, attunement: { required: true } };
    const reg = buildMockRegistry([{ slug: "belt-21", entityType: "item", name: BELT.name, data: BELT }]);
    const r = barb(17, 10);
    // The registry stub AND the EQUIPPED+ATTUNED entry are both load-bearing: the static fold runs only
    // under computeAppliedBonuses, which recalc reaches only with a registry (pc.recalc.ts, the
    // `registry ? computeAppliedBonuses(...) : emptyAppliedBonuses()` fork) · Gate 1 A D row 5.
    r.definition.equipment = [{ item: "[[belt-21]]", equipped: true, attuned: true }] as never;
    // RED under M-5 (the fold moved AFTER the raise-only static): 25. This row was green before Task 2 for the
    // wrong reason (17 + 0, then the static raised it to 21), so M-5 is the guard that gives it kill power.
    expect(recalc(r, reg).scores.str).toBe(21);
  });

  it("a user override still wins", () => {
    const r = barb(20, 14);
    r.definition.overrides = { scores: { str: 18 } } as never;
    expect(recalc(r).scores.str).toBe(18);
  });

  it("abilityBonusBreakdown attributes the +4 to the `class` bucket when threaded", () => {
    const r = barb(20, 14);
    const { features, activeBuffs } = assembleEffectFeatures(r);
    // RED FIRST before Task 2 (cc9d9a4): 0 (the second parameter did not exist).
    expect(abilityBonusBreakdown(r, computeFeatureEffects(features, { activeBuffs })).str.class).toBe(4);
    // Unthreaded: the legacy four buckets only, so the capstone is invisible to a one-argument caller.
    expect(abilityBonusBreakdown(r).str.class).toBe(0);
  });
});
