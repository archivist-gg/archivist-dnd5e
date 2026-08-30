import { describe, it, expect } from "vitest";
import { deriveSpellSlots } from "../src/pc/pc.spellcasting";

describe("deriveSpellSlots — dedicated third caster (bug fix)", () => {
  it("single third-caster matches the Eldritch Knight/Arcane Trickster/Architect table", () => {
    expect(deriveSpellSlots([{ casterType: "third", level: 3 }]).standard).toEqual({ 1: 2 });
    expect(deriveSpellSlots([{ casterType: "third", level: 7 }]).standard).toEqual({ 1: 4, 2: 2 });
    expect(deriveSpellSlots([{ casterType: "third", level: 13 }]).standard).toEqual({ 1: 4, 2: 3, 3: 2 });
    expect(deriveSpellSlots([{ casterType: "third", level: 20 }]).standard).toEqual({ 1: 4, 2: 3, 3: 3, 4: 1 });
  });
  it("third caster below level 3 has no slots", () => {
    expect(deriveSpellSlots([{ casterType: "third", level: 2 }]).standard).toEqual({});
  });
});

describe("deriveSpellSlots — full / half / pact / multiclass", () => {
  it("single full caster uses its own table (Wizard 5 → 4/3/2)", () => {
    const r = deriveSpellSlots([{ casterType: "full", level: 5 }]);
    expect(r.standard).toEqual({ 1: 4, 2: 3, 3: 2 });
    expect(r.pact).toBeNull();
  });
  it("single half caster uses the half table (Paladin 5 → 4/2, NOT caster-level-2)", () => {
    expect(deriveSpellSlots([{ casterType: "half", level: 5 }]).standard).toEqual({ 1: 4, 2: 2 });
  });
  it("Paladin 1 has no slots", () => {
    expect(deriveSpellSlots([{ casterType: "half", level: 1 }]).standard).toEqual({});
  });
  it("multiclass combines: Cleric 3 / Wizard 2 → caster level 5 → 4/3/2", () => {
    expect(deriveSpellSlots([{ casterType: "full", level: 3 }, { casterType: "full", level: 2 }]).standard).toEqual({ 1: 4, 2: 3, 3: 2 });
  });
  it("multiclass half rounds down: Paladin 5 / Sorcerer 1 → CL floor(5/2)+1 = 3 → 4/2", () => {
    expect(deriveSpellSlots([{ casterType: "half", level: 5 }, { casterType: "full", level: 1 }]).standard).toEqual({ 1: 4, 2: 2 });
  });
  // Spec §4.1: two-or-more casters pool half levels BEFORE flooring —
  // CL = sum(full) + floor(sum(half)/2). Paladin 1 + Ranger 1 → floor(2/2) = CL 1.
  // (Per-class flooring, floor(1/2)+floor(1/2)=0, would be wrong — guard against it.)
  it("multiclass pools half levels before flooring: Paladin 1 / Ranger 1 → CL 1 → 2×1st", () => {
    expect(deriveSpellSlots([{ casterType: "half", level: 1 }, { casterType: "half", level: 1 }]).standard).toEqual({ 1: 2 });
  });
  it("multiclass pools half levels before flooring: Paladin 3 / Ranger 1 → CL floor(4/2)=2 → 3×1st", () => {
    expect(deriveSpellSlots([{ casterType: "half", level: 3 }, { casterType: "half", level: 1 }]).standard).toEqual({ 1: 3 });
  });
  // Third caster contributes floor(thirdLevels/3) ONLY when multiclassed with another caster.
  it("multiclass with third caster: Full 6 + Third 9 → CL 6 + floor(9/3)=3 → 9", () => {
    expect(deriveSpellSlots([{ casterType: "full", level: 6 }, { casterType: "third", level: 9 }]).standard).toEqual({ 1: 4, 2: 3, 3: 3, 4: 3, 5: 1 });
  });
  it("warlock pact is separate and does not combine: Warlock 3 / Sorcerer 2", () => {
    const r = deriveSpellSlots([{ casterType: "pact", level: 3 }, { casterType: "full", level: 2 }]);
    expect(r.standard).toEqual({ 1: 3 });
    expect(r.pact).toEqual({ level: 2, total: 2 });
  });
  it("single warlock has only pact magic", () => {
    const r = deriveSpellSlots([{ casterType: "pact", level: 5 }]);
    expect(r.standard).toEqual({});
    expect(r.pact).toEqual({ level: 3, total: 2 });
  });
  it("empty input (all non-casters filtered upstream) produces nothing", () => {
    expect(deriveSpellSlots([])).toEqual({ standard: {}, pact: null });
  });
});

describe("deriveSpellSlots · the artificer progression (R4-G1a D6, G10, G11)", () => {
  it("artificer 1 = {1:2}, 5 = {1:4,2:2}, 20 = the half row 20", () => {
    expect(deriveSpellSlots([{ casterType: "artificer", level: 1 }]).standard).toEqual({ 1: 2 });
    expect(deriveSpellSlots([{ casterType: "artificer", level: 5 }]).standard).toEqual({ 1: 4, 2: 2 });
    expect(deriveSpellSlots([{ casterType: "artificer", level: 20 }]).standard).toEqual({ 1: 4, 2: 3, 3: 3, 4: 3, 5: 2 });
  });
  it("literal rows for the four existing types are unchanged (the aliasing mutant is caught by half 1 = {})", () => {
    expect(deriveSpellSlots([{ casterType: "full", level: 1 }]).standard).toEqual({ 1: 2 });
    expect(deriveSpellSlots([{ casterType: "full", level: 5 }]).standard).toEqual({ 1: 4, 2: 3, 3: 2 });
    expect(deriveSpellSlots([{ casterType: "full", level: 20 }]).standard).toEqual({ 1: 4, 2: 3, 3: 3, 4: 3, 5: 3, 6: 2, 7: 2, 8: 1, 9: 1 });
    expect(deriveSpellSlots([{ casterType: "half", level: 1 }]).standard).toEqual({});
    expect(deriveSpellSlots([{ casterType: "half", level: 5 }]).standard).toEqual({ 1: 4, 2: 2 });
    expect(deriveSpellSlots([{ casterType: "half", level: 20 }]).standard).toEqual({ 1: 4, 2: 3, 3: 3, 4: 3, 5: 2 });
    expect(deriveSpellSlots([{ casterType: "third", level: 3 }]).standard).toEqual({ 1: 2 });
    expect(deriveSpellSlots([{ casterType: "third", level: 7 }]).standard).toEqual({ 1: 4, 2: 2 });
    expect(deriveSpellSlots([{ casterType: "third", level: 20 }]).standard).toEqual({ 1: 4, 2: 3, 3: 3, 4: 1 });
    expect(deriveSpellSlots([{ casterType: "pact", level: 1 }]).pact).toEqual({ level: 1, total: 1 });
    expect(deriveSpellSlots([{ casterType: "pact", level: 11 }]).pact).toEqual({ level: 5, total: 3 });
    expect(deriveSpellSlots([{ casterType: "pact", level: 20 }]).pact).toEqual({ level: 5, total: 4 });
  });
  it("multiclass: artificer levels contribute ceil(n/2): Artificer 3 + Wizard 1 = CL 3 = full row 3; XPHB Paladin 5 (artificer progression) + Wizard 1 = CL 4 = full row 4", () => {
    // Only ODD artificer levels separate ceil from floor (Gate 2 measured): 3 → {1:4,2:2} vs floor's {1:3}; 5 → {1:4,2:3} vs floor's {1:4,2:2}.
    expect(deriveSpellSlots([{ casterType: "artificer", level: 3 }, { casterType: "full", level: 1 }]).standard).toEqual({ 1: 4, 2: 2 });
    expect(deriveSpellSlots([{ casterType: "artificer", level: 5 }, { casterType: "full", level: 1 }]).standard).toEqual({ 1: 4, 2: 3 });
    // Artificer 4 + Wizard 1 is {1:4,2:2} under BOTH roundings: a characterisation, not a kill.
    expect(deriveSpellSlots([{ casterType: "artificer", level: 4 }, { casterType: "full", level: 1 }]).standard).toEqual({ 1: 4, 2: 2 });
  });
  it("Artificer 4 + Warlock 1 keeps the artificer table plus pact magic (characterisation: the pact divert)", () => {
    const r = deriveSpellSlots([{ casterType: "artificer", level: 4 }, { casterType: "pact", level: 1 }]);
    expect(r.standard).toEqual({ 1: 3 }); expect(r.pact).toEqual({ level: 1, total: 1 });
  });
});
