import { describe, it, expect } from "vitest";
import { PCResolver } from "../src/pc/pc.resolver";
import { collectChosenProficiencies, buildDecisionLedger } from "../src/pc/pc.decision-engine";
import { buildMockRegistry } from "./mock-entity-registry";
import type { Character } from "../src/pc/pc.types";

// R4-G7 §7.1 RIDER: the resolve-time fold renders ONE row for a repeated feature, and a level-N DECISION on
// that feature must stay a decision at level N. Both readers of a feature's per-level choices walk
// `resolved.features` and take the level from the WRAPPER (`pc.decision-engine.ts`: `visitProficiencyChoices`,
// whose one caller is `collectChosenProficiencies`, and `buildDecisionLedger`), so without the wrapper carrying
// its folded copies the fold silently DROPS every lower copy's pick. The shape is the shipped Rogue's:
// `expertise` repeating at 1 and 6, each copy carrying the same `select-proficiency` choice id.

const expertise = (level: number, withChoices: boolean) => ({
  id: "expertise", name: "Expertise", description: `at ${level}`,
  ...(withChoices
    ? { choices: [{ kind: "select-proficiency", id: "expertise", count: 2, domain: "skill", from_proficient: true, expertise: true }] }
    : {}),
});
const ROGUE = {
  slug: "fx_class_rogue", name: "Rogue", hit_die: "d8", edition: "2014",
  primary_abilities: ["dex"], saving_throws: ["dex", "int"], table: {},
  // The level-3 copy carries NO choices: it must contribute no `foldedFrom` entry (nothing is walked twice).
  features_by_level: { "1": [expertise(1, true)], "3": [expertise(3, false)], "6": [expertise(6, true)] },
};
const registry = () => buildMockRegistry([{ slug: "fx_class_rogue", entityType: "class", data: ROGUE }]);
const rogue6 = (): Character => ({
  name: "Sneak", edition: "2014", race: null, subrace: null, background: null,
  class: [{ name: "[[fx_class_rogue]]", level: 6, subclass: null,
    choices: { 1: { expertise: ["stealth", "perception"] }, 6: { expertise: ["arcana", "athletics"] } } }],
  abilities: { str: 10, dex: 16, con: 12, int: 12, wis: 12, cha: 10 },
  ability_method: "manual", skills: { proficient: ["stealth", "perception", "arcana", "athletics"], expertise: [] },
  spells: { known: [], overrides: [] }, equipment: [], overrides: {}, origin_choices: {},
  state: { hp: { current: 8, max: 8, temp: 0 }, hit_dice: {}, spell_slots: {}, concentration: null, conditions: [], exhaustion: 0, inspiration: 0, feature_uses: {} },
}) as unknown as Character;

describe("a folded feature's lower copies keep their decisions at their own levels (spec §7.1 rider)", () => {
  it("collectChosenProficiencies collects the level-1 picks as well as the level-6 ones (m10's kill row)", () => {
    const { character } = new PCResolver(registry()).resolve(rogue6());
    // RED FIRST: the fold left ONE wrapper at level 6, so the walk read `choices[6]` only and returned
    // ["arcana","athletics"]. Ascending order, the pre-fold order: the folded copies are walked first.
    expect(collectChosenProficiencies(character).expertise).toEqual(["stealth", "perception", "arcana", "athletics"]);
    expect(character.features.filter((f) => f.feature.id === "expertise")).toHaveLength(1);
  });

  it("the decision ledger offers the row at BOTH levels, each resolved (m11's kill row)", () => {
    const reg = registry();
    const { character } = new PCResolver(reg).resolve(rogue6());
    const items = buildDecisionLedger(character, { registry: reg } as never)
      .classes[0].levels.flatMap((l) => l.items).filter((i) => i.key === "expertise");
    // RED FIRST: only the level-6 row was offered, so the level-1 picks were persisted and unreachable.
    // The level-3 copy carries prose but no choices, so it contributes its own INFORMATIONAL card at 3, which
    // is exactly what the un-folded list emitted (fix round 1).
    expect(items.map((i) => i.level)).toEqual([1, 3, 6]);
    // "done" in this engine's vocabulary is `resolved` (DecisionStatus = resolved | partial | unresolved | informational).
    expect(items.map((i) => i.status)).toEqual(["resolved", "informational", "resolved"]);
    expect(items.filter((i) => i.status === "resolved").map((i) => i.selected)).toEqual([["stealth", "perception"], ["arcana", "athletics"]]);
    expect(items[1].description).toBe("at 3");
  });

  it("the wrapper carries ONE entry per choice-CARRYING lower copy, and the top copy's choices stay on the feature", () => {
    const { character } = new PCResolver(registry()).resolve(rogue6());
    const rf = character.features.find((f) => f.feature.id === "expertise")!;
    // EVERY folded lower copy is carried, ascending, so the builder's per-level strip can show a card for a
    // choice-LESS copy too; only the copies that carry `choices` carry them, so no copy's choices are visited
    // twice (the top copy's stay on `feature.choices`).
    expect(rf.foldedFrom?.map((c) => c.level)).toEqual([1, 3]);
    expect(rf.foldedFrom?.map((c) => c.choices?.length ?? 0)).toEqual([1, 0]);
    expect(rf.foldedFrom?.[0].choices?.map((c) => c.id)).toEqual(["expertise"]);
    expect(rf.feature.choices?.map((c) => c.id)).toEqual(["expertise"]);
    expect((rf.source as { level: number }).level).toBe(6);
  });

  // R4-G7 §7.1 fix round 1: `buildDecisionLedger` emits ONE informational card per feature copy, so "EVERY gained
  // feature appears in the per-level strip (complete view; no silent gaps)". A family that carries choices on NO
  // copy (93 of the 131 repeated families across both corpora) must therefore keep a card at EVERY level it was
  // gained at, with that copy's OWN name and prose (MEASURED: 63 of the 131 families have a copy whose
  // description differs from the top copy's, and 1 has a differing name).
  const bardic = (level: number) => ({ id: "bardic-inspiration", name: `Bardic Inspiration ${level}`, description: `You inspire, at ${level}.` });
  const BARD = { slug: "fx_class_bard", name: "Bard", hit_die: "d8", edition: "2014", primary_abilities: ["cha"], saving_throws: ["dex", "cha"], table: {},
    features_by_level: { "1": [bardic(1)], "5": [bardic(5)] } };
  const bard7 = (): Character => ({
    ...rogue6(), name: "Singer",
    class: [{ name: "[[fx_class_bard]]", level: 7, subclass: null, choices: {} }],
  }) as unknown as Character;

  it("a repeated feature that carries NO choices keeps its per-level informational card at EVERY level (m12's kill row)", () => {
    const reg = buildMockRegistry([{ slug: "fx_class_bard", entityType: "class", data: BARD }]);
    const { character } = new PCResolver(reg).resolve(bard7());
    const items = buildDecisionLedger(character, { registry: reg } as never)
      .classes[0].levels.flatMap((l) => l.items).filter((i) => i.key === "bardic-inspiration");
    // RED FIRST: the fold left ONE wrapper at level 5, so the strip lost the level-1 card entirely.
    expect(items.map((i) => i.level)).toEqual([1, 5]);
    expect(items.map((i) => i.status)).toEqual(["informational", "informational"]);
    // Each card carries ITS OWN copy's name and prose, not the top copy's.
    expect(items.map((i) => i.featureName)).toEqual(["Bardic Inspiration 1", "Bardic Inspiration 5"]);
    expect(items.map((i) => i.description)).toEqual(["You inspire, at 1.", "You inspire, at 5."]);
    // and the SHEET still renders ONE row.
    expect(character.features.filter((f) => f.feature.id === "bardic-inspiration")).toHaveLength(1);
  });

  it("an UNFOLDED feature carries no foldedFrom at all (the field is absent, not empty)", () => {
    const solo = { ...ROGUE, features_by_level: { "1": [expertise(1, true)] } };
    const reg = buildMockRegistry([{ slug: "fx_class_rogue", entityType: "class", data: solo }]);
    const { character } = new PCResolver(reg).resolve(rogue6());
    const rf = character.features.find((f) => f.feature.id === "expertise")!;
    expect("foldedFrom" in rf).toBe(false);
    expect(collectChosenProficiencies(character).expertise).toEqual(["stealth", "perception"]);
  });
});
