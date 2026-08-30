import { describe, it, expect } from "vitest";
import { resolveSpellcasting, computeSpellLimits } from "../src/pc/pc.spellcasting";
import type { ResolvedClass } from "../src/pc/pc.types";

// Minimal ResolvedClass builder; only the fields resolveSpellcasting reads matter.
const rc = (over: Record<string, unknown>): ResolvedClass =>
  ({ entity: null, subclass: null, level: 1, choices: {}, ...over } as unknown as ResolvedClass);

describe("resolveSpellcasting", () => {
  it("reads the class spellcasting block + class table (Wizard → INT/full/prepared)", () => {
    const p = resolveSpellcasting(rc({
      entity: { slug: "wizard", spellcasting: { caster_type: "full", ability: "int", preparation: "prepared", spell_list: "wizard" }, table: { 1: { columns: { "Cantrips Known": 3 } } } },
    }));
    expect(p).toEqual({ ability: "int", casterType: "full", preparation: "prepared", spellList: "wizard", table: { 1: { columns: { "Cantrips Known": 3 } } } });
  });

  it("returns null when neither class nor subclass grants casting", () => {
    expect(resolveSpellcasting(rc({ entity: { slug: "fighter", spellcasting: null, table: {} } }))).toBeNull();
    expect(resolveSpellcasting(rc({}))).toBeNull();
  });

  it("uses the subclass block + subclass table when the subclass grants casting (Architect of Ruin)", () => {
    const p = resolveSpellcasting(rc({
      entity: { slug: "reaver", spellcasting: null, table: {} },
      subclass: { slug: "architect-of-ruin", spellcasting: { caster_type: "third", ability: "cha", preparation: "known", spell_list: "architect-of-ruin" }, table: { 3: { columns: { "Spells Known": 3 } } } },
    }));
    expect(p?.casterType).toBe("third");
    expect(p?.ability).toBe("cha");
    expect(p?.spellList).toBe("architect-of-ruin");
    expect(p?.table).toEqual({ 3: { columns: { "Spells Known": 3 } } });
  });

  it("subclass casting overrides the class block when both exist", () => {
    const p = resolveSpellcasting(rc({
      entity: { slug: "wizard", spellcasting: { caster_type: "full", ability: "int", preparation: "prepared", spell_list: "wizard" }, table: { 1: { columns: {} } } },
      subclass: { slug: "x", spellcasting: { caster_type: "third", ability: "cha", preparation: "known", spell_list: "x" }, table: { 3: { columns: { "Spells Known": 2 } } } },
    }));
    expect(p?.casterType).toBe("third");
    expect(p?.spellList).toBe("x");
  });

  it("subclass grants casting but has no table → falls back to the class table", () => {
    const p = resolveSpellcasting(rc({
      entity: { slug: "reaver", spellcasting: null, table: { 3: { columns: { "Cantrips Known": 2 } } } },
      subclass: { slug: "architect-of-ruin", spellcasting: { caster_type: "third", ability: "cha", preparation: "known", spell_list: "aor" } },
    }));
    expect(p?.table).toEqual({ 3: { columns: { "Cantrips Known": 2 } } });
  });
});

describe("resolveSpellcasting · field by field with the subclass table authoritative (R4-G1a D7, G13)", () => {
  const cls = (spellcasting: unknown, table: unknown = {}) => ({ slug: "fighter", name: "Fighter", spellcasting, table, features_by_level: {} });
  const rc = (entity: unknown, level: number, subclass: unknown) => ({ entity, level, subclass, choices: {} }) as never;
  const ekTable = { 7: { columns: { "Cantrips Known": 2, "Spells Known": 5 } }, 20: { columns: { "Cantrips Known": 3, "Spells Known": 13 } } };
  const atXphbTable = { 7: { columns: { "Prepared Spells": 5 } }, 20: { columns: { "Prepared Spells": 13 } } };
  it("{ability} only, on a non-caster class → null (the accidental full-caster Spells tab and DC are gone)", () => {
    expect(resolveSpellcasting(rc(cls(null), 6, { spellcasting: { ability: "wis" }, table: undefined }))).toBeNull();
  });
  it("EK 5e {ability: int, caster_type: third} → third / known / spellList null, from the SUBCLASS table", () => {
    const p = resolveSpellcasting(rc(cls(null, { 7: { columns: { "Fighting Style": "x" } } }), 7, { spellcasting: { ability: "int", caster_type: "third" }, table: ekTable }));
    expect(p).toMatchObject({ ability: "int", casterType: "third", preparation: "known", spellList: null });
    expect(computeSpellLimits([{ classSlug: "fighter", level: 7, profile: p!, abilityScore: 16 }])[0]).toMatchObject({ preparedOrKnown: 5, cantripsKnown: 2 });
  });
  it("XPHB Arcane Trickster: the Prepared Spells column infers prepared; 7 → 5, 20 → 13", () => {
    const p = resolveSpellcasting(rc(cls(null), 7, { spellcasting: { ability: "int", caster_type: "third" }, table: atXphbTable }));
    expect(p!.preparation).toBe("prepared");
    expect(computeSpellLimits([{ classSlug: "rogue", level: 7, profile: p!, abilityScore: 16 }])[0].preparedOrKnown).toBe(5);
    expect(computeSpellLimits([{ classSlug: "rogue", level: 20, profile: p!, abilityScore: 16 }])[0].preparedOrKnown).toBe(13);
  });
  it("a full block is unchanged (class caster, no subclass block)", () => {
    const p = resolveSpellcasting(rc(cls({ caster_type: "full", ability: "wis", preparation: "prepared", spell_list: "cleric" }, { 1: { columns: { "Prepared Spells": 4 } } }), 1, null));
    expect(p).toEqual({ ability: "wis", casterType: "full", preparation: "prepared", spellList: "cleric", table: { 1: { columns: { "Prepared Spells": 4 } } } });
  });
});
// Type test (spec D7): the CLASS config stays fully required.
import type { SpellcastingConfig } from "../src/class/class.types";
type MustBeRequired<T> = Required<T> extends T ? (T extends Required<T> ? true : false) : false;
const _classSpellcastingRequired: MustBeRequired<SpellcastingConfig> = true;
void _classSpellcastingRequired;
