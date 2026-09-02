/**
 * R4-G3a §6.2.3 · `normalizeRollScope`: the deterministic prose → canonical-scope mapper.
 *
 * Every mapped example below is one the controller MEASURED over the six-root corpus
 * (`research/controller-scope-coverage-v2.txt`); the residual list is verbatim prose the grammar
 * deliberately cannot express, and each one must come back `undefined` so the RAW scope passes
 * through unchanged at the fold (§6.2.3's "no behaviour change for the residual"; §14 row 19).
 */
import { describe, it, expect } from "vitest";
import { normalizeRollScope } from "../src/pc/roll-scope";
describe("normalizeRollScope (R4-G3a §6.2.3)", () => {
  it.each([
    ["Wisdom, Charisma", "saving-throw", ["wis", "cha"]],
    ["Intelligence (Investigation) and Wisdom (Perception) checks", "ability-check", ["investigation", "perception"]],
    ["Investigation", "ability-check", ["investigation"]],
    ["Strength checks", "ability-check", ["str"]],
    ["all Charisma checks", "ability-check", ["cha"]],
    ["Dexterity (Stealth) checks", "ability-check", ["stealth"]],
    ["any Wisdom (Perception) or Intelligence (Investigation) check", "ability-check", ["perception", "investigation"]],
    ["stealth", "ability-check", ["stealth"]],
    ["wis", "saving-throw", ["wis"]],
    // The two branches no corpus fixture exercises, MEASURED before pinning: the slash list
    // (`/` is a split token beside comma / "and" / "or") and the empty string (the
    // `parts.length === 0` guard, which a whitespace-only scope also reaches).
    ["Strength/Dexterity", "saving-throw", ["str", "dex"]],
    ["", "saving-throw", undefined],
  ])("%s → %j", (raw, roll, want) => expect(normalizeRollScope(raw, roll as never)).toEqual(want));
  it.each(["Death Saving Throws", "Initiative rolls", "1d4", "saving throws against spells", "a failed saving throw"])(
    "residual %s → undefined (pass-through)", (raw) => expect(normalizeRollScope(raw, "saving-throw")).toBeUndefined());
  it("absent scope → undefined", () => expect(normalizeRollScope(undefined, "attack")).toBeUndefined());
  it("fan-out is bounded at 3", () =>
    expect(normalizeRollScope("Strength, Dexterity, Constitution, Wisdom", "saving-throw")).toBeUndefined());
});
