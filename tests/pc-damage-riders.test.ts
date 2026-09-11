import { describe, it, expect } from "vitest";
import { recalc } from "../src/pc/pc.recalc";
import type { AttackRow, Character, ResolvedCharacter, ResolvedClass, ResolvedFeature } from "../src/pc/pc.types";
import type { FeatureEffect } from "@archivist-gg/dnd5e/types/feature-effect";
import { buildMockRegistry } from "./mock-entity-registry";
import { LONGSWORD } from "./equipment-fixtures";

/**
 * R4-G7 T6a · the damage-rider rows of the offline triage.
 *   E-3 is a CHARACTERISATION pin (spec §14.7), not a change: the schema's `applies_to` vocabulary is
 *       `weapon | spell | all`, an absent value means `weapon`, and an Unarmed Strike IS a melee weapon
 *       attack, so a weapon rider reaching it is RAW-correct. The 94 shipped cells are the 2014
 *       `agonizing-blast` DATA omission (§9 / D-6), not an engine defect. Mutant m21 lets `spell` through
 *       the filter and the first pin below goes RED.
 *   E-4 (a) a rider `amount` carrying a `{token}` resolves against the character before it is printed;
 *       (b) a rider `damage_type` outside the canonical `DAMAGE_TYPES` set INHERITS the weapon row's own
 *       damage type. Both live at the merge site in `pc.recalc.ts`, the one place that knows the weapon
 *       row's own type AND the character's proficiency bonus and ability modifiers.
 */

function mkClass(slug: string, die: string, level: number): ResolvedClass {
  return {
    entity: {
      slug, name: slug, edition: "2014", hit_die: die,
      primary_abilities: ["str"], saving_throws: [], features_by_level: {},
    } as never,
    level,
    subclass: null,
    choices: {},
  };
}

const baseChar = (): Character => ({
  name: "T",
  edition: "2014",
  race: null,
  subrace: null,
  background: null,
  class: [{ name: "fighter", level: 5, subclass: null, choices: {} }],
  abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
  ability_method: "manual",
  skills: { proficient: [], expertise: [] },
  spells: { known: [], overrides: [] },
  equipment: [{ item: "[[longsword]]", equipped: true }],
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

/** A fighter 5 (PB 3, total level 5) with a slashing Longsword equipped and ONE feature carrying `effects`. */
function withEffects(effects: FeatureEffect[]): ResolvedCharacter {
  const definition = baseChar();
  const feature: ResolvedFeature = {
    feature: { name: "Effect Source", effects } as never,
    source: { kind: "class", slug: "fighter", level: 1 },
  };
  return {
    definition,
    race: null,
    classes: [mkClass("fighter", "d10", 5)],
    background: null,
    feats: [],
    totalLevel: 5,
    features: [feature],
    spells: [],
    state: definition.state,
  } as unknown as ResolvedCharacter;
}

const registry = () => buildMockRegistry([{ slug: "longsword", entityType: "weapon", name: "Longsword", data: LONGSWORD as unknown as Record<string, unknown> }]);

const rows = (effects: FeatureEffect[]): { weapon: AttackRow; unarmed: AttackRow } => {
  const attacks = recalc(withEffects(effects), registry()).attacks;
  const unarmed = attacks.find((a) => (a as unknown as { unarmed?: boolean }).unarmed === true)!;
  const weapon = attacks.find((a) => a.name === "Longsword")!;
  return { weapon, unarmed };
};

const amounts = (a: AttackRow): string[] => (a.damageRiders ?? []).map((r) => r.amount);

describe("damage riders · E-3 CHARACTERISATION (the shipped `applies_to` rule, pinned, not changed)", () => {
  it("CHARACTERISATION: a rider with `applies_to: \"spell\"` reaches NO attack row", () => {
    const { weapon, unarmed } = rows([{ kind: "damage-bonus", applies_to: "spell", amount: "1d6", damage_type: "force" }]);
    expect(weapon.damageRiders).toBeUndefined();
    expect(unarmed.damageRiders).toBeUndefined();
  });

  it("CHARACTERISATION: a rider with NO `applies_to` reaches the weapon rows AND the Unarmed Strike row", () => {
    const { weapon, unarmed } = rows([{ kind: "damage-bonus", amount: "1d6", damage_type: "force" }]);
    expect(amounts(weapon)).toEqual(["1d6"]);
    expect(amounts(unarmed)).toEqual(["1d6"]);
  });

  it("CHARACTERISATION: a rider with `applies_to: \"all\"` reaches both rows", () => {
    const { weapon, unarmed } = rows([{ kind: "damage-bonus", applies_to: "all", amount: "1d6", damage_type: "force" }]);
    expect(amounts(weapon)).toEqual(["1d6"]);
    expect(amounts(unarmed)).toEqual(["1d6"]);
  });
});

describe("damage riders · E-4 (a): a `{token}` amount resolves before it is printed", () => {
  it("`{prof_bonus}` resolves to the character's proficiency bonus", () => {
    const { weapon, unarmed } = rows([{ kind: "damage-bonus", amount: "{prof_bonus}", damage_type: "radiant" }]);
    expect(amounts(weapon)).toEqual(["3"]); // fighter 5 → PB 3
    expect(amounts(unarmed)).toEqual(["3"]);
  });

  it("`{level}` resolves to the character's total level", () => {
    const { weapon } = rows([{ kind: "damage-bonus", amount: "{level}", damage_type: "necrotic" }]);
    expect(amounts(weapon)).toEqual(["5"]);
  });

  it("a prose amount is left alone (the plugin renders it as the row caption, never in the dice text)", () => {
    const { weapon } = rows([{ kind: "damage-bonus", amount: "your Wisdom modifier", damage_type: "necrotic" }]);
    expect(amounts(weapon)).toEqual(["your Wisdom modifier"]);
  });
});

describe("damage riders · E-4 (b): a non-canonical damage type inherits the weapon row's own", () => {
  const typesOf = (a: AttackRow): (string | undefined)[] => (a.damageRiders ?? []).map((r) => r.damage_type);

  it("`weapon` inherits the row's type (slashing on a Longsword, bludgeoning on the Unarmed Strike)", () => {
    const { weapon, unarmed } = rows([{ kind: "damage-bonus", amount: "1d6", damage_type: "weapon" }]);
    expect(typesOf(weapon)).toEqual(["slashing"]);
    expect(typesOf(unarmed)).toEqual(["bludgeoning"]);
  });

  it("a prose sentinel inherits the row's type as well", () => {
    const { weapon } = rows([{ kind: "damage-bonus", amount: "1d6", damage_type: "same as the weapon's type" }]);
    expect(typesOf(weapon)).toEqual(["slashing"]);
  });

  it("CONTROL: a canonical type is kept verbatim, in its authored casing", () => {
    const { weapon } = rows([{ kind: "damage-bonus", amount: "1d6", damage_type: "Fire" }]);
    expect(typesOf(weapon)).toEqual(["Fire"]);
  });

  it("CONTROL: an ABSENT damage type stays absent (it inherits nothing)", () => {
    const { weapon } = rows([{ kind: "damage-bonus", amount: "1d6" } as FeatureEffect]);
    expect(typesOf(weapon)).toEqual([undefined]);
    expect(weapon.damageRiders).toEqual([{ amount: "1d6", source: "Effect Source" }]);
  });
});
