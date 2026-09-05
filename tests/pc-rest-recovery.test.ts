import { describe, it, expect } from "vitest";
import { computeRestPlan } from "../src/pc/pc.rest";
import type { Character, ResolvedCharacter, DerivedStats } from "../src/pc/pc.types";

// R4-G4 §7.2.2 · the rest-triggered PARTIAL recovery, asserted on the PLAN in the repo that owns
// `computeRestPlan`. The `res` / `setup` builders are the `pc-rest-either.test.ts` idiom restated
// with a `recovery` array on the resource (invariant 4: the plugin's `tests/pc-rest*.test.ts` are
// cross-repo consumers and carry no kill power for this file's mutants).

function res(id: string, name: string, reset: string, recovery: object[] = []) {
  return { feature: { name, resources: [{ id, name, max_formula: "3", reset, recovery }] }, source: { kind: "class", slug: "x", level: 1 } };
}
function setup(featureUses: Record<string, { used: number; max: number }>, features: object[]) {
  const character = { equipment: [], state: { hp: { current: 10, max: 10, temp: 0 }, hit_dice: {}, spell_slots: {}, concentration: null,
    conditions: [], exhaustion: 0, inspiration: 0, feature_uses: featureUses } } as unknown as Character;
  const resolved = { totalLevel: 5, features, pools: [] } as unknown as ResolvedCharacter;
  const derived = { hp: { max: 10 } } as unknown as DerivedStats;
  return { character, resolved, derived };
}
const cat = (plan: { categories: Array<{ id: string; restore?: unknown }> }, id: string) => plan.categories.find((c) => c.id === `feature:${id}`);

describe("computeRestPlan · the rest-triggered PARTIAL recovery (R4-G4 §7.2.2)", () => {
  it("RED FIRST: Rage (own long-rest; recovery short-rest 1) gets a partial category at a SHORT rest and the full one at a LONG rest", () => {
    const rage = res("b:rage", "Rage", "long-rest", [{ id: "r", name: "short-rest", amount: 1, reset: "short-rest" }]);
    const { character, resolved, derived } = setup({ "b:rage": { used: 2, max: 3 } }, [rage]);
    const short = computeRestPlan(character, resolved, derived, null, "short");
    expect(cat(short, "b:rage")).toMatchObject({ id: "feature:b:rage", label: "Rage", restore: 1, preview: "1 of 2 used restored" });
    const long = computeRestPlan(character, resolved, derived, null, "long");
    expect(cat(long, "b:rage")).toMatchObject({ id: "feature:b:rage", preview: "2/3 restored" });
    expect(cat(long, "b:rage")!.restore).toBeUndefined();
  });

  it("the double-list guard (Gate 0 I3): Channel Divinity 2014 (own short-rest; recovery long-rest all) lists ONCE at a long rest", () => {
    const cd = res("c:cd", "Channel Divinity", "short-rest", [{ id: "r", name: "long-rest", amount: "all", reset: "long-rest" }]);
    const { character, resolved, derived } = setup({ "c:cd": { used: 1, max: 1 } }, [cd]);
    const long = computeRestPlan(character, resolved, derived, null, "long");
    expect(long.categories.filter((c) => c.id === "feature:c:cd")).toHaveLength(1);
    expect(cat(long, "c:cd")!.restore).toBeUndefined();
  });

  it("kind-first (Gate 1 A B1): a spell-slots entry that FIRES at the rest under test still emits NO partial category; the own long-rest reset stays a full reset", () => {
    // Gate 2 confirmation r1 I-1 (measured over all 84 entry shapes): the find's `r.kind === "uses"` clause is DEFENCE IN
    // DEPTH. `resolveRecovery` makes kind spell-slots imply flavour manual, so `r.flavour === "rest"` already excludes every
    // slot entry and NO fixture can red the kind clause alone. It discriminates only under m18b (the Wizard entry then reads
    // flavour rest, and only the kind clause keeps the partial category out). This case pins the BEHAVIOUR (no partial
    // category for a firing spell-slots entry); §17 row 21's second clause is a named NON-mutant.
    const wiz = res("w:ar", "Arcane Recovery", "long-rest", [{ id: "r", name: "Recover spell slots", amount: 1, reset: "short-rest", restores: "spell-slots" }]);
    const { character, resolved, derived } = setup({ "w:ar": { used: 1, max: 1 } }, [wiz]);
    expect(cat(computeRestPlan(character, resolved, derived, null, "short"), "w:ar")).toBeUndefined();
    // the OWN long-rest reset lists it as a FULL reset (present, `restore` undefined): the spell-slots entry never
    // contributes a partial `restore`, and the plugin's slot picker is the only consumer of that entry (§7.3).
    const own = cat(computeRestPlan(character, resolved, derived, null, "long"), "w:ar");
    expect(own).toBeDefined();
    expect(own!.restore).toBeUndefined();
  });

  it("the shipped Wizard shape (entry reset long-rest, no action) is a CONTROL: no partial category at either rest, cut by the reset gates", () => {
    const wiz = res("w:ar", "Arcane Recovery", "long-rest", [{ id: "r", name: "Recover spell slots", amount: "ceil({class_level}/2)", reset: "long-rest", restores: "spell-slots" }]);
    const { character, resolved, derived } = setup({ "w:ar": { used: 1, max: 1 } }, [wiz]);
    expect(cat(computeRestPlan(character, resolved, derived, null, "short"), "w:ar")).toBeUndefined();
    expect(cat(computeRestPlan(character, resolved, derived, null, "long"), "w:ar")!.restore).toBeUndefined();
  });

  it("a manual-flavour entry (action present, or reset custom) never becomes a rest category", () => {
    const tce = res("p:die", "Psionic Energy Die", "long-rest", [{ id: "r", name: "short-rest", amount: 1, reset: "short-rest", action: "bonus-action" }]);
    const { character, resolved, derived } = setup({ "p:die": { used: 2, max: 4 } }, [tce]);
    expect(cat(computeRestPlan(character, resolved, derived, null, "short"), "p:die")).toBeUndefined();
  });
});
