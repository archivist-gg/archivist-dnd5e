import { describe, it, expect } from "vitest";
import { PCResolver } from "../src/pc/pc.resolver";
import { collectChosenProficiencies, buildDecisionLedger } from "../src/pc/pc.decision-engine";
import { buildMockRegistry } from "./mock-entity-registry";
import type { Character } from "../src/pc/pc.types";

/** `Choice` is a union and only some arms declare `count`; every row read here is a `select-proficiency`. */
const countOf = (c: unknown): number | undefined => (c as { count?: number }).count;

// R4-G7 §7.1 RIDER: the resolve-time fold renders ONE row for a repeated feature, and a level-N DECISION on
// that feature must stay a decision at level N. Both readers of a feature's per-level choices walk
// `resolved.features` and take the level from the WRAPPER (`pc.decision-engine.ts`: `visitProficiencyChoices`,
// whose one caller is `collectChosenProficiencies`, and `buildDecisionLedger`), so without the wrapper carrying
// its folded copies the fold silently DROPS every lower copy's pick. The shape is the shipped Rogue's:
// `expertise` repeating at 1 and 6, each copy carrying the same `select-proficiency` choice id.

const expertise = (level: number, withChoices: boolean) => ({
  // Distinct NAMES per copy so the assertions can prove each row carries ITS OWN copy's identity: the id is what
  // folds them (and what the recognizer keys on), never the name.
  id: "expertise", name: `Expertise ${level}`, description: `at ${level}`,
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
    // The level-3 copy carries prose and no choices, and `expertise` is in the recognizer's TABLE, so the
    // un-folded ledger emitted a SYNTHESIZED `select-proficiency` decision there, not a card (fix round 2).
    expect(items.map((i) => i.level)).toEqual([1, 3, 6]);
    // "done" in this engine's vocabulary is `resolved` (DecisionStatus = resolved | partial | unresolved | informational).
    // The level-3 row is resolved because this character already HOLDS four expertise picks (the F4 inclusion).
    expect(items.map((i) => i.status)).toEqual(["resolved", "resolved", "resolved"]);
    expect(items[1].choice.kind).toBe("select-proficiency");
    expect(countOf(items[1].choice)).toBe(2);
    // This character already holds all four of its skill proficiencies as expertise (levels 1 and 6), so the
    // level-3 row offers nothing left to pick and reads `resolved`; the four-option shape is pinned by the
    // pick-less probes below.
    expect(items[1].options).toHaveLength(0);
    expect(items[1].description).toBe("at 3");
    // Fix round 2 finding B: a lower copy's DECISION row carries its own name and prose, not the top copy's.
    expect(items.map((i) => i.featureName)).toEqual(["Expertise 1", "Expertise 3", "Expertise 6"]);
    expect(items.map((i) => i.description)).toEqual(["at 1", "at 3", "at 6"]);
    expect(items.filter((i) => i.level !== 3).map((i) => i.selected)).toEqual([["stealth", "perception"], ["arcana", "athletics"]]);
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

  // The reviewer's read-only probes, as tests. C: a repeated recognizer-TABLE id that carries prose on NO copy
  // must yield the SYNTHESIZED decision at EVERY level, not one decision and one card. D: the same shape
  // un-folded, the ground truth C is measured against (m13's pair).
  const proseOnly = (level: number) => ({ id: "expertise", name: `Expertise ${level}`, description: `Choose two of your skill proficiencies, at ${level}.` });
  const rogueAt = (levels: number[], charLevel: number) => {
    const features_by_level = Object.fromEntries(levels.map((l) => [String(l), [proseOnly(l)]]));
    const reg = buildMockRegistry([{ slug: "fx_class_rogue", entityType: "class", data: { ...ROGUE, features_by_level } }]);
    const ch = { ...rogue6(), class: [{ name: "[[fx_class_rogue]]", level: charLevel, subclass: null, choices: {} }] } as unknown as Character;
    const { character } = new PCResolver(reg).resolve(ch);
    return buildDecisionLedger(character, { registry: reg } as never)
      .classes[0].levels.flatMap((l) => l.items).filter((i) => i.key === "expertise");
  };

  it("a FOLDED recognizer-table family with prose on every copy keeps the SYNTHESIZED decision at every level (m13's kill row)", () => {
    const items = rogueAt([3, 6], 6);
    // RED FIRST (fix round 2): the folded level-3 copy fell straight to the informational card, so a 2-pick
    // control became an inert row.
    expect(items.map((i) => [i.level, i.choice.kind, i.status])).toEqual([[3, "select-proficiency", "unresolved"], [6, "select-proficiency", "unresolved"]]);
    expect(items.map((i) => countOf(i.choice))).toEqual([2, 2]);
    expect(items.map((i) => i.options.length)).toEqual([4, 4]);
  });

  it("the UN-FOLDED ground truth: the same prose-only copy at one level yields the same synthesized decision (CONTROL)", () => {
    const items = rogueAt([6], 6);
    expect(items.map((i) => [i.level, i.choice.kind, i.status])).toEqual([[6, "select-proficiency", "unresolved"]]);
    expect(countOf(items[0].choice)).toBe(2);
    expect(items[0].options).toHaveLength(4);
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
