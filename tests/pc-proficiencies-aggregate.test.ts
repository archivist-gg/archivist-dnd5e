import { describe, it, expect } from "vitest";
import { aggregateProficiencies } from "../src/pc/pc.proficiencies";
import type { ResolvedCharacter, ChoiceValue } from "../src/pc/pc.types";

// ─────────────────────────────────────────────────────────────────────────────
// R3-P2 D5: the DISPLAY path (`aggregateProficiencies`) must fold chosen picks
// AND surface unresolved select-proficiency choices as "choose N" placeholders,
// on top of the pre-existing fixed reads. Placeholders derive from the SAME
// select-proficiency choices `collectChosenProficiencies` walks (entity/trait/
// feature/background `choices[]`), NOT `language_proficiencies`.
// ─────────────────────────────────────────────────────────────────────────────

interface MakeOpts {
  raceLangFixed?: string[];
  bgLangChoice?: { id: string; count: number; from: string[] };
  bgToolChoice?: { id: string; count: number; from: string[] };
  originChoices?: Record<string, ChoiceValue>;
}

function makeResolved(opts: MakeOpts = {}): ResolvedCharacter {
  const bgChoices: unknown[] = [];
  if (opts.bgLangChoice) {
    bgChoices.push({
      kind: "select-proficiency", id: opts.bgLangChoice.id, count: opts.bgLangChoice.count,
      domain: "language", from: opts.bgLangChoice.from,
    });
  }
  if (opts.bgToolChoice) {
    bgChoices.push({
      kind: "select-proficiency", id: opts.bgToolChoice.id, count: opts.bgToolChoice.count,
      domain: "tool", from: opts.bgToolChoice.from,
    });
  }
  const background: unknown = bgChoices.length
    ? {
        slug: "test-bg", name: "Test Background", edition: "2024",
        tool_proficiencies: [], language_proficiencies: [],
        choices: bgChoices, feature: { name: "Feature", description: "desc" },
      }
    : null;
  const race: unknown = opts.raceLangFixed
    ? { slug: "test-race", name: "Test Race", languages: { fixed: opts.raceLangFixed }, choices: [], traits: [] }
    : null;
  return {
    definition: { origin_choices: opts.originChoices ?? {} },
    race, classes: [], background, feats: [], totalLevel: 1,
    features: [], spells: [], pools: [], weaponMasteries: [], state: {},
  } as unknown as ResolvedCharacter;
}

describe("aggregateProficiencies — chosen picks + choice placeholders (D5)", () => {
  it("surfaces a fixed race language and an unresolved count-2 language choice", () => {
    const agg = aggregateProficiencies(
      makeResolved({
        raceLangFixed: ["common"],
        bgLangChoice: { id: "langs", count: 2, from: ["elvish", "dwarvish", "giant"] },
      }),
    );
    expect(agg.languages).toContain("Common"); // fixed
    expect(agg.choices.languages).toContain("choose 2"); // unresolved choice
  });

  it("folds resolved picks into languages and clears the placeholder", () => {
    const agg = aggregateProficiencies(
      makeResolved({
        raceLangFixed: ["common"],
        bgLangChoice: { id: "langs", count: 2, from: ["elvish", "dwarvish", "giant"] },
        originChoices: { "background:langs": ["elvish", "dwarvish"] },
      }),
    );
    expect(agg.choices.languages).toEqual([]);
    expect(agg.languages).toContain("Common");
    expect(agg.languages).toContain("Elvish");
    expect(agg.languages).toContain("Dwarvish");
  });

  it("returns empty arrays for an empty tool bucket (panel renders None)", () => {
    const agg = aggregateProficiencies(makeResolved({ raceLangFixed: ["common"] }));
    expect(agg.tools).toEqual([]);
    expect(agg.choices.tools).toEqual([]);
  });

  it("emits 'choose N' with N = count - selected for a partial pick", () => {
    const agg = aggregateProficiencies(
      makeResolved({
        bgLangChoice: { id: "langs", count: 2, from: ["elvish", "dwarvish", "giant"] },
        originChoices: { "background:langs": ["elvish"] },
      }),
    );
    expect(agg.choices.languages).toContain("choose 1");
    expect(agg.languages).toContain("Elvish");
  });
});
