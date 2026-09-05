import { describe, it, expect } from "vitest";
import {
  evaluateMaxFormula, isValidMaxFormula, resolveMaxAt, resolveMaxCountAt, AT_WILL_MAX, type FormulaBindings,
} from "../src/dnd/resource-formula";

const B = (over: Partial<FormulaBindings> = {}): FormulaBindings => ({
  level: 5, class_level: 5, prof: 3,
  str_mod: 0, dex_mod: 0, con_mod: 0, int_mod: 0, wis_mod: 0, cha_mod: 0, columns: {}, ...over,
});

describe("max / min productions (R4-G4 §6.2.1)", () => {
  it("max(1, cha_mod) clamps a negative and a zero modifier to 1 and passes a positive one through", () => {
    expect(evaluateMaxFormula("max(1, cha_mod)", B({ cha_mod: -1 }))).toBe(1);
    expect(evaluateMaxFormula("max(1, cha_mod)", B({ cha_mod: 0 }))).toBe(1);
    expect(evaluateMaxFormula("max(1, cha_mod)", B({ cha_mod: 3 }))).toBe(3);
  });
  it("the braced spelling the overlays use parses identically", () => {
    expect(evaluateMaxFormula("max(1, {wis_mod})", B({ wis_mod: -2 }))).toBe(1);
  });
  it("min(prof, 3) and a nested max(1, floor(level/2))", () => {
    expect(evaluateMaxFormula("min(prof, 3)", B({ prof: 4 }))).toBe(3);
    expect(evaluateMaxFormula("max(1, floor(level/2))", B({ level: 1 }))).toBe(1);
    expect(evaluateMaxFormula("max(1, floor(level/2))", B({ level: 7 }))).toBe(3);
  });
  it("max / min need at least two arguments; ceil / floor exactly one", () => {
    expect(isValidMaxFormula("max(1)")).toBe(false);
    expect(isValidMaxFormula("ceil(1, 2)")).toBe(false);
    expect(isValidMaxFormula("max(1, 2, 3)")).toBe(true);
  });
  it("the old rejections still hold: a die string and a stray comma", () => {
    expect(isValidMaxFormula("1d6")).toBe(false);
    expect(isValidMaxFormula("1, 2")).toBe(false);
  });
});

describe("resolveMaxCountAt and the at-will sentinel (R4-G4 §6.2.2-§6.2.3)", () => {
  const bardicDie2024 = { max_formula: "{cha_mod}", scales_at: [
    { level: 5, max: "1d8" }, { level: 10, max: "1d10" }, { level: 15, max: "1d12" }, { level: 20, max: "1d12" },
  ] };
  it("skips die-string steps and returns the parsed base COUNT for the Bardic Die 2024 shape", () => {
    expect(resolveMaxCountAt(5, bardicDie2024, B({ cha_mod: 3 }))).toBe(3);
    // the control: the OLD reader returns the die string at the same level
    expect(resolveMaxAt(5, bardicDie2024)).toBe("1d8");
  });
  it("uses the highest PARSING step at or below the level (Rage 2/3/999)", () => {
    const rage = { max_formula: "2", scales_at: [{ level: 3, max: "3" }, { level: 20, max: "999" }] };
    expect(resolveMaxCountAt(3, rage, B())).toBe(3);
    expect(resolveMaxCountAt(20, rage, B())).toBe(AT_WILL_MAX);
  });
  it("breaks a duplicate-level tie the way resolveMaxAt does: the FIRST declaration wins", () => {
    const dup = { max_formula: "2", scales_at: [{ level: 3, max: "3" }, { level: 3, max: "7" }] };
    expect(resolveMaxCountAt(3, dup, B())).toBe(3);
    // the pinned twin: the count reader and the die-label reader must agree on the same input
    expect(resolveMaxAt(3, dup)).toBe("3");
  });
  it("returns null when the base does not parse either (Sneak Attack 1d6)", () => {
    expect(resolveMaxCountAt(5, { max_formula: "1d6" }, B())).toBeNull();
  });
  it("AT_WILL_MAX is the documented 999", () => {
    expect(AT_WILL_MAX).toBe(999);
  });
});
