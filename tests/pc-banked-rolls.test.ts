import { describe, it, expect } from "vitest";
import * as yaml from "js-yaml";
import { parsePC } from "../src/pc/pc.parser";
import { computeRestPlan } from "../src/pc/pc.rest";
import type { Character, ResolvedCharacter, DerivedStats } from "../src/pc/pc.types";

// R4-G5 G8 (research D §3.3, booked at G5-UR3): banked PREROLLED dice. Two hard edges live in
// this repo and are asserted here:
//   1. `characterStateSchema.feature_rolls` in pc.schema.ts. The state object is a plain
//      `z.object`, i.e. NON-strict, so an unmodelled key is STRIPPED SILENTLY: without that line
//      a saved bank is gone on the next load and nothing fails. No compile check reaches it
//      (`CharacterState.feature_rolls` in pc.types.ts is declared on the TYPE, and the parse
//      output is cast-free only because the schema agrees).
//   2. the two `feature_uses` loops in `computeRestPlan`, which fire on `fu.used > 0 OR rolls
//      banked` and suffix the preview with the cleared-roll count. The mid-day Portent shape has
//      NOTHING spent (used 0, both rolls still on the sheet) and MUST still be offered, because
//      the rolls are what the player loses at the rest.
// The apply side (deleting feature_rolls[key]) is the plugin's `applyRestResets`; this file owns
// the PLAN and the SCHEMA, the two halves dnd5e ships.

const PORTENT = "wizard-2024:foretelling-roll";

// ---------------------------------------------------------------- schema half

/** The `pc-schema.test.ts` fixture (the CONTENTS of a ```pc fence, required keys only) run through
 *  the REAL load path; `state` is merged over the one required hp block. */
function parseState(state: Record<string, unknown>) {
  return parsePC(yaml.dump({
    name: "Banked Rolls Fixture",
    edition: "2024",
    ability_method: "manual",
    abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    equipment: [],
    state: { hp: { current: 10, max: 10, temp: 0 }, ...state },
  }));
}

describe("characterSchema · state.feature_rolls survives the parse (R4-G5 G8)", () => {
  it("keeps the banked rolls keyed by the resource id (the non-strict object would STRIP them)", () => {
    const r = parseState({
      feature_uses: { [PORTENT]: { used: 1, max: 2 } },
      feature_rolls: { [PORTENT]: [7, 16] },
    });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.state.feature_rolls).toEqual({ [PORTENT]: [7, 16] });
  });

  it("defaults to {} when the document predates the key, so readers need no undefined guard", () => {
    const r = parseState({});
    expect(r.success).toBe(true);
    if (!r.success) return;
    // `CharacterState.feature_rolls` is NON-optional; the default is what makes that type honest
    // for every character saved before G8.
    expect(r.data.state.feature_rolls).toEqual({});
  });

  it("REJECTS a non-encodable value (0, fractional, |v| beyond 999); a NEGATIVE value is the SPENT encoding and must PARSE", () => {
    // Pinning the MEASURED behaviour: the record value carries no `.catch`, so a bad roll fails the
    // whole parse rather than being dropped silently. Loud is the right failure mode for a value the
    // player typed into the bank; the alternative (a stripped roll) desynchronises the bank from the
    // `feature_uses` count axis with no signal. SIGN IS STATE (the G8 shuffle fix): negative =
    // spent, so -16 is a legal banked roll while 0, 7.5 and -1000 are not.
    for (const bad of [[0], [7.5], [-1000], [1000]]) {
      const r = parseState({ feature_rolls: { [PORTENT]: bad } });
      expect(r.success, `rolls ${JSON.stringify(bad)} must not parse`).toBe(false);
    }
    expect(parseState({ feature_rolls: { [PORTENT]: [-16] } }).success).toBe(true);
  });
});

// ------------------------------------------------------------- rest-plan half

function res(id: string, name: string, reset: string) {
  return { feature: { name, resources: [{ id, name, max_formula: "2", reset, die: "d20" }] }, source: { kind: "class", slug: "x", level: 1 } };
}

function setup(
  featureUses: Record<string, { used: number; max: number }>,
  featureRolls: Record<string, number[]>,
  features: object[],
) {
  const character = {
    equipment: [],
    state: {
      hp: { current: 10, max: 10, temp: 0 }, hit_dice: {}, spell_slots: {},
      concentration: null, conditions: [], exhaustion: 0, inspiration: 0,
      feature_uses: featureUses, feature_rolls: featureRolls,
    },
  } as unknown as Character;
  const resolved = { totalLevel: 5, features, pools: [] } as unknown as ResolvedCharacter;
  const derived = { hp: { max: 10 } } as unknown as DerivedStats;
  return { character, resolved, derived };
}

const cat = (plan: { categories: Array<{ id: string; label: string; preview: string }> }, id: string) =>
  plan.categories.find((c) => c.id === `feature:${id}`);

describe("computeRestPlan · a long rest clears the bank with the uses (R4-G5 G8)", () => {
  it("Portent (long-rest, 1 of 2 spent, one roll left) lists the uses AND the cleared roll in ONE category", () => {
    const { character, resolved, derived } = setup(
      { [PORTENT]: { used: 1, max: 2 } }, { [PORTENT]: [-7, 16] }, [res(PORTENT, "Portent", "long-rest")],
    );
    const row = cat(computeRestPlan(character, resolved, derived, null, "long"), PORTENT);
    expect(row).toMatchObject({ id: `feature:${PORTENT}`, label: "Portent" });
    expect(row!.preview).toContain("1/2 restored");
    expect(row!.preview).toContain("1 roll cleared");
    // ONE category, so the sheet's single opt-out governs uses and rolls together (the booked rule).
    expect(row!.preview).toBe("1/2 restored · 1 roll cleared");
  });

  it("the MID-DAY shape (nothing spent, both rolls banked) STILL fires: the rolls are the loss", () => {
    const { character, resolved, derived } = setup(
      { [PORTENT]: { used: 0, max: 2 } }, { [PORTENT]: [7, 16] }, [res(PORTENT, "Portent", "long-rest")],
    );
    const row = cat(computeRestPlan(character, resolved, derived, null, "long"), PORTENT);
    expect(row).toBeDefined();
    expect(row!.preview).toBe("0/2 restored · 2 rolls cleared");
  });

  it("a spent resource with an EMPTY bank keeps the plain preview (the note is conditional)", () => {
    const { character, resolved, derived } = setup(
      { [PORTENT]: { used: 1, max: 2 } }, {}, [res(PORTENT, "Portent", "long-rest")],
    );
    expect(cat(computeRestPlan(character, resolved, derived, null, "long"), PORTENT)!.preview).toBe("1/2 restored");
  });

  it("an encounter-scoped reset (turn) is STILL cut, banked rolls or not: the reset gate runs after the widened guard", () => {
    const { character, resolved, derived } = setup(
      { "x:turn": { used: 0, max: 2 } }, { "x:turn": [9] }, [res("x:turn", "Flash", "turn")],
    );
    expect(cat(computeRestPlan(character, resolved, derived, null, "long"), "x:turn")).toBeUndefined();
    expect(cat(computeRestPlan(character, resolved, derived, null, "short"), "x:turn")).toBeUndefined();
  });
});

describe("computeRestPlan · the SHORT rest half (R4-G5 G8)", () => {
  it("a long-rest bank is NOT offered at a short rest (the rolls do not survive the reset vocabulary)", () => {
    const { character, resolved, derived } = setup(
      { [PORTENT]: { used: 1, max: 2 } }, { [PORTENT]: [16] }, [res(PORTENT, "Portent", "long-rest")],
    );
    expect(cat(computeRestPlan(character, resolved, derived, null, "short"), PORTENT)).toBeUndefined();
  });

  it("a SHORT-rest banked resource fires at a short rest with the same roll note", () => {
    const { character, resolved, derived } = setup(
      { "x:short": { used: 1, max: 1 } }, { "x:short": [-4, 11] }, [res("x:short", "Quick Bank", "short-rest")],
    );
    const row = cat(computeRestPlan(character, resolved, derived, null, "short"), "x:short");
    expect(row).toMatchObject({ id: "feature:x:short", label: "Quick Bank" });
    expect(row!.preview).toBe("1/1 restored · 1 roll cleared");
  });

  it("a SHORT-rest bank with nothing spent still fires at a short rest (mid-day, short-rest flavour)", () => {
    const { character, resolved, derived } = setup(
      { "x:short": { used: 0, max: 2 } }, { "x:short": [4, 11] }, [res("x:short", "Quick Bank", "short-rest")],
    );
    expect(cat(computeRestPlan(character, resolved, derived, null, "short"), "x:short")!.preview)
      .toBe("0/2 restored · 2 rolls cleared");
  });
});
