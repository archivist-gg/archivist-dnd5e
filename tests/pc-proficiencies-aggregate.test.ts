import { describe, it, expect } from "vitest";
import { aggregateProficiencies } from "../src/pc/pc.proficiencies";
import { humanizeProficiency, toProfSlug } from "../src/pc/pc.proficiency-normalize";
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
  /** Class `proficiencies.tools.fixed` · the 2014 prose grant path, read at
   *  pc.proficiencies.ts:60. */
  classToolsFixed?: string[];
  /** Background `tool_proficiencies: [{ kind: "fixed", items }]` · the 2024 slug
   *  grant path, read at pc.proficiencies.ts:69-70. */
  bgToolsFixed?: string[];
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
  const background: unknown = bgChoices.length || opts.bgToolsFixed
    ? {
        slug: "test-bg", name: "Test Background", edition: "2024",
        tool_proficiencies: opts.bgToolsFixed ? [{ kind: "fixed", items: opts.bgToolsFixed }] : [],
        language_proficiencies: [],
        choices: bgChoices, feature: { name: "Feature", description: "desc" },
      }
    : null;
  const race: unknown = opts.raceLangFixed
    ? { slug: "test-race", name: "Test Race", languages: { fixed: opts.raceLangFixed }, choices: [], traits: [] }
    : null;
  const classes: unknown[] = opts.classToolsFixed
    ? [{
        entity: {
          slug: "test-class", name: "Test Class",
          proficiencies: { tools: { fixed: opts.classToolsFixed } },
        },
        level: 1, subclass: null, choices: {},
      }]
    : [];
  return {
    definition: { origin_choices: opts.originChoices ?? {} },
    race, classes, background, feats: [], totalLevel: 1,
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

// ─────────────────────────────────────────────────────────────────────────────
// R4-P3a T2: the proficiency CANON. The 2014 bundle spells Rogue's tool grant
// with a curly apostrophe (`Thieves’ tools`, U+2019) and the 2024 bundle spells
// the Criminal background's with ASCII (`thieves'-tools`, U+0027). Both are real
// tracked values. Without a fold they title-case to two DIFFERENT strings and a
// single proficiency renders as two rows on the sheet.
// ─────────────────────────────────────────────────────────────────────────────

describe("aggregateProficiencies · apostrophe canon", () => {
  it("folds the 2014 curly-apostrophe class grant and the 2024 slug grant into ONE tools row", () => {
    const resolved = makeResolved({
      classToolsFixed: ["Thieves’ tools"],   // 2014 class prose, U+2019
      bgToolsFixed:    ["thieves'-tools"],   // 2024 background slug, U+0027
    });
    const agg = aggregateProficiencies(resolved);
    expect(agg.tools).toEqual(["Thieves' Tools"]);
    expect(agg.tools).toHaveLength(1);
  });

  it("exposes the two halves of the canon: an apostrophe-safe humanizer over a folding slugger", () => {
    expect(humanizeProficiency("smith's-tools")).toBe("Smith's Tools");
    expect(toProfSlug("Thieves’ tools")).toBe("thieves'-tools");
  });
});
