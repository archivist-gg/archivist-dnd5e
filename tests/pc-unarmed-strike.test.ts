import { describe, it, expect } from "vitest";
import { recalc } from "../src/pc/pc.recalc";
import type { ResolvedCharacter, ResolvedFeature, CharacterState } from "../src/pc/pc.types";
import type { Ability } from "@archivist-gg/dnd5e";   // pc.types imports Ability and never re-exports it (TS2459)
import { buildEquipmentRegistry } from "./equipment-fixtures";
const registry = buildEquipmentRegistry();             // registers slug "shortsword" (weapon) among others
const last = <T>(xs: T[]): T => xs[xs.length - 1];     // no Array.prototype.at in the new dnd5e files
const abilitiesOf = (a: Partial<Record<Ability, number>>): Record<Ability, number> =>
  ({ str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10, ...a });
const freshState = (): CharacterState => ({
  hp: { current: 10, max: 10, temp: 0 }, hit_dice: {}, spell_slots: {}, concentration: null, conditions: [],
  exhaustion: 0, inspiration: 0, feature_uses: {}, active_buffs: [],
});
/** A registry-less, gearless ResolvedCharacter with every required key present and NO cast. */
const base = (a: Partial<Record<Ability, number>> = {}): ResolvedCharacter => {
  const state = freshState();
  return {
    definition: {
      name: "t", edition: "2024", race: null, subrace: null, background: null, ability_method: "manual",
      abilities: abilitiesOf(a), class: [], equipment: [], skills: { proficient: [], expertise: [] },
      spells: { known: [], overrides: [] }, overrides: {}, currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 }, state,
    },
    race: null, background: null, classes: [], feats: [], totalLevel: 1, features: [], spells: [], pools: [],
    resources: new Map(), weaponMasteries: [], state,
  };
};
/** `base()` plus one equipped shortsword in the mainhand (the `tests/equipment-fixtures.ts` registry slug). */
const withShortsword = (r: ResolvedCharacter): ResolvedCharacter => {
  r.definition.equipment.push({ item: "[[shortsword]]", equipped: true, slot: "mainhand" });
  return r;
};
const martialArts = (slug: string): ResolvedFeature =>
  ({ feature: { id: "martial-arts", name: "Martial Arts", description: "" }, source: { kind: "class", slug, level: 1 } });
/** A Monk-shaped class: a table with a `Martial Arts` column and a prose-only `martial-arts` feature. */
const monkResolved = (level: number, table: Record<number, { columns?: Record<string, string | number> }>, a: Partial<Record<Ability, number>>): ResolvedCharacter => {
  const r = base(a);
  r.classes = [{ entity: { slug: "test_class_monk", name: "Monk", table } as never, level, subclass: null, choices: {} }];
  r.totalLevel = level;
  r.features = [martialArts("test_class_monk")];
  return r;
};

describe("the Unarmed Strike row (R4-G6b §5)", () => {
  it("a gearless character has exactly one row, Unarmed Strike, STR + PB to hit, 1+STR bludgeoning, 5 ft", () => {
    const d = recalc(base({ str: 16, dex: 10 }));            // no registry
    expect(d.attacks.map((a) => a.name)).toEqual(["Unarmed Strike"]);
    const u = d.attacks[0];
    expect(u.unarmed).toBe(true);
    expect(u.id).toBe("unarmed-strike");
    expect(u.proficient).toBe(true);
    expect(u.toHit).toBe(3 + 2);
    expect(u.damageDice).toBe("1+3");
    expect(u.damageType).toBe("bludgeoning");
    expect(u.range).toBe("5 ft");
    // The sub-label is an ENGINE string like `Unarmed Strike`, `5 ft` and `bludgeoning`, so it ships in the
    // casing the sheet prints: the renderer humanizes a weapon token, never this one (R4-G6b live rider R-1).
    expect(u.subLabel).toBe("Unarmed");
    expect(u.slotKey).toBeUndefined();
    expect(u.breakdown.toHit.map((t) => t.source)).toEqual(["STR modifier", "Proficiency bonus"]);
    expect(u.breakdown.damage.map((t) => t.source)).toEqual(["Base damage", "STR modifier"]);
  });
  it("a +0 STR reads `1` and a -1 STR reads `1-1`", () => {
    expect(recalc(base({ str: 10 })).attacks[0].damageDice).toBe("1");
    expect(recalc(base({ str: 8 })).attacks[0].damageDice).toBe("1-1");
  });
  it("a sword plus unarmed: two rows, the unarmed LAST", () => {
    const d = recalc(withShortsword(base({ str: 12, dex: 14 })), registry);
    expect(d.attacks.map((a) => a.name)).toEqual(["Shortsword", "Unarmed Strike"]);
  });
  it("a Monk-shaped class reads the Martial Arts column at its class level and uses DEX", () => {
    const t2024 = { 1: { columns: { "Martial Arts": "1d6" } }, 5: { columns: { "Martial Arts": "1d8" } } };
    const l1 = last(recalc(monkResolved(1, t2024, { str: 10, dex: 16 })).attacks);
    expect(l1.damageDice).toBe("1d6+3");
    expect(l1.toHit).toBe(3 + 2);
    expect(l1.breakdown.toHit[0].source).toBe("DEX modifier");
    expect(last(recalc(monkResolved(5, t2024, { str: 10, dex: 16 })).attacks).damageDice).toBe("1d8+3");
    const t5e = { 1: { columns: { "Martial Arts": "1d4" } } };
    expect(last(recalc(monkResolved(1, t5e, { str: 10, dex: 16 })).attacks).damageDice).toBe("1d4+3");
  });
  it("STR wins when STR > DEX", () => {
    const t = { 1: { columns: { "Martial Arts": "1d6" } } };
    expect(last(recalc(monkResolved(1, t, { str: 16, dex: 10 })).attacks).breakdown.toHit[0].source).toBe("STR modifier");
  });
  it("DEX wins the tie (the finesse idiom)", () => {            // m2's kill row: its FIRST expect
    const t = { 1: { columns: { "Martial Arts": "1d6" } } };
    expect(last(recalc(monkResolved(1, t, { str: 14, dex: 14 })).attacks).breakdown.toHit[0].source).toBe("DEX modifier");
  });
  it("an authored unarmed-strike effect wins over the synthetic", () => {
    const t = { 1: { columns: { "Martial Arts": "1d6" } } };
    const authored = monkResolved(1, t, { str: 10, dex: 16 });
    authored.features[0].feature.effects = [{ kind: "unarmed-strike", dice: "1d10" }];
    expect(last(recalc(authored).attacks).damageDice).toBe("1d10");   // STR 10: the authored effect lists no ability, so the flat +0 is stripped
  });
  it("recalc's post-apply reaches the unarmed row: a damage-bonus rider", () => {
    const r = base({ str: 12 });
    r.features.push({ feature: { id: "rage", name: "Rage", description: "", effects: [{ kind: "damage-bonus", damage_type: "Fire", amount: "2", applies_to: "weapon" }] }, source: { kind: "class", slug: "x", level: 1 } });
    expect(last(recalc(r).attacks).damageRiders?.map((x) => x.amount)).toEqual(["2"]);
  });
  it("the Unarmored Defense name heuristic no longer pushes a sheet warning (R4-G6b §5.7)", () => {
    const r = base({ str: 10, dex: 14, wis: 14 });
    r.features.push({ feature: { id: "unarmored-defense", name: "Unarmored Defense", description: "" }, source: { kind: "class", slug: "srd-2024_class_monk", level: 1 } });
    const d = recalc(r);
    expect(d.warnings.some((w) => /Unarmored Defense detected/.test(w))).toBe(false);
    expect(d.ac).toBe(10 + 2 + 2);
  });
});

// R4-G7 §7.2 / §14.7 · CHARACTERISATION pins. `resolveUnarmedStrike` is UNCHANGED by G7: these five `it`s are
// green BY CONSTRUCTION and record what the shipped clauses do, so the G6b booking is discharged by evidence
// rather than by a change. Each names the clause it pins.
describe("characterisation: the shipped resolveUnarmedStrike clauses (R4-G7 §7.2, §14.7)", () => {
  const t = { 1: { columns: { "Martial Arts": "1d6" } } };

  it("characterisation: an authored arm's `condition` is never read (the qualifier is carried, never evaluated)", () => {
    const r = monkResolved(1, t, { str: 10, dex: 16 });
    r.features[0].feature.effects = [{ kind: "unarmed-strike", dice: "1d10", condition: "While raging" }];
    expect(last(recalc(r).attacks).damageDice).toBe("1d10");
  });

  it("characterisation: `foldsNow` is never consulted here, so an activatable feature contributes with its buff OFF", () => {
    const r = monkResolved(1, t, { str: 10, dex: 16 });
    r.features[0].feature.activatable = true;                       // and `state.active_buffs` is empty
    r.features[0].feature.effects = [{ kind: "unarmed-strike", dice: "1d10" }];
    expect(r.state.active_buffs).toEqual([]);
    expect(last(recalc(r).attacks).damageDice).toBe("1d10");
  });

  it("characterisation: an authored unarmed-strike WITHOUT `dice` suppresses the martial-arts synthetic", () => {
    const r = monkResolved(1, t, { str: 10, dex: 16 });
    r.features[0].feature.effects = [{ kind: "unarmed-strike", abilities: ["dex"] }];
    // The class table still carries `Martial Arts: 1d6`; the `if (authored.length || ...) continue` clause is
    // what keeps the row on the BASE die, with the authored ability set still applied.
    expect(last(recalc(r).attacks).damageDice).toBe("1+3");
    expect(last(recalc(r).attacks).breakdown.toHit[0].source).toBe("DEX modifier");
  });

  it("characterisation: two contributions keep the die with the higher average, either way round", () => {
    const higherAuthored = monkResolved(1, t, { str: 10, dex: 16 });
    higherAuthored.features.push({ feature: { id: "iron-fists", name: "Iron Fists", description: "", effects: [{ kind: "unarmed-strike", dice: "1d10" }] }, source: { kind: "class", slug: "test_class_monk", level: 1 } });
    expect(last(recalc(higherAuthored).attacks).damageDice).toBe("1d10+3");
    const higherColumn = monkResolved(1, t, { str: 10, dex: 16 });
    higherColumn.features.push({ feature: { id: "soft-fists", name: "Soft Fists", description: "", effects: [{ kind: "unarmed-strike", dice: "1d4" }] }, source: { kind: "class", slug: "test_class_monk", level: 1 } });
    expect(last(recalc(higherColumn).attacks).damageDice).toBe("1d6+3");
  });

  it("characterisation: a `{column}` die on a NON-CLASS source resolves to NOTHING (the base row; booked to G8)", () => {
    const r = base({ str: 16, dex: 10 });
    r.classes = [{ entity: { slug: "test_class_monk", name: "Monk", table: t } as never, level: 1, subclass: null, choices: {} }];
    r.totalLevel = 1;
    // `classOf` returns undefined for a race source, so `readDie` answers undefined and the row keeps its base
    // damage. G7 pins the behaviour; which class table a non-class `{column}` should read is the G8 booking.
    r.features = [{ feature: { id: "draconic-fists", name: "Draconic Fists", description: "", effects: [{ kind: "unarmed-strike", dice: { column: "Martial Arts" } }] }, source: { kind: "race", slug: "dragonborn" } }];
    expect(last(recalc(r).attacks).damageDice).toBe("1+3");
    expect(last(recalc(r).attacks).breakdown.toHit[0].source).toBe("STR modifier");
  });
});
