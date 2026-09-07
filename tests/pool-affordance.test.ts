import { describe, it, expect } from "vitest";
import {
  RENDERING_HINT_AFFORDANCE, AFFORDANCE_CAPTIONS, deriveEntryAffordance, formatAffordanceCaption,
} from "../src/pc/pool-layout";
import {
  FEAT_PROGRESSION_CATEGORY, FEATURE_TYPE_FOR_CATEGORY, featProgressionCategory,
} from "../src/feat/feat.category-codes";
import { COUNT_COLUMNS, countColumnsFor } from "../src/pc/pc.table-column";
import type { ResolvedPoolEntry } from "../src/pc/pc.types";

/** An optional-feature entity carrying only the field these functions read. The `as never` cast is this repo's
 *  fixture idiom: `OptionalFeatureEntity` has a dozen members none of them touch. */
const withHint = (rendering_hint: string): ResolvedPoolEntry["entity"] =>
  ({ slug: "commanders-strike", name: "Commander's Strike", rendering_hint } as never);

describe("deriveEntryAffordance · the ONE hint to affordance table (R4-G5 §4.2.1)", () => {
  it("a granted-die-to-ally entity derives the granted-die affordance", () => {
    expect(deriveEntryAffordance(withHint("granted-die-to-ally"))).toBe("granted-die");   // §13 row 12
    expect(RENDERING_HINT_AFFORDANCE["granted-die-to-ally"]).toBe("granted-die");
  });
  it("a prototype-chain key derives NOTHING, and neither do the unmapped or absent hints", () => {
    expect(deriveEntryAffordance(withHint("constructor"))).toBeUndefined();               // §13 row 13, FIRST
    expect(deriveEntryAffordance(withHint("toString"))).toBeUndefined();
    expect(deriveEntryAffordance(withHint("hasOwnProperty"))).toBeUndefined();
    expect(deriveEntryAffordance(withHint("stance"))).toBeUndefined();
    expect(deriveEntryAffordance(withHint(""))).toBeUndefined();
    expect(deriveEntryAffordance({ slug: "x", name: "X" } as never)).toBeUndefined();
  });
});

describe("formatAffordanceCaption · the sentence lives in DATA (R4-G5 §4.2.1)", () => {
  it("fills {amount} and {die} from the values the caller already resolved", () => {
    expect(formatAffordanceCaption("granted-die", { amount: 1, die: "d8" })).toBe("1 d8 to an ally");
    expect(formatAffordanceCaption("granted-die", { amount: 2, die: "1d10" })).toBe("2 1d10 to an ally");
  });
  it("the template, not the rendered string, is what the table holds", () => {
    expect(AFFORDANCE_CAPTIONS["granted-die"]).toBe("{amount} {die} to an ally");
  });
});

/** CONTROLS, NOT §13 rows: the kill power over these two tables is T2's (rows 9 / 10 through
 *  `tests/feat-progression.test.ts`, rows 26 / 27 / 28 through `tests/pc-decision-engine.test.ts`). They are
 *  asserted here so T1 never commits unexercised data. */
describe("the class-side feat_progression and count tables (R4-G5 §3.2.5, §6.2)", () => {
  it("the two shipped ARRAY shapes reduce to ONE category, first-mapped-wins", () => {
    expect(featProgressionCategory(["FS", "FS:P"])).toBe("fighting-style");   // Paladin 2024
    expect(featProgressionCategory(["FS", "FS:R"])).toBe("fighting-style");   // Ranger 2024
    expect(featProgressionCategory(["FS"])).toBe("fighting-style");           // Fighter 2024, Champion 2024
    expect(featProgressionCategory(["EB"])).toBe("epic-boon");                // the 13 Epic Boon carriers
    expect(featProgressionCategory(["O"])).toBe("origin");
  });
  it("an all-unmapped row, a prototype-chain code, an empty array and undefined all reduce to undefined", () => {
    expect(featProgressionCategory(["D", "DG"])).toBeUndefined();
    expect(featProgressionCategory(["constructor"])).toBeUndefined();
    expect(featProgressionCategory([])).toBeUndefined();
    expect(featProgressionCategory(undefined)).toBeUndefined();
  });
  it("the ONE category to feature_type pairing, and the code table's exact key-set", () => {
    expect(FEATURE_TYPE_FOR_CATEGORY["fighting-style"]).toBe("fighting_style");
    expect(FEATURE_TYPE_FOR_CATEGORY["epic-boon"]).toBeUndefined();
    expect(Object.keys(FEAT_PROGRESSION_CATEGORY).sort()).toEqual(["EB", "FS", "FS:P", "FS:R", "G", "O"]);
  });
  it("countColumnsFor answers only its OWN key", () => {
    expect(countColumnsFor("weapon-mastery")).toEqual(["Weapon Mastery"]);
    expect(countColumnsFor("constructor")).toBeUndefined();
    expect(countColumnsFor("fighting-style")).toBeUndefined();
    expect(Object.keys(COUNT_COLUMNS)).toEqual(["weapon-mastery"]);
  });
});
