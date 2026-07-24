import { describe, it, expect } from "vitest";
import { characterSchema } from "../src/pc/pc.schema";

const base = {
  name: "T", edition: "2024", ability_method: "manual",
  class: [{ name: "[[wizard]]", level: 1 }],
  abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
  state: { hp: { current: 1, max: 1, temp: 0 } },
};

describe("overrides.spellcasting_ability_by_class schema", () => {
  it("accepts a per-class ability map and keeps it", () => {
    const r = characterSchema.safeParse({ ...base, overrides: { spellcasting_ability_by_class: { wizard: "wis", cleric: "int" } } });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.overrides.spellcasting_ability_by_class).toEqual({ wizard: "wis", cleric: "int" });
  });
  it("rejects an invalid ability value", () => {
    expect(characterSchema.safeParse({ ...base, overrides: { spellcasting_ability_by_class: { wizard: "luck" } } }).success).toBe(false);
  });
  it("strips the retired numeric override overrides.spellcasting (clean cutover)", () => {
    const r = characterSchema.safeParse({ ...base, overrides: { spellcasting: { saveDC: 99, attackBonus: 9 } } });
    expect(r.success).toBe(true);
    if (r.success) expect((r.data.overrides as Record<string, unknown>).spellcasting).toBeUndefined();
  });
});
