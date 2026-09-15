import { describe, it, expect } from "vitest";
import { spellScales, spellEffectAtSlot, spellEffectPartsAtSlot, spellEffectAtCharacterLevel, upcastLevelsFor } from "../src/spell/spell.scaling";
import type { Spell } from "@archivist-gg/dnd5e/spell/spell.types";

const mm2024: Spell = {
  name: "Magic Missile", level: 1,
  at_higher_levels: ["+1 dart per slot above 1st"],
  casting_options: [
    { type: "slot_level_2", target_count: 4 },
    { type: "slot_level_3", target_count: 5 },
  ],
} as Spell;

const mm2014: Spell = {
  name: "Magic Missile", level: 1,
  at_higher_levels: ["+1 dart per slot above 1st"],
  casting_options: [
    { type: "slot_level_2", target_count: 2 }, // BAD 2014 encoding: count == slot level
    { type: "slot_level_3", target_count: 3 },
  ],
} as Spell;

const fireball: Spell = {
  name: "Fireball", level: 3,
  casting_options: [{ type: "slot_level_4", damage_roll: "9d6" }],
} as Spell;

const shield: Spell = { name: "Shield", level: 1 } as Spell;

describe("spellScales", () => {
  it("is true when casting_options or at_higher_levels exist, false otherwise", () => {
    expect(spellScales(mm2024)).toBe(true);
    expect(spellScales(fireball)).toBe(true);
    expect(spellScales(shield)).toBe(false);
  });
});

describe("spellEffectAtSlot", () => {
  it("returns the damage_roll for that slot level", () => {
    expect(spellEffectAtSlot(fireball, 4)).toBe("9d6");
  });
  it("returns a target_count label for trustworthy data (2024)", () => {
    expect(spellEffectAtSlot(mm2024, 2)).toBe("4 targets");
  });
  it("suppresses the known-bad 2014 target_count (count === slot level)", () => {
    expect(spellEffectAtSlot(mm2014, 2)).toBeNull();
    expect(spellEffectAtSlot(mm2014, 3)).toBeNull();
  });
  it("returns null when there is no option for that level", () => {
    expect(spellEffectAtSlot(fireball, 9)).toBeNull();
    expect(spellEffectAtSlot(shield, 2)).toBeNull();
  });
});

// R4-G7 T8 RIDER-16 (F-CHIP (a)): the scaled value keeps the FIELD it came from, so the sheet can decide where a
// value prints (a chip, the duration cell, a caption) from the field and never from a spell list. The shapes are the
// shipped documents': PHB 2014 Bestow Curse (`slot_level_4 duration: 10 minutes`, base `duration: 1 minute`) and PHB
// 2024 False Life (`slot_level_2 desc: You gain 2d4 + 9 temporary hit points.`).
const bestowCurse2014: Spell = {
  name: "Bestow Curse", level: 3, duration: "1 minute", concentration: true, damage: { types: ["necrotic"] },
  casting_options: [{ type: "slot_level_4", duration: "10 minutes" }, { type: "slot_level_5", duration: "8 hours" }],
} as Spell;
const falseLife2024: Spell = {
  name: "False Life", level: 1,
  casting_options: [{ type: "slot_level_2", desc: "You gain 2d4 + 9 temporary hit points." }],
} as Spell;
const rollAndDesc: Spell = {
  name: "Both", level: 1,
  casting_options: [{ type: "slot_level_2", damage_roll: "3d6", desc: "and a sentence" }],
} as Spell;

describe("spellEffectPartsAtSlot (R4-G7 T8 RIDER-16)", () => {
  it("a duration option returns the duration FIELD: Bestow Curse at 4th is { duration, 10 minutes }", () => {
    expect(spellEffectPartsAtSlot(bestowCurse2014, 4)).toEqual({ field: "duration", value: "10 minutes" });
  });
  it("a desc option returns the desc FIELD with the sentence verbatim: False Life at 2nd", () => {
    expect(spellEffectPartsAtSlot(falseLife2024, 2)).toEqual({ field: "desc", value: "You gain 2d4 + 9 temporary hit points." });
  });
  it("a target_count option returns the target_count FIELD, its value the printed count", () => {
    expect(spellEffectPartsAtSlot(mm2024, 2)).toEqual({ field: "target_count", value: "4 targets" });
  });
  it("a damage_roll option returns the damage_roll FIELD; a roll wins over a desc on the same option (the precedence is kept)", () => {
    expect(spellEffectPartsAtSlot(fireball, 4)).toEqual({ field: "damage_roll", value: "9d6" });
    expect(spellEffectPartsAtSlot(rollAndDesc, 2)).toEqual({ field: "damage_roll", value: "3d6" });
  });
  it("keeps every guard: the 2014 bad target_count encoding and an absent option are null", () => {
    expect(spellEffectPartsAtSlot(mm2014, 2)).toBeNull();
    expect(spellEffectPartsAtSlot(fireball, 9)).toBeNull();
    expect(spellEffectPartsAtSlot(shield, 2)).toBeNull();
  });
  it("spellEffectAtSlot stays the value-only wrapper", () => {
    expect(spellEffectAtSlot(bestowCurse2014, 5)).toBe("8 hours");
    expect(spellEffectAtSlot(falseLife2024, 2)).toBe("You gain 2d4 + 9 temporary hit points.");
  });
});

// R4-G7 T8 RIDER-15 (F-NODICE (a)): a cantrip's damage at the character's TOTAL level. The two document shapes
// are the shipped ones: PHB 2024 / SRD 2024 / the converter author `player_level_5`, `_11`, `_17` only; SRD 5e
// authors one option per level from 5 to 20 (and SRD 5e Acid Splash / Poison Spray open with `player_level_2..4`
// carrying an EMPTY `damage_roll`).
const fireBolt2024: Spell = {
  name: "Fire Bolt", level: 0,
  casting_options: [
    { type: "player_level_5", damage_roll: "2d10" },
    { type: "player_level_11", damage_roll: "3d10" },
    { type: "player_level_17", damage_roll: "4d10" },
  ],
} as Spell;
const perLevel = (from: number, to: number, roll: (n: number) => string) =>
  Array.from({ length: to - from + 1 }, (_, i) => ({ type: `player_level_${from + i}`, damage_roll: roll(from + i) }));
const fireBoltSrd5e: Spell = {
  name: "Fire Bolt", level: 0,
  casting_options: perLevel(5, 20, (n) => (n >= 17 ? "4d10" : n >= 11 ? "3d10" : "2d10")),
} as Spell;
const acidSplashSrd5e: Spell = {
  name: "Acid Splash", level: 0,
  casting_options: [...perLevel(2, 4, () => ""), ...perLevel(5, 20, (n) => (n >= 17 ? "4d6" : n >= 11 ? "3d6" : "2d6"))],
} as Spell;
const eldritchBlast2024: Spell = {
  name: "Eldritch Blast", level: 0,
  casting_options: [{ type: "player_level_5", target_count: 2 }, { type: "player_level_17", target_count: 4 }],
} as Spell;

describe("spellEffectAtCharacterLevel (R4-G7 T8 RIDER-15)", () => {
  it("takes the HIGHEST player_level_<N> at or below the level: a 2024 Fire Bolt at 20 is 4d10", () => {
    expect(spellEffectAtCharacterLevel(fireBolt2024, 20)).toBe("4d10");   // kills an exact-match port and a first-qualifying pick
  });
  it("never reads an option ABOVE the level: a 2024 Fire Bolt at 10 is 2d10", () => {
    expect(spellEffectAtCharacterLevel(fireBolt2024, 10)).toBe("2d10");   // kills a max that ignores the level gate
  });
  it("is null when no option qualifies: a 2024 Fire Bolt at 4 (the base 1d10 is not in the data)", () => {
    expect(spellEffectAtCharacterLevel(fireBolt2024, 4)).toBeNull();
  });
  it("reads the SRD 5e one-option-per-level shape: Fire Bolt at 6 is 2d10", () => {
    expect(spellEffectAtCharacterLevel(fireBoltSrd5e, 6)).toBe("2d10");
    expect(spellEffectAtCharacterLevel(fireBoltSrd5e, 12)).toBe("3d10");
  });
  it("an EMPTY damage_roll never qualifies: SRD 5e Acid Splash at 4 is null, never an empty string; at 5 it is 2d6", () => {
    expect(spellEffectAtCharacterLevel(acidSplashSrd5e, 4)).toBeNull();
    expect(spellEffectAtCharacterLevel(acidSplashSrd5e, 5)).toBe("2d6");
  });
  it("a player_level option without a damage_roll never qualifies (Eldritch Blast 2024's beams)", () => {
    expect(spellEffectAtCharacterLevel(eldritchBlast2024, 20)).toBeNull();
  });
  it("is null for a LEVELLED spell and for an absent level (a fixture-built derived omits totalLevel)", () => {
    expect(spellEffectAtCharacterLevel({ ...fireBolt2024, level: 1 } as Spell, 20)).toBeNull();
    expect(spellEffectAtCharacterLevel(fireBolt2024, undefined as unknown as number)).toBeNull();
    expect(spellEffectAtCharacterLevel({ name: "Light", level: 0 } as Spell, 20)).toBeNull();
  });
});

describe("upcastLevelsFor", () => {
  it("lists owned slot levels strictly above base only when the spell scales", () => {
    expect(upcastLevelsFor(mm2024, [1, 2, 3])).toEqual([2, 3]);
    expect(upcastLevelsFor(shield, [1, 2, 3])).toEqual([]); // non-scaling: no repeats
    expect(upcastLevelsFor(fireball, [3])).toEqual([]);     // no higher owned slot
  });
});
