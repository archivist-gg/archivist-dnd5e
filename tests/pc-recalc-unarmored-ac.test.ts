import { describe, it, expect } from "vitest";
import { recalc, unarmoredACBreakdown } from "../src/pc/pc.recalc";
import type { Character, ResolvedCharacter, ResolvedFeature } from "../src/pc/pc.types";
import type { Ability } from "@archivist-gg/dnd5e";
import type { FeatureEffect } from "@archivist-gg/dnd5e/types/feature-effect";
import { buildMockRegistry } from "./mock-entity-registry";
import { SHIELD } from "./equipment-fixtures";

/**
 * R4-G7 T6a · the unarmoured AC rows of the offline triage (spec §4's `ac` paragraph, the rule the oracle runs):
 * every `unarmored-ac` effect is a CANDIDATE, the plain 10 + DEX is ALWAYS a candidate, a shield counts on a
 * candidate only when that effect declares `allow_shield === true` (and always on the plain one), the HIGHEST
 * applicable total wins.
 *   E-1 the effect's `abilities` list is honoured (the DEX term only when the list names it);
 *   E-2 the best applicable formula wins, order-independently, with the `allow_shield === true` shield gate;
 *   E-5 the walk is gated by `foldsNow`, exactly as `computeFeatureEffects` gates its own.
 */

/** DEX +3, CON +2, WIS +2: the triage's measured witness mods. */
const MODS: Record<Ability, number> = { str: 0, dex: 3, con: 2, int: 0, wis: 2, cha: 0 };

const baseChar = (): Character => ({
  name: "T",
  edition: "2014",
  race: null,
  subrace: null,
  background: null,
  class: [{ name: "fighter", level: 1, subclass: null, choices: {} }],
  abilities: { str: 10, dex: 16, con: 14, int: 10, wis: 14, cha: 10 },
  ability_method: "manual",
  skills: { proficient: [], expertise: [] },
  spells: { known: [], overrides: [] },
  equipment: [],
  overrides: {},
  state: {
    hp: { current: 10, max: 10, temp: 0 },
    hit_dice: {},
    spell_slots: {},
    concentration: null,
    conditions: [],
    inspiration: 0,
    exhaustion: 0,
  },
}) as unknown as Character;

const mkResolved = (definition: Character, features: ResolvedFeature[] = []): ResolvedCharacter => ({
  definition,
  race: null,
  classes: [],
  background: null,
  feats: [],
  totalLevel: 1,
  features,
  spells: [],
  state: definition.state,
}) as unknown as ResolvedCharacter;

/** One feature carrying one `unarmored-ac` effect, sourced on the race (the arcane-archer witness's shape). */
const acFeature = (eff: FeatureEffect, name: string, extra: Record<string, unknown> = {}): ResolvedFeature => ({
  feature: { name, effects: [eff], ...extra } as never,
  source: { kind: "race", slug: "test-race" },
});

const registryWithShield = () =>
  buildMockRegistry([{ slug: "shield", entityType: "armor", name: "Shield", data: SHIELD as unknown as Record<string, unknown> }]);

describe("unarmoredACBreakdown · E-1: the effect's `abilities` list is the whole ability set", () => {
  it("an abilities list without `dex` adds no DEX term (the Circle of the Moon 2024 witness)", () => {
    const r = mkResolved(baseChar(), [acFeature({ kind: "unarmored-ac", abilities: ["wis"], base: 13 }, "Circle Forms")]);
    const { total, terms } = unarmoredACBreakdown(r, MODS, []);
    // 13 + WIS(+2) = 15, which beats the plain 10 + DEX(+3) = 13. The DEX modifier is NOT part of this formula.
    expect(total).toBe(15);
    expect(terms.some((t) => t.kind === "dex")).toBe(false);
  });

  it("CONTROL: an abilities list WITH `dex` is unchanged (the other 15 carriers of the measured 16)", () => {
    const r = mkResolved(baseChar(), [acFeature({ kind: "unarmored-ac", abilities: ["dex", "con"], base: 10 }, "Unarmored Defense")]);
    const { total, terms } = unarmoredACBreakdown(r, MODS, []);
    // 10 + DEX(+3) + CON(+2) = 15, the shipped answer, with the DEX term still in the breakdown.
    expect(total).toBe(15);
    expect(terms.some((t) => t.kind === "dex")).toBe(true);
    expect(terms.map((t) => t.kind)).toEqual(["unarmored", "dex", "ability"]);
  });
});

describe("unarmoredACBreakdown · E-2: the best applicable formula wins", () => {
  it("the arcane-archer witness: a shield beats an unarmored-ac effect that does not allow one", () => {
    const c = baseChar();
    c.equipment = [{ item: "[[shield]]", equipped: true }];
    // `Grit` = 11 + DEX with `allow_shield` ABSENT (hasOwnProperty false), a shield equipped, DEX +3.
    // Candidates: plain 10 + 3 + 2 (shield) = 15 · Grit 11 + 3 + 0 = 14. Best = 15, not 14 and not 16.
    const r = mkResolved(c, [acFeature({ kind: "unarmored-ac", abilities: ["dex"], base: 11 }, "Grit")]);
    expect(recalc(r, registryWithShield()).ac).toBe(15);
  });

  it("the higher formula wins regardless of feature order", () => {
    const hi = acFeature({ kind: "unarmored-ac", abilities: ["wis"], base: 13 }, "Circle Forms"); // 15
    const lo = acFeature({ kind: "unarmored-ac", abilities: ["dex"], base: 11 }, "Grit"); // 14
    expect(unarmoredACBreakdown(mkResolved(baseChar(), [lo, hi]), MODS, []).total).toBe(15);
    expect(unarmoredACBreakdown(mkResolved(baseChar(), [hi, lo]), MODS, []).total).toBe(15);
  });

  it("CONTROL: a candidate that declares `allow_shield: true` counts the shield", () => {
    const c = baseChar();
    c.equipment = [{ item: "[[shield]]", equipped: true }];
    const r = mkResolved(c, [acFeature({ kind: "unarmored-ac", abilities: ["dex", "con"], base: 10, allow_shield: true }, "Unarmored Defense")]);
    // 10 + DEX(+3) + CON(+2) + shield 2 = 17, above the plain 10 + 3 + 2 = 15.
    expect(recalc(r, registryWithShield()).ac).toBe(17);
  });
});

describe("unarmoredACBreakdown · E-5: the walk is gated by foldsNow", () => {
  it("an ACTIVATABLE unarmored-ac with an empty active-buff set does not fold", () => {
    const r = mkResolved(baseChar(), [
      acFeature({ kind: "unarmored-ac", abilities: ["wis"], base: 13 }, "Circle Forms", { id: "circle-forms", activatable: true }),
    ]);
    // The buff is off, so the formula is not in effect: the plain 10 + DEX(+3).
    expect(unarmoredACBreakdown(r, MODS, []).total).toBe(13);
  });

  it("CONTROL: the same effect folds while its id is in `active_buffs`", () => {
    const r = mkResolved(baseChar(), [
      acFeature({ kind: "unarmored-ac", abilities: ["wis"], base: 13 }, "Circle Forms", { id: "circle-forms", activatable: true }),
    ]);
    (r.state as unknown as { active_buffs: string[] }).active_buffs = ["circle-forms"];
    expect(unarmoredACBreakdown(r, MODS, []).total).toBe(15);
  });
});
