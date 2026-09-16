import { describe, it, expect } from "vitest";
import { computeRestPlan } from "../src/pc/pc.rest";
import type { Character, ResolvedCharacter, DerivedStats } from "../src/pc/pc.types";

/**
 * A TALLY — a `custom`-reset count with no ceiling (hero points, table currency
 * the DM hands out) — must survive every rest untouched.
 *
 * Nothing about the tally is special to the engine: it is an ordinary resource
 * whose `reset` is `custom` and whose max is the at-will sentinel. That is
 * exactly why this is worth pinning. What a rest gives back is decided by two
 * INLINE `!==` chains inside `computeRestPlan` — one per rest length, over the
 * `feature_uses` walk — and not by the `FIRES_AT` sets above them, which serve
 * only the partial-recovery walk. Both were mutated to admit `custom` and this
 * file reds on each; adding `custom` to `FIRES_AT` alone does NOT red it, which
 * is the measurement that says which code is load-bearing here. A member added
 * to either chain later would silently start wiping a count the table spent a
 * campaign accumulating, with every other rest test still green.
 *
 * The control below is the point of the file: an `either` resource in the SAME
 * plan proves the plan is live and really does offer things, so "the tally is
 * absent" cannot pass because nothing was offered at all.
 */

const AT_WILL_MAX = 999;

function feat(id: string, name: string, reset: string, max = "1") {
  return { feature: { name, resources: [{ id, name, max_formula: max, reset }] }, source: { kind: "class", slug: "x", level: 1 } };
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

/** A tally holding 7 points, beside a live `either` resource as the control. */
const withTally = () =>
  setup(
    { "hero-points": { used: 7, max: AT_WILL_MAX }, ctrl: { used: 1, max: 1 } },
    [feat("hero-points", "Hero Points", "custom", String(AT_WILL_MAX)), feat("ctrl", "Control", "either")],
  );

const idsOf = (plan: { categories: { id: string }[] }): string[] => plan.categories.map((c) => c.id);

describe("a `custom` tally is not a rest resource", () => {
  for (const type of ["short", "long"] as const) {
    it(`the ${type} rest plan does NOT offer it`, () => {
      const { character, resolved, derived } = withTally();
      const plan = computeRestPlan(character, resolved, derived, null, type);
      expect(idsOf(plan).some((id) => id.includes("hero-points")),
        `a ${type} rest must not restore a count no rest gives back`).toBe(false);
      // CONTROL: the plan is live — it offers the `either` resource sitting beside it.
      expect(idsOf(plan), "the control proves the plan is not simply empty").toContain("feature:ctrl");
    });
  }

  it("and nothing in the plan mentions the at-will sentinel as a number", () => {
    const { character, resolved, derived } = withTally();
    const plan = computeRestPlan(character, resolved, derived, null, "long");
    expect(JSON.stringify(plan)).not.toContain(String(AT_WILL_MAX));
  });
});
