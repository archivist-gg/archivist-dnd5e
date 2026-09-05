import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { resourceLevelFor, resolveFeatureResources, resolveResourceIndex, poolSaveDC } from "../src/pc/pc.resources";
import { __resetWarnOnceForTests } from "../src/dnd/warn-once";
import type { ResolvedCharacter, ResolvedFeature, ResolvedPool, DerivedStats } from "../src/pc/pc.types";

/** A Barbarian 5 / Fighter 5 whose Fighter has the Battle Master subclass. */
const multiclass = {
  totalLevel: 10,
  classes: [
    { entity: { slug: "phb_class_barbarian" }, level: 5, subclass: null, choices: {} },
    { entity: { slug: "phb_class_fighter" }, level: 5, subclass: { slug: "phb_subclass_battle-master" }, choices: {} },
  ],
} as unknown as ResolvedCharacter;

describe("resourceLevelFor (R4-G4 §6.2.4)", () => {
  it("a class source resolves at that class's level, not the total", () => {
    expect(resourceLevelFor({ kind: "class", slug: "phb_class_barbarian", level: 1 }, multiclass)).toBe(5);
  });
  it("a subclass source resolves at the OWNING class's level", () => {
    expect(resourceLevelFor({ kind: "subclass", slug: "phb_subclass_battle-master", level: 3 }, multiclass)).toBe(5);
  });
  it("race / feat / background sources and an unknown class resolve at the total level", () => {
    expect(resourceLevelFor({ kind: "race", slug: "x" }, multiclass)).toBe(10);
    expect(resourceLevelFor({ kind: "class", slug: "nope", level: 1 }, multiclass)).toBe(10);
  });
});

const rf = (feature: object, source: object): ResolvedFeature => ({ feature, source } as unknown as ResolvedFeature);

describe("resolveFeatureResources (R4-G4 §3.2.1)", () => {
  it("stamps the DECLARING feature as the owner and reads the resource's own name", () => {
    const idx = resolveFeatureResources([
      rf({ id: "combat-superiority", name: "Combat Superiority",
           resources: [{ id: "fighter-2024:superiority-dice", name: "Superiority Dice", max_formula: "4", reset: "short-rest",
                         die: { base: "d8", scaling: { "10": "d10", "18": "d12" } } }] },
         { kind: "subclass", slug: "phb-2024_subclass_battle-master", level: 3 }),
    ]);
    const r = idx.get("fighter-2024:superiority-dice")!;
    expect(r.owner).toEqual({ kind: "feature", featureId: "combat-superiority", featureName: "Combat Superiority",
      source: { kind: "subclass", slug: "phb-2024_subclass_battle-master", level: 3 } });
    expect(r.name).toBe("Superiority Dice");
    expect(r.die).toEqual({ base: "d8", scaling: { "10": "d10", "18": "d12" } });
  });
  it("falls back to the feature's name when the resource omits `name` (the findResourceById rule)", () => {
    const idx = resolveFeatureResources([rf({ name: "Rage", resources: [{ id: "rage", max_formula: "2", reset: "long-rest" }] },
      { kind: "class", slug: "barbarian", level: 1 })]);
    expect(idx.get("rage")!.name).toBe("Rage");
  });
  it("a duplicate id keeps the FIRST declaration as owner", () => {
    const idx = resolveFeatureResources([
      rf({ id: "a", name: "Action Surge", resources: [{ id: "fighter:action-surge", name: "Action Surge", max_formula: "1", reset: "short-rest" }] },
         { kind: "class", slug: "fighter", level: 2 }),
      rf({ id: "b", name: "Action Surge (2)", resources: [{ id: "fighter:action-surge", name: "Action Surge", max_formula: "2", reset: "short-rest" }] },
         { kind: "class", slug: "fighter", level: 17 }),
    ]);
    expect((idx.get("fighter:action-surge")!.owner as { featureId: string }).featureId).toBe("a");
  });
  const kindFixture = () => {
    const wizardShape = { id: "wizard:arcane-recovery-slots", name: "Recover spell slots", amount: "ceil({class_level}/2)", reset: "long-rest", restores: "spell-slots" };
    const rageShape = { id: "r1", name: "short-rest", amount: 1, reset: "short-rest" };
    const tceShape = { id: "r2", name: "short-rest", amount: 1, reset: "short-rest", action: "bonus-action" };
    const customShape = { id: "r3", name: "custom", amount: 1, reset: "custom" };
    const idx = resolveFeatureResources([
      rf({ name: "Arcane Recovery", resources: [{ id: "w", name: "Arcane Recovery", max_formula: "1", reset: "long-rest", recovery: [wizardShape] }] }, { kind: "class", slug: "wizard", level: 1 }),
      rf({ name: "Rage", resources: [{ id: "b", name: "Rage", max_formula: "2", reset: "long-rest", recovery: [rageShape] }] }, { kind: "class", slug: "barbarian", level: 1 }),
      rf({ name: "Psionic Power", resources: [{ id: "p", name: "Psionic Energy Die", max_formula: "2 * prof", reset: "long-rest", recovery: [tceShape] }] }, { kind: "subclass", slug: "psi", level: 3 }),
      rf({ name: "Arcane Ward", resources: [{ id: "c", name: "Arcane Ward", max_formula: "1", reset: "long-rest", recovery: [customShape] }] }, { kind: "subclass", slug: "abj", level: 2 }),
    ]);
    return idx;
  };
  // ONE mutant per it() (invariant 4; Gate 2 confirmation r1 M-6): m18 and m18b each own the FIRST assertion of their own case.
  it("m18's RED: the default recovery KIND is uses (the Rage shape reads kind uses / flavour rest)", () => {
    expect(kindFixture().get("b")!.recovery![0]).toMatchObject({ kind: "uses", flavour: "rest" });
  });
  it("m18b's RED: kind FIRST, the Wizard shape is spell-slots / manual whatever its reset and action say", () => {
    expect(kindFixture().get("w")!.recovery![0]).toMatchObject({ kind: "spell-slots", flavour: "manual" });
  });
  it("FLAVOUR second: an action or a custom reset reads manual", () => {
    const idx = kindFixture();
    expect(idx.get("p")!.recovery![0]).toMatchObject({ kind: "uses", flavour: "manual" });
    expect(idx.get("c")!.recovery![0]).toMatchObject({ kind: "uses", flavour: "manual" });
  });
  it("reads resolved.features ONLY (state is never consulted)", () => {
    const resolved = { features: [rf({ name: "Rage", resources: [{ id: "rage", max_formula: "2", reset: "long-rest" }] }, { kind: "class", slug: "b", level: 1 })],
      pools: [], state: { feature_uses: { ghost: { used: 0, max: 1 } } } } as unknown as ResolvedCharacter;
    expect([...resolveResourceIndex(resolved).keys()]).toEqual(["rage"]);
  });
});

describe("poolSaveDC (R4-G4 §11.2)", () => {
  const derived = { proficiencyBonus: 3, mods: { str: 0, dex: 2, con: 1, int: 0, wis: 3, cha: 0 } } as unknown as DerivedStats;
  const pool = { id: "elemental-disciplines", label: "Elemental Disciplines", classIndex: 0 } as unknown as ResolvedPool;
  it("a Four Elements Monk (WIS 16, L6) reads 14; RED first: null today", () => {
    const resolved = { classes: [{ entity: { slug: "monk" }, level: 6, subclass: { slug: "four-elements", spellcasting: { ability: "wis" } } }] } as unknown as ResolvedCharacter;
    expect(poolSaveDC(resolved, derived, pool)).toBe(14);
  });
  it("a subclass with no `spellcasting.ability` → null (the `!ability` gate; no mutant names this case)", () => {
    const giant = { classes: [{ entity: { slug: "barbarian" }, level: 6, subclass: { slug: "giant" } }] } as unknown as ResolvedCharacter;
    expect(poolSaveDC(giant, derived, pool)).toBeNull();
  });
  it("a real caster subclass (caster_type set) reads null: the caster gate (§17 row 33, m33's RED, its only assertion)", () => {
    // split out (Gate 2 confirmation r3 I-1): the `giant` case is blind to the caster gate (stopped earlier by `!ability`),
    // so this fixture must own its it() for m33 to red at the FIRST assertion. Under m33 it reads 8 + 3 + mods.int(0) = 11.
    const caster = { classes: [{ entity: { slug: "fighter" }, level: 6, subclass: { slug: "ek", spellcasting: { ability: "int", caster_type: "third" } } }] } as unknown as ResolvedCharacter;
    expect(poolSaveDC(caster, derived, pool)).toBeNull();
  });
});

describe("resolveResourceIndex · pool picks' own uses (R4-G4 §12)", () => {
  const inv = (slug: string, uses: object | null) => ({ slug, entity: { slug, name: slug, uses } });
  const resolved = {
    totalLevel: 5, features: [],
    classes: [{ entity: { slug: "warlock" }, level: 5, subclass: null }],
    pools: [{ id: "invocations", label: "Eldritch Invocations", classIndex: 0, count: 2, anchorLevel: 1,
      selected: [inv("hb_misty-visions", { max: 1, recharge: "short-rest" }), inv("hb_prose", { max: "as described", recharge: "long-rest" })],
      grants: [inv("hb_granted", { max: "{cha_mod}", recharge: "long-rest" })], available: [] }],
  } as unknown as ResolvedCharacter;

  // The prose pick's `warnOnce` is this fixture's DESIGNED warning (asserted by count below), and BOTH
  // cases walk the same fixture, so the spy is installed for the whole block: an unswallowed warn would
  // print from a PASSING test, which the phase's pristine-output instrument counts as a defect.
  let warn: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    __resetWarnOnceForTests();
    warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => warn.mockRestore());

  it("RED FIRST: a numeric or parseable `uses.max` becomes an index entry owned by the pool, at the owning class's level", () => {
    const idx = resolveResourceIndex(resolved);
    expect(idx.get("hb_misty-visions")).toMatchObject({ id: "hb_misty-visions", name: "hb_misty-visions", reset: "short-rest", maxFormula: "1",
      owner: { kind: "pool", poolId: "invocations", poolLabel: "Eldritch Invocations", source: { kind: "class", slug: "warlock", level: 1 } } });
    expect(idx.get("hb_granted")!.maxFormula).toBe("{cha_mod}");
  });

  it("a prose `uses.max` is skipped with one warning", () => {
    // The warn count is asserted FIRST: it is the assertion the walk's `isValidMaxFormula` guard owns,
    // and `has("hb_prose")` is false both before the walk exists and after (adapted from the brief's
    // order so the discriminating expect leads).
    const idx = resolveResourceIndex(resolved);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(idx.has("hb_prose")).toBe(false);
  });
});
