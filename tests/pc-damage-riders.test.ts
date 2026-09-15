import { describe, it, expect } from "vitest";
import { recalc } from "../src/pc/pc.recalc";
import { computeFeatureEffects } from "../src/pc/pc.feature-effects";
import { CHOSEN_DAMAGE_TYPE, CHOSEN_DAMAGE_TYPE_NOTE, isChosenDamageType } from "../src/dnd/math";
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
 *       damage type, except the schema sentinel `chosen` (R4-G7 T8 RIDER-13, the last describe below).
 *       Both live at the merge site in `pc.recalc.ts`, the one place that knows the weapon row's own type
 *       AND the character's proficiency bonus and ability modifiers.
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

// R4-G7 T8 RIDER-12 (F-RIDER (a)): a `damage-bonus` effect's `condition` is CARRIED on the rider, never dropped, so
// the sheet can tell "on every hit" from "only when ...". The inv-1 measure: 241 of the 343 feature riders that reach a
// weapon row carry a condition (a 5e Paladin read "+ 2d8 radiant + 1d8 radiant + 1d8 radiant" on every swing). The
// policy is by FIELD: any authored `condition` rides along, whatever its prose says (spec R4-G3a §3.1 reversed).
describe("damage riders · RIDER-12: a rider carries its effect's `condition`", () => {
  it("computeFeatureEffects keeps the condition on the rider it pushes", () => {
    const totals = computeFeatureEffects([{
      feature: { name: "Divine Smite", effects: [{ kind: "damage-bonus", amount: "2d8", damage_type: "radiant", applies_to: "weapon", condition: "for a 1st-level spell slot" }] } as never,
      source: { kind: "class", slug: "x", level: 2 },
    }]);
    expect(totals.damageBonuses[0].condition).toBe("for a 1st-level spell slot");
    expect(totals.damageBonuses[0]).toEqual({ amount: "2d8", damage_type: "radiant", source: "Divine Smite", condition: "for a 1st-level spell slot" });
  });

  it("through recalc, the rider on the weapon row AND on the Unarmed Strike row keeps its condition", () => {
    const { weapon, unarmed } = rows([{ kind: "damage-bonus", amount: "1d8", damage_type: "radiant", condition: "if the target is an undead or a fiend" }]);
    expect(weapon.damageRiders?.[0].condition).toBe("if the target is an undead or a fiend");
    expect(unarmed.damageRiders?.[0].condition).toBe("if the target is an undead or a fiend");
  });

  it("CONTROL: a rider with no condition carries no `condition` key at all", () => {
    const { weapon } = rows([{ kind: "damage-bonus", amount: "1d8", damage_type: "radiant" }]);
    expect(weapon.damageRiders).toEqual([{ amount: "1d8", damage_type: "radiant", source: "Effect Source" }]);
    expect("condition" in (weapon.damageRiders?.[0] ?? {})).toBe(false);
  });
});

// R4-G7 T8 RIDER-13 (F-RIDER (b)): the schema's own sentinel `chosen` ("player-selected damage type at action time",
// `feature-effect-schema.ts`) is NOT "this row's type". T6a's shape rule made every non-canonical type inherit the row's,
// so Nature Domain 5e's Divine Strike ("cold, fire, or lightning, your choice") printed `1d8 bludgeoning` (38 corpus
// riders). `chosen` now stays on the rider verbatim, never inherits, and the sheet prints it with no type and a caption
// whose words come from `CHOSEN_DAMAGE_TYPE_NOTE`. Every OTHER non-canonical spelling keeps inheriting (E-4 (b) above).
describe("damage riders · RIDER-13: the `chosen` sentinel never inherits the row's damage type", () => {
  const typesOf = (a: AttackRow): (string | undefined)[] => (a.damageRiders ?? []).map((r) => r.damage_type);

  it("a `chosen` rider keeps `chosen` on the Longsword row AND on the Unarmed Strike row", () => {
    const { weapon, unarmed } = rows([{ kind: "damage-bonus", amount: "1d8", damage_type: "chosen" }]);
    expect(typesOf(weapon)).toEqual(["chosen"]);
    expect(typesOf(unarmed)).toEqual(["chosen"]);
  });

  it("the sentinel is matched whatever its casing or surrounding space, and kept as authored", () => {
    const { weapon } = rows([{ kind: "damage-bonus", amount: "1d8", damage_type: " Chosen " }]);
    expect(typesOf(weapon)).toEqual([" Chosen "]);
    expect(isChosenDamageType(" Chosen ")).toBe(true);
  });

  it("CONTROL: the one exported constant pair is the sentinel and the caption words", () => {
    expect(CHOSEN_DAMAGE_TYPE).toBe("chosen");
    expect(CHOSEN_DAMAGE_TYPE_NOTE).toContain("your choice");
    expect(isChosenDamageType("weapon")).toBe(false);
    expect(isChosenDamageType(undefined)).toBe(false);
  });
});
