import { describe, it, expect } from "vitest";
import { computeRestPlan } from "../src/pc/pc.rest";
import type { Character, ResolvedCharacter, DerivedStats } from "../src/pc/pc.types";

// R4-G3a §8.2: an `either` resource ("short OR long rest") must appear in BOTH
// rest plans. The two filters are what §8.1 measured as silently skipping it:
// the long-rest one is a NEGATED four-member allow-list, the short-rest one
// admits a single member, and neither is compile-checkable.
//
// The `feat` / `setup` builders are the plugin's `tests/pc-rest-resource-reset.test.ts`
// fixture idiom restated in dnd5e terms (that file drives the same engine through
// the plugin's `applyRestResets`; this one asserts the PLAN itself, in the repo
// that owns `computeRestPlan`).

function feat(id: string, name: string, reset: string) {
  return { feature: { name, resources: [{ id, name, max_formula: "1", reset }] }, source: { kind: "class", slug: "x", level: 1 } };
}

function setup(featureUses: Record<string, { used: number; max: number }>, features: object[]) {
  const character = {
    equipment: [],
    state: {
      hp: { current: 10, max: 10, temp: 0 }, hit_dice: {}, spell_slots: {},
      concentration: null, conditions: [], exhaustion: 0, inspiration: 0,
      feature_uses: featureUses,
    },
  } as unknown as Character;
  const resolved = { totalLevel: 5, features } as unknown as ResolvedCharacter;
  const derived = { hp: { max: 10 } } as unknown as DerivedStats;
  return { character, resolved, derived };
}

const EITHER_ROW = { id: "feature:g3:e", label: "E", preview: "1/1 restored" };

describe('computeRestPlan · reset "either" (R4-G3a §8.2)', () => {
  it("an either resource is offered by the LONG rest plan", () => {
    const { character, resolved, derived } = setup({ "g3:e": { used: 1, max: 1 } }, [feat("g3:e", "E", "either")]);
    const plan = computeRestPlan(character, resolved, derived, null, "long");
    expect(plan.categories).toContainEqual(EITHER_ROW);
  });

  it("an either resource is offered by the SHORT rest plan", () => {
    const { character, resolved, derived } = setup({ "g3:e": { used: 1, max: 1 } }, [feat("g3:e", "E", "either")]);
    const plan = computeRestPlan(character, resolved, derived, null, "short");
    expect(plan.categories).toContainEqual(EITHER_ROW);
  });

  it("a long-rest resource stays LONG-only (the widening admits nothing else)", () => {
    const uses = { "g3:l": { used: 1, max: 1 } };
    const features = [feat("g3:l", "L", "long-rest")];
    const long = computeRestPlan(...restArgs(setup(uses, features), "long"));
    expect(long.categories).toContainEqual({ id: "feature:g3:l", label: "L", preview: "1/1 restored" });
    const short = computeRestPlan(...restArgs(setup(uses, features), "short"));
    expect(short.categories.map((c) => c.id)).not.toContain("feature:g3:l");
  });

  it("a short-rest resource still resets on BOTH rests (regression)", () => {
    const uses = { "g3:s": { used: 1, max: 1 } };
    const features = [feat("g3:s", "S", "short-rest")];
    const row = { id: "feature:g3:s", label: "S", preview: "1/1 restored" };
    const long = computeRestPlan(...restArgs(setup(uses, features), "long"));
    expect(long.categories).toContainEqual(row);
    const short = computeRestPlan(...restArgs(setup(uses, features), "short"));
    expect(short.categories).toContainEqual(row);
  });
});

/** `setup(...)`'s three fixtures spread into `computeRestPlan`'s positional
 *  `(character, resolved, derived, registry, type)` signature. */
function restArgs(
  s: { character: Character; resolved: ResolvedCharacter; derived: DerivedStats },
  type: "short" | "long",
): [Character, ResolvedCharacter, DerivedStats, null, "short" | "long"] {
  return [s.character, s.resolved, s.derived, null, type];
}
