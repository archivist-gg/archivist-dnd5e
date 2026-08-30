import { describe, it, expect } from "vitest";
import { computeSpellLimits, type LimitClassInput, type SpellcastingProfile } from "../src/pc/pc.spellcasting";

const profile = (over: Partial<SpellcastingProfile> = {}): SpellcastingProfile =>
  ({ ability: "int", casterType: "full", preparation: "prepared", spellList: "wizard", table: {}, ...over });

const inp = (classSlug: string, level: number, p: SpellcastingProfile, abilityScore: number): LimitClassInput =>
  ({ classSlug, level, profile: p, abilityScore });

describe("computeSpellLimits", () => {
  it("prepared full caster without a table column: prepared = abilityMod + classLevel (fallback; Wizard 5, INT 16 → 3+5=8)", () => {
    const wiz = profile({ table: { 5: { columns: { "Cantrips Known": "4" } } } });
    const [lim] = computeSpellLimits([inp("wizard", 5, wiz, 16)]);
    expect(lim.kind).toBe("prepared");
    expect(lim.cantripsKnown).toBe(4);
    expect(lim.preparedOrKnown).toBe(8);
  });

  it("prepared half caster without a table column: Paladin 6, CHA 16 → 3 + floor(6/2) = 6 (fallback)", () => {
    const pal = profile({ ability: "cha", casterType: "half", preparation: "prepared", spellList: "paladin" });
    const [lim] = computeSpellLimits([inp("paladin", 6, pal, 16)]);
    expect(lim.preparedOrKnown).toBe(6);
  });

  it("known caster reads Spells Known column (Sorcerer 5 → 6)", () => {
    const sor = profile({ ability: "cha", casterType: "full", preparation: "known", spellList: "sorcerer", table: { 5: { columns: { "Cantrips Known": "5", "Spells Known": "6" } } } });
    const [lim] = computeSpellLimits([inp("sorcerer", 5, sor, 16)]);
    expect(lim.kind).toBe("known");
    expect(lim.cantripsKnown).toBe(5);
    expect(lim.preparedOrKnown).toBe(6);
  });

  it("prepared count floors at 1 (fallback path)", () => {
    const cle = profile({ ability: "wis", casterType: "full", preparation: "prepared", spellList: "cleric" });
    const [lim] = computeSpellLimits([inp("cleric", 1, cle, 8)]); // WIS 8 → mod -1; -1+1=0 → floor at 1
    expect(lim.preparedOrKnown).toBe(1);
  });

  it("empty input (non-casters filtered upstream) → []", () => {
    expect(computeSpellLimits([])).toEqual([]);
  });
});

describe("computeSpellLimits · table-first prepared counts (R4-G1a D6c, G12)", () => {
  const withCol = (col: string, level: number, n: number, over: Partial<SpellcastingProfile> = {}) =>
    profile({ ...over, table: { [level]: { columns: { [col]: n } } } });
  it("XPHB Paladin 1, Cha 16: the table says 2 (the formula would say 3)", () => {
    const p = withCol("Prepared Spells", 1, 2, { ability: "cha", casterType: "artificer", spellList: "paladin" });
    expect(computeSpellLimits([inp("paladin", 1, p, 16)])[0].preparedOrKnown).toBe(2);
  });
  it("EFA Artificer 5, Int 16: the table says 6 (the formula would say 5)", () => {
    const p = withCol("Prepared Spells", 5, 6, { casterType: "artificer", spellList: "artificer" });
    expect(computeSpellLimits([inp("artificer", 5, p, 16)])[0].preparedOrKnown).toBe(6);
  });
  it("TCE Artificer 5, Int 16, no column: Int mod + floor(5/2) = 5 (this case SURVIVES a formula-first mutant by arithmetic; the sha-moved assertion is the record)", () => {
    const p = profile({ casterType: "artificer", spellList: "artificer", table: { 5: { columns: { "Cantrips Known": 2 } } } });
    expect(computeSpellLimits([inp("artificer", 5, p, 16)])[0].preparedOrKnown).toBe(5);
  });
  it("SRD 2024 Cleric 5 / 17, Wis 16: the table says 9 / 19 (formula 8 / 20: both directions)", () => {
    expect(computeSpellLimits([inp("cleric", 5, withCol("Prepared Spells", 5, 9, { ability: "wis" }), 16)])[0].preparedOrKnown).toBe(9);
    expect(computeSpellLimits([inp("cleric", 17, withCol("Prepared Spells", 17, 19, { ability: "wis" }), 16)])[0].preparedOrKnown).toBe(19);
  });
  it("SRD 5e Paladin 5, Cha 16, no column: 3 + floor(5/2) = 5 (SURVIVES a formula-first mutant; recorded)", () => {
    const p = profile({ ability: "cha", casterType: "half", spellList: "paladin", table: {} });
    expect(computeSpellLimits([inp("paladin", 5, p, 16)])[0].preparedOrKnown).toBe(5);
  });
  it("reads the converter's second spelling, Spells Prepared (XPHB Eldritch Knight; Int 12, so the fallback would say 3 and cannot fake the 5)", () => {
    const p = withCol("Spells Prepared", 7, 5, { ability: "int", casterType: "third", spellList: null });
    expect(computeSpellLimits([inp("eldritch-knight", 7, p, 12)])[0].preparedOrKnown).toBe(5);
  });
  it("the known branch still reads Prepared Spells (XPHB Sorcerer / Warlock are known casters under that column)", () => {
    const p = profile({ ability: "cha", casterType: "full", preparation: "known", spellList: "sorcerer", table: { 5: { columns: { "Prepared Spells": 6 } } } });
    expect(computeSpellLimits([inp("sorcerer", 5, p, 16)])[0].preparedOrKnown).toBe(6);
  });
});
