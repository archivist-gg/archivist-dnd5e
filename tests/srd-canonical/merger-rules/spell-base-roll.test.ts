import { describe, it, expect } from "vitest";
import { baseRollFromStructured } from "../../../tools/srd-canonical/merger-rules/spell-base-roll";
import { toSpellCanonical } from "../../../tools/srd-canonical/merger-rules/spell-merge";
import type { CanonicalEntry } from "../../../tools/srd-canonical/merger";

// Every structured literal below is the 5etools v2.28.0 record's own tag, copied from `data/spells/spells-{phb,xphb}.json`.
describe("baseRollFromStructured · the spell's base roll from the structured-rules record", () => {
  it("a cantrip reads its scalingLevelDice tier '1': Fire Bolt 1d10", () => {
    expect(baseRollFromStructured({ level: 0, scalingLevelDice: { label: "fire damage", scaling: { "1": "1d10", "5": "2d10" } },
      entries: ["{@damage 1d10} fire damage"] })).toBe("1d10");
  });
  it("two scalingLevelDice objects join like the converter's tiers: Toll the Dead 1d8 / 1d12", () => {
    expect(baseRollFromStructured({ level: 0, scalingLevelDice: [
      { label: "necrotic damage", scaling: { "1": "1d8", "5": "2d8" } },
      { label: "necrotic damage", scaling: { "1": "1d12", "5": "2d12" } }] })).toBe("1d8 / 1d12");
  });
  it("a tier-1 value with no dice ('0', Booming Blade's extra damage) is not a roll: falls through", () => {
    expect(baseRollFromStructured({ level: 0, scalingLevelDice: { label: "x", scaling: { "1": "0", "5": "1d8" } } })).toBeNull();
  });
  it("a levelled spell reads the BASE of its first scale tag: Fireball 8d6", () => {
    expect(baseRollFromStructured({ level: 3, entries: ["{@damage 8d6} fire damage"],
      entriesHigherLevel: [{ type: "entries", entries: ["{@scaledamage 8d6|3-9|1d6}"] }] })).toBe("8d6");
  });
  it("@scaledice counts too (healing): XPHB Cure Wounds 2d8", () => {
    expect(baseRollFromStructured({ level: 1, miscTags: ["HL"], entries: ["regains {@dice 2d8} plus"],
      entriesHigherLevel: [{ type: "entries", entries: ["{@scaledice 2d8|1-9|2d8}"] }] })).toBe("2d8");
  });
  it("the stale-base guard: XPHB Ice Storm's tag says 2d8 over a 1d10 increment, the entries' 2d10 is the base", () => {
    expect(baseRollFromStructured({ level: 4, entries: ["{@damage 2d10} Bludgeoning damage and {@damage 4d6} Cold damage"],
      entriesHigherLevel: [{ type: "entries", entries: ["{@scaledamage 2d8|4-9|1d10}"] }] })).toBe("2d10");
  });
  it("a flat scale base (XPHB Heal's 70) is not a roll, and nothing else carries one: null", () => {
    expect(baseRollFromStructured({ level: 6, entries: ["regains 70 Hit Points"],
      entriesHigherLevel: [{ type: "entries", entries: ["{@scaledice 70|6-9|10}"] }] })).toBeNull();
  });
  it("no scale tag: the first {@damage} tag, modifiers kept: Magic Missile 1d4 + 1, Finger of Death 7d8 + 30", () => {
    expect(baseRollFromStructured({ level: 1, entries: ["A dart deals {@damage 1d4 + 1} Force damage"] })).toBe("1d4 + 1");
    expect(baseRollFromStructured({ level: 7, entries: ["takes {@damage 7d8 + 30} Necrotic damage"] })).toBe("7d8 + 30");
  });
  it("a {@damage} tag that is not a dice expression is skipped for the next one", () => {
    expect(baseRollFromStructured({ level: 2, entries: ["{@damage your modifier} then {@damage 3d6}"] })).toBe("3d6");
  });
  it("null for no record and for a record with nothing", () => {
    expect(baseRollFromStructured(null)).toBeNull();
    expect(baseRollFromStructured({ level: 1, entries: ["You gain a shield."] })).toBeNull();
  });
});

function entry(base: Record<string, unknown>, structured: Record<string, unknown> | null): CanonicalEntry {
  return {
    slug: "srd-2024_spell_x", edition: "2024", kind: "spell",
    base: { key: "x", name: "X", level: 3, school: { key: "evocation" }, casting_time: "action", desc: "d", ...base },
    structured: structured as never, activation: null, overlay: null,
  };
}

describe("toSpellCanonical · damage_roll", () => {
  it("Open5e's roll stands alone when the structured record carries none (and the spell damages)", () => {
    expect(toSpellCanonical(entry({ damage_roll: "8d6", damage_types: ["fire"] }, { level: 3, entries: ["no tags"] })).damage_roll).toBe("8d6");
  });
  it("an EMPTY Open5e damage_roll (the 2014 Magic Missile shape) falls back to the structured record", () => {
    expect(toSpellCanonical(entry({ damage_roll: "" }, { level: 1, entries: ["{@damage 1d4 + 1}"] })).damage_roll).toBe("1d4 + 1");
  });
  it("neither source: the key is absent, never an empty string", () => {
    const out = toSpellCanonical(entry({ damage_roll: "" }, { level: 1, entries: ["no roll"] }));
    expect("damage_roll" in out).toBe(false);
  });
  it("the key sits right after `damage` in the emitted document", () => {
    const out = toSpellCanonical(entry({ damage_roll: "8d6", damage_types: ["fire"] }, null));
    const keys = Object.keys(out);
    expect(keys.indexOf("damage_roll")).toBe(keys.indexOf("damage") + 1);
  });
});

describe("baseRollFromStructured · damage or healing only", () => {
  it("a @scaledice hit-point POOL (2014 Sleep 5d8, no damage, no heal tag) is not a base roll", () => {
    expect(baseRollFromStructured({ level: 1, entries: ["Roll {@dice 5d8}"],
      entriesHigherLevel: [{ type: "entries", entries: ["{@scaledice 5d8|1-9|2d8}"] }] })).toBeNull();
  });
  it("a @scaledice on a damaging spell counts", () => {
    expect(baseRollFromStructured({ level: 2, damageInflict: ["fire"],
      entriesHigherLevel: [{ type: "entries", entries: ["{@scaledice 3d6|2-9|1d6}"] }] })).toBe("3d6");
  });
  it("a healing or temp-HP spell's first {@dice}: XPHB False Life 2d4 + 4 (THP), Regenerate 4d8 + 15 (HL)", () => {
    expect(baseRollFromStructured({ level: 1, miscTags: ["THP"], entries: ["gain {@dice 2d4 + 4} Temporary Hit Points"] })).toBe("2d4 + 4");
    expect(baseRollFromStructured({ level: 7, miscTags: ["HL"], entries: ["regains {@dice 4d8 + 15} Hit Points"] })).toBe("4d8 + 15");
  });
  it("a bonus die that is neither (Bless {@dice 1d4}, tagged SCT) is not a base roll", () => {
    expect(baseRollFromStructured({ level: 1, miscTags: ["SCT"], entries: ["roll {@dice 1d4}"] })).toBeNull();
  });
});

describe("toSpellCanonical · picking between Open5e and the structured record", () => {
  it("both carry the SAME roll: it is kept", () => {
    expect(toSpellCanonical(entry({ damage_roll: "8d6" }, { level: 3, entries: ["{@damage 8d6}"] })).damage_roll).toBe("8d6");
  });
  it("they differ, no scaled rolls: the structured roll wins (2024 Prismatic Spray 12d6 over the 1d8 ray die)", () => {
    expect(toSpellCanonical(entry({ damage_roll: "1d8" }, { level: 7, entries: ["roll {@dice 1d8}", "{@damage 12d6}"] })).damage_roll).toBe("12d6");
  });
  it("they differ and Open5e's scaled rolls sit on Open5e's die: Open5e wins, so base and upcast rows read as one run", () => {
    const out = toSpellCanonical(entry(
      { level: 5, damage_roll: "8d8", casting_options: [{ type: "slot_level_6", damage_roll: "9d8" }] },
      { level: 5, entriesHigherLevel: [{ type: "entries", entries: ["{@scaledamage 8d8;4d8|5-9|1d8}"] }] }));
    expect(out.damage_roll).toBe("8d8");
  });
  it("no structured roll: Open5e's is taken only for a DAMAGING spell (a renamed SRD spell, Acid Arrow)", () => {
    expect(toSpellCanonical(entry({ damage_roll: "4d4", damage_types: ["acid"] }, null)).damage_roll).toBe("4d4");
    expect("damage_roll" in toSpellCanonical(entry({ damage_roll: "1d4" }, { level: 1, miscTags: ["SCT"], entries: ["{@dice 1d4}"] }))).toBe(false);
  });
  it("a flat Open5e value (2014 Guardian of Faith '20') is never a roll", () => {
    expect("damage_roll" in toSpellCanonical(entry({ damage_roll: "20", damage_types: ["radiant"] }, null))).toBe(false);
  });
});
