import { describe, it, expect } from "vitest";
import { collectResolvedFeatures } from "../src/pc/pc.resolver"; // exported from ../src/pc/pc.resolver
import type { ResolvedClass } from "../src/pc/pc.types";

// Task 8: the class/subclass ASI-slot feature (Feature.id === "ability-score-improvement",
// a pure "increase an ability OR take a feat" slot with no playable surface) must be marked
// buildOnly so the plugin categorizer's existing rf.buildOnly skip hides it. Mirrors the §4
// feat buildOnly. DISPLAY-only: the feature stays in resolved.features; recalc reads the bump
// from the choice ledger, not this feature's (absent) effects.

// A pure ASI slot: id + name + non-empty SRD description + the asi-or-feat select-inline,
// but NO effects/resources/action/sub_features/attacks.
const ASI_SLOT = {
  id: "ability-score-improvement",
  name: "Ability Score Improvement",
  description:
    "When you reach 4th level, and again at 8th, you can increase one ability score of your choice by 2, or two by 1.",
  choices: [
    {
      kind: "select-inline",
      id: "asi-or-feat",
      options: [
        { value: "asi", label: "Ability Score Improvement" },
        { value: "feat", label: "Feat" },
      ],
    },
  ],
};

const NORMAL_FEATURE = {
  id: "extra-attack",
  name: "Extra Attack",
  description: "You can attack twice, instead of once, whenever you take the Attack action.",
};

// Defensive: same id but ALSO carries effects — a real playable surface, must NOT be hidden.
const ASI_WITH_EFFECTS = {
  id: "ability-score-improvement",
  name: "Ability Score Improvement (with effect)",
  effects: [{ kind: "initiative-bonus", value: 5 }],
};

// R4-G3b §3: the converter's 78 ASI slots carry the two `chosen` effects as a SECOND encoding of the slot; they are
// still pure slots and must be hidden. A fixed-list bump on an ASI-id feature is a REAL surface and must NOT be.
const ASI_SLOT_WITH_CHOSEN_EFFECTS = {
  id: "ability-score-improvement", name: "Ability Score Improvement",
  effects: [
    { subject: "self", kind: "ability-score-increase", abilities: "chosen", amount: 2, choose: 1, max: 20 },
    { subject: "self", kind: "ability-score-increase", abilities: "chosen", amount: 1, choose: 2, max: 20 },
  ],
};
const ASI_ID_WITH_FIXED_LIST = {
  id: "ability-score-improvement", name: "Ability Score Improvement (fixed bump)",
  effects: [{ subject: "self", kind: "ability-score-increase", abilities: ["str", "con"], amount: 4, choose: null, max: 24 }],
};
const find = (rows: ReturnType<typeof collectResolvedFeatures>, name: string) => rows.find((r) => r.feature.name === name)!;

function classFixture(
  features_by_level: Record<number, unknown[]>,
  subclass: unknown = null,
): ResolvedClass {
  return {
    entity: { slug: "fighter", name: "Fighter", features_by_level, resources: [] },
    level: 20,
    subclass,
    choices: {},
  } as unknown as ResolvedClass;
}

describe("class/subclass ASI-slot feature buildOnly (Task 8)", () => {
  it("marks the class ASI-slot feature buildOnly", () => {
    const rf = collectResolvedFeatures(null, [classFixture({ 4: [ASI_SLOT] })], null, []);
    const asi = rf.find(
      (r) => r.source.kind === "class" && r.feature.id === "ability-score-improvement",
    );
    expect(asi).toBeDefined();
    expect(asi!.buildOnly).toBe(true);
  });

  it("does NOT mark a normal class feature buildOnly", () => {
    const rf = collectResolvedFeatures(null, [classFixture({ 5: [NORMAL_FEATURE] })], null, []);
    const normal = rf.find((r) => r.source.kind === "class" && r.feature.id === "extra-attack");
    expect(normal).toBeDefined();
    expect(normal!.buildOnly).toBeFalsy();
  });

  it("does NOT mark an ASI-id feature that also carries effects (defensive)", () => {
    const rf = collectResolvedFeatures(null, [classFixture({ 4: [ASI_WITH_EFFECTS] })], null, []);
    const withEffects = rf.find(
      (r) => r.source.kind === "class" && r.feature.name === "Ability Score Improvement (with effect)",
    );
    expect(withEffects).toBeDefined();
    expect(withEffects!.buildOnly).toBeFalsy();
  });

  it("marks a subclass ASI-slot feature buildOnly", () => {
    const subclass = { slug: "champion", name: "Champion", features_by_level: { 3: [ASI_SLOT] }, resources: [] };
    const rf = collectResolvedFeatures(null, [classFixture({}, subclass)], null, []);
    const asi = rf.find(
      (r) => r.source.kind === "subclass" && r.feature.id === "ability-score-improvement",
    );
    expect(asi).toBeDefined();
    expect(asi!.buildOnly).toBe(true);
  });

  it("R4-G3b §3: an ASI slot whose only effects are the chosen-ASI encoding IS buildOnly", () => {
    const out = collectResolvedFeatures(null, [classFixture({ 4: [ASI_SLOT_WITH_CHOSEN_EFFECTS] })], null, []);
    expect(find(out, "Ability Score Improvement").buildOnly).toBe(true);        // RED FIRST on the current head
  });

  it("R4-G3b §3: an ASI-id feature carrying a FIXED-LIST bump is NOT buildOnly (the killing fixture for the `chosen` sub-test)", () => {
    const out = collectResolvedFeatures(null, [classFixture({ 20: [ASI_ID_WITH_FIXED_LIST] })], null, []);
    expect(find(out, "Ability Score Improvement (fixed bump)").buildOnly).toBeFalsy();
  });
});

describe("non-self effects keep a feature off buildOnly (R4-G1a D2)", () => {
  // The ADMIT ruling (spec D2): isAsiSlotFeature counts EFFECTS, not self effects. A feature whose only effect is
  // written on another creature still has a surface and still renders; only the fold readers (selfEffectsOf) drop
  // it. The discriminating mutant (t2f) makes the gate count only SELF effects and flips buildOnly to true; it is
  // written as an inline `subject` filter because pc.resolver.ts does not import pc.feature-effects, so a
  // selfEffectsOf call here would crash rather than fail.
  const ASI_WITH_NON_SELF_EFFECT = {
    id: "ability-score-improvement",
    name: "Ability Score Improvement",
    description: "(omitted)",
    effects: [{ kind: "resistance", damage_type: "Poison", subject: "target" }],
  };

  it("an ASI-id feature whose only effect is non-self is NOT buildOnly", () => {
    const rf = collectResolvedFeatures(null, [classFixture({ 4: [ASI_WITH_NON_SELF_EFFECT] })], null, []);
    const asi = rf.find(
      (r) => r.source.kind === "class" && r.feature.id === "ability-score-improvement",
    );
    expect(asi).toBeDefined();
    expect(asi!.buildOnly).toBeFalsy();
  });
});
