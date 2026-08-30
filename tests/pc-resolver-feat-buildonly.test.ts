import { describe, it, expect } from "vitest";
import { collectResolvedFeatures } from "../src/pc/pc.resolver"; // already exported (pc.resolver.ts:346)
import type { FeatEntity } from "../src/feat/feat.types";

const feat = (o: Partial<FeatEntity>): FeatEntity => ({
  slug: "x", name: "X", edition: "2024", source: "t", category: "general",
  description: "", prerequisites: [], benefits: [], effects: [], grants_asi: null,
  repeatable: false, choices: [], ...o,
});

describe("feat buildOnly + benefits fold", () => {
  it("marks a full-ASI feat (ability-points points:2, nothing else) buildOnly", () => {
    const rf = collectResolvedFeatures(null, [], null, [feat({
      slug: "srd-2024_ability-score-improvement", name: "Ability Score Improvement",
      choices: [{ kind: "ability-points", id: "asi", points: 2, max_per: 2 }],
      benefits: ["Increase one ability score by 2…", "You can take this feat more than once."],
    })]).find(r => r.source.kind === "feat")!;
    expect(rf.buildOnly).toBe(true);
  });
  it("does NOT mark Grappler-like (points:1 + real benefits) buildOnly, and folds benefits into description", () => {
    const rf = collectResolvedFeatures(null, [], null, [feat({
      slug: "srd-2024_grappler", name: "Grappler",
      description: "You gain the following benefits.",
      choices: [{ kind: "ability-points", id: "asi", points: 1, max_per: 1, pool: ["str","dex"] }],
      benefits: ["Increase your Strength or Dexterity by 1…", "When you hit with an Unarmed Strike…"],
    })]).find(r => r.source.kind === "feat")!;
    expect(rf.buildOnly).toBeFalsy();
    expect(rf.feature.description).toContain("You gain the following benefits.");
    expect(rf.feature.description).toContain("When you hit with an Unarmed Strike…");
  });
  it("does NOT mark a fighting-style feat (benefits, no ability-points) buildOnly; benefits-only description", () => {
    const rf = collectResolvedFeatures(null, [], null, [feat({
      slug: "srd-2024_archery", name: "Archery", benefits: ["+2 bonus to ranged weapon attack rolls."],
    })]).find(r => r.source.kind === "feat")!;
    expect(rf.buildOnly).toBeFalsy();
    expect(rf.feature.description).toBe("+2 bonus to ranged weapon attack rolls.");
  });
  it("does NOT mark a half-feat (points:1 + effects) buildOnly", () => {
    const rf = collectResolvedFeatures(null, [], null, [feat({
      slug: "hf", choices: [{ kind: "ability-points", id: "asi", points: 1, max_per: 1 }],
      effects: [{ kind: "initiative-bonus", value: 5 }],
    })]).find(r => r.source.kind === "feat")!;
    expect(rf.buildOnly).toBeFalsy();
  });
});

describe("non-self effects keep a feature off buildOnly (R4-G1a D2)", () => {
  // The ADMIT ruling (spec D2): the feat gate counts EFFECTS, not self effects. A full-ASI feat that also carries
  // an effect written on another creature keeps its surface; only the fold readers (selfEffectsOf) drop the effect.
  // The discriminating mutant (t2g) makes the gate count only SELF effects and flips buildOnly to true; it is
  // written as an inline `subject` filter because pc.resolver.ts does not import pc.feature-effects, so a
  // selfEffectsOf call here would crash rather than fail.
  it("a full-ASI feat whose only effect is non-self is NOT buildOnly", () => {
    const rf = collectResolvedFeatures(null, [], null, [feat({
      slug: "srd-2024_ability-score-improvement", name: "Ability Score Improvement",
      choices: [{ kind: "ability-points", id: "asi", points: 2, max_per: 2 }],
      effects: [{ kind: "resistance", damage_type: "Poison", subject: "target" }],
    })]).find(r => r.source.kind === "feat")!;
    expect(rf.buildOnly).toBeFalsy();
  });
});
