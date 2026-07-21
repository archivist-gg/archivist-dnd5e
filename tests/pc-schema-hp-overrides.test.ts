import { describe, it, expect } from "vitest";
import { characterSchema } from "../src/pc/pc.schema";

// Minimal valid character literal (mirrors tests/pc-schema.test.ts's minimalCharacter):
// name/edition/ability_method/abilities/state are the required fields; `class` defaults
// to [] but is included here for parity with a real character document.
const base = {
  name: "T", edition: "2024", ability_method: "manual",
  class: [{ name: "[[c]]", level: 1 }],
  abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
  state: { hp: { current: 1, max: 1, temp: 0 } },
};

describe("overrides.hp rolled/modifier schema", () => {
  it("accepts rolled and modifier and keeps them", () => {
    const r = characterSchema.safeParse({ ...base, overrides: { hp: { rolled: 62, modifier: -5 } } });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.overrides.hp).toEqual({ rolled: 62, modifier: -5 });
  });
  it("rejects non-int rolled and rolled < 1", () => {
    expect(characterSchema.safeParse({ ...base, overrides: { hp: { rolled: 6.5 } } }).success).toBe(false);
    expect(characterSchema.safeParse({ ...base, overrides: { hp: { rolled: 0 } } }).success).toBe(false);
  });
  it("accepts negative modifier, rejects non-int", () => {
    expect(characterSchema.safeParse({ ...base, overrides: { hp: { modifier: -12 } } }).success).toBe(true);
    expect(characterSchema.safeParse({ ...base, overrides: { hp: { modifier: 1.5 } } }).success).toBe(false);
  });
  it("still strips unknown keys (non-strict, delivered behavior)", () => {
    const r = characterSchema.safeParse({ ...base, overrides: { hp: { max: 10, bogus: 1 } } });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.overrides.hp).toEqual({ max: 10 });
  });
});
