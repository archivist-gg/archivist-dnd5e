/**
 * R4-G3a §5.2 · the tag mechanism's DATA tables.
 *
 * These four tables are the single source of every tag TEXT the plugin's three chip surfaces
 * render (invariant 3: one data-shaped table per concern, never a vocabulary switch in a
 * component). `ROLL_MODE_TAG` / `ROLL_MODE_WORD` are `Record<RollModifierMode, string>` and
 * `ROLL_NOUN` is `Record<RollKind | "any", string>` (one member wider than the folded entry: the
 * fold fans `any` out, but the RAW effect a feature row captions still carries it), so a missing
 * key is a COMPILE error (§14 row 8i)
 * and a wrong VALUE is caught by the plugin's "RR" text assertion (§14 row 8ii). The whole-object
 * `toEqual` here is deliberate: it pins the key SET and every value, so widening `mode` without
 * extending the table cannot pass.
 */
import { describe, it, expect } from "vitest";
import { ROLL_MODE_TAG, ROLL_MODE_WORD, ROLL_NOUN, saveOutcomeTag, AUTO_FAIL_TAG } from "../src/pc/roll-tag-labels";
describe("roll tag labels (R4-G3a §5.2)", () => {
  it("mode tags", () => expect(ROLL_MODE_TAG).toEqual({ advantage: "ADV", disadvantage: "DIS", reroll: "RR", "add-d4": "+D4" }));
  it("mode words + roll nouns", () => {
    expect(ROLL_MODE_WORD).toEqual({ advantage: "advantage", disadvantage: "disadvantage", reroll: "a reroll", "add-d4": "+1d4" });
    expect(ROLL_NOUN).toEqual({ "ability-check": "ability checks", "saving-throw": "saving throws", attack: "attack rolls", any: "rolls" });
  });
  it("outcome tags over the 3×3", () => {
    expect(saveOutcomeTag("none", "half")).toBe("0/½");
    expect(saveOutcomeTag("full", "none")).toBe("1/0");
    for (const s of ["none", "half", "full"] as const) for (const f of ["none", "half", "full"] as const)
      expect(saveOutcomeTag(s, f)).toMatch(/^[0½1]\/[0½1]$/);
    expect(AUTO_FAIL_TAG).toBe("AUTO-FAIL");
  });
});
