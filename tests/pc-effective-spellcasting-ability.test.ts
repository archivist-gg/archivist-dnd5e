import { describe, it, expect } from "vitest";
import { effectiveSpellcastingAbility } from "../src/pc/pc.spellcasting";
import type { CharacterOverrides } from "../src/pc/pc.types";

describe("effectiveSpellcastingAbility", () => {
  it("returns the override when present", () => {
    const o = { spellcasting_ability_by_class: { bard: "wis" } } as CharacterOverrides;
    expect(effectiveSpellcastingAbility("bard", "cha", o)).toBe("wis");
  });
  it("falls back to the data ability when no override", () => {
    expect(effectiveSpellcastingAbility("bard", "cha", {} as CharacterOverrides)).toBe("cha");
  });
  it("falls back for a class not in the map", () => {
    const o = { spellcasting_ability_by_class: { cleric: "int" } } as CharacterOverrides;
    expect(effectiveSpellcastingAbility("bard", "cha", o)).toBe("cha");
  });
});
