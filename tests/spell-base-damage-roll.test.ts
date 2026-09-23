import { describe, it, expect } from "vitest";
import { spellScales, spellEffectAtSlot, spellEffectPartsAtSlot, spellEffectAtCharacterLevel, upcastLevelsFor } from "../src/spell/spell.scaling";
import { parseSpell } from "@archivist-gg/dnd5e/spell/spell.parser";
import type { Spell } from "@archivist-gg/dnd5e/spell/spell.types";

/**
 * The spell's BASE roll (`damage_roll`): the roll at the spell's own level, or a cantrip's tier-1 roll. Open5e v2 and
 * 5etools both carry it; before this field it was dropped, so a base-level row printed only the damage-type word.
 * Shapes are the shipped SRD 2024 documents (Fireball 8d6 + slot_level_4..9, Fire Bolt 1d10 + player_level_5/11/17,
 * Cure Wounds 2d8 healing, Eldritch Blast 1d10 with beam-count tiers only).
 */
const fireball: Spell = {
  name: "Fireball", level: 3, damage_roll: "8d6", damage: { types: ["fire"] },
  at_higher_levels: ["The damage increases by 1d6 for each spell slot level above 3."],
  casting_options: [{ type: "slot_level_4", damage_roll: "9d6" }, { type: "slot_level_5", damage_roll: "10d6" }],
};
const cureWounds: Spell = {
  name: "Cure Wounds", level: 1, damage_roll: "2d8",
  casting_options: [{ type: "slot_level_2", damage_roll: "4d8" }],
};
const fingerOfDeath: Spell = { name: "Finger of Death", level: 7, damage_roll: "7d8 + 30", damage: { types: ["necrotic"] } };
const fireBolt: Spell = {
  name: "Fire Bolt", level: 0, damage_roll: "1d10",
  casting_options: [
    { type: "player_level_5", damage_roll: "2d10" },
    { type: "player_level_11", damage_roll: "3d10" },
    { type: "player_level_17", damage_roll: "4d10" },
  ],
};
const acidSplash5e: Spell = {
  name: "Acid Splash", level: 0, damage_roll: "1d6",
  casting_options: [
    { type: "player_level_2", damage_roll: "" }, { type: "player_level_4", damage_roll: "" },
    { type: "player_level_5", damage_roll: "2d6" },
  ],
};
const eldritchBlast: Spell = {
  name: "Eldritch Blast", level: 0, damage_roll: "1d10",
  casting_options: [{ type: "player_level_5", target_count: 2 }, { type: "player_level_17", target_count: 4 }],
};

describe("spellEffectPartsAtSlot · the base roll at the spell's own level", () => {
  it("a levelled spell cast at its own level returns the base roll as a damage_roll FIELD: Fireball at 3rd is 8d6", () => {
    expect(spellEffectPartsAtSlot(fireball, 3)).toEqual({ field: "damage_roll", value: "8d6" });
  });
  it("a healing base roll uses the same field (Cure Wounds at 1st is 2d8, like its 4d8 option)", () => {
    expect(spellEffectPartsAtSlot(cureWounds, 1)).toEqual({ field: "damage_roll", value: "2d8" });
    expect(spellEffectAtSlot(cureWounds, 2)).toBe("4d8");
  });
  it("an upcast slot still reads its option, never the base: Fireball at 4th is 9d6", () => {
    expect(spellEffectPartsAtSlot(fireball, 4)).toEqual({ field: "damage_roll", value: "9d6" });
  });
  it("a SCALING spell's missing option above base stays null (never the base roll, which would be wrong there)", () => {
    expect(spellEffectPartsAtSlot(fireball, 9)).toBeNull();
  });
  it("a NON-scaling spell deals its base roll at any slot it is cast with (a pact row above the spell's level)", () => {
    expect(spellEffectPartsAtSlot(fingerOfDeath, 7)).toEqual({ field: "damage_roll", value: "7d8 + 30" });
    expect(spellEffectPartsAtSlot(fingerOfDeath, 9)).toEqual({ field: "damage_roll", value: "7d8 + 30" });
  });
  it("never below the spell's own level, and never an empty roll", () => {
    expect(spellEffectPartsAtSlot(fingerOfDeath, 6)).toBeNull();
    expect(spellEffectPartsAtSlot({ name: "X", level: 2, damage_roll: "" }, 2)).toBeNull();
    expect(spellEffectPartsAtSlot({ name: "Shield", level: 1 }, 1)).toBeNull();
  });
});

describe("spellEffectAtCharacterLevel · the tier-1 roll", () => {
  it("below the first tier a cantrip reads its base roll: Fire Bolt at 4 is 1d10", () => {
    expect(spellEffectAtCharacterLevel(fireBolt, 4)).toBe("1d10");
    expect(spellEffectAtCharacterLevel(fireBolt, 1)).toBe("1d10");
  });
  it("a qualifying tier still wins: Fire Bolt at 5 is 2d10, at 20 is 4d10", () => {
    expect(spellEffectAtCharacterLevel(fireBolt, 5)).toBe("2d10");
    expect(spellEffectAtCharacterLevel(fireBolt, 20)).toBe("4d10");
  });
  it("EMPTY tiers do not shadow the base: SRD 5e Acid Splash at 4 is 1d6", () => {
    expect(spellEffectAtCharacterLevel(acidSplash5e, 4)).toBe("1d6");
  });
  it("a cantrip whose tiers carry no roll reads the base at every level (Eldritch Blast's per-beam 1d10)", () => {
    expect(spellEffectAtCharacterLevel(eldritchBlast, 20)).toBe("1d10");
  });
  it("still null for a levelled spell, a non-finite level, and an empty base roll", () => {
    expect(spellEffectAtCharacterLevel(fireball, 20)).toBeNull();
    expect(spellEffectAtCharacterLevel(fireBolt, Number.NaN)).toBeNull();
    expect(spellEffectAtCharacterLevel({ name: "Light", level: 0, damage_roll: "" }, 20)).toBeNull();
  });
});

describe("a base roll alone never makes a spell SCALE", () => {
  it("spellScales and upcastLevelsFor ignore damage_roll", () => {
    expect(spellScales(fingerOfDeath)).toBe(false);
    expect(upcastLevelsFor(fingerOfDeath, [7, 8, 9])).toEqual([]);
    expect(upcastLevelsFor(fireball, [3, 4, 5])).toEqual([4, 5]);
  });
});

describe("parseSpell · damage_roll", () => {
  it("admits and returns the top-level damage_roll (the KNOWN_KEYS gate and the strict schema both learn it)", () => {
    const r = parseSpell("name: Fireball\nlevel: 3\ndamage_roll: 8d6\ndamage:\n  types:\n    - fire\n");
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.damage_roll).toBe("8d6");
  });
  it("keeps an empty string as-is (a `!= null` guard, like the fourteen R4-G2 keys)", () => {
    const r = parseSpell("name: X\nlevel: 1\ndamage_roll: ''\n");
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.damage_roll).toBe("");
  });
  it("refuses a non-string damage_roll visibly", () => {
    expect(parseSpell("name: X\nlevel: 1\ndamage_roll: 8\n").success).toBe(false);
  });
});
