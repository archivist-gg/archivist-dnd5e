import { describe, it, expect } from "vitest";
import { PCResolver } from "../src/pc/pc.resolver";
import { recalc } from "../src/pc/pc.recalc";
import { buildMockRegistry } from "./mock-entity-registry";
import type { Character, AttackRow } from "../src/pc/pc.types";

// Task 3: surface AttackRow.mastery behind a mastered + proficient gate.
//
// Drives the FULL resolve → recalc → attacks[0] pipeline (Task-2 helper
// pattern) with FULL `srd-2024_*` weapon slugs carrying a real `mastery` array.
// NOT `equipment-fixtures.ts` GREATSWORD (bare `greatsword`, edition 2014, no
// mastery). Fighter (2024) authors a `weapon-mastery` choose-3; the character
// picks the weapon's base slug when `mastered`, and the class grants martial
// weapon proficiency (dropped for the `proficient: false` variant).

const GREATSWORD_WEAPON = {
  slug: "srd-2024_greatsword",
  entityType: "weapon" as const,
  name: "Greatsword",
  data: {
    slug: "srd-2024_greatsword", name: "Greatsword", edition: "2024",
    category: "martial-melee",
    damage: { dice: "2d6", type: "slashing" },
    properties: ["heavy", "two_handed"],
    mastery: ["graze"],
  },
};

const BATTLEAXE_WEAPON = {
  slug: "srd-2024_battleaxe",
  entityType: "weapon" as const,
  name: "Battleaxe",
  data: {
    slug: "srd-2024_battleaxe", name: "Battleaxe", edition: "2024",
    category: "martial-melee",
    damage: { dice: "1d8", type: "slashing", versatile_dice: "1d10" },
    properties: ["versatile"],
    mastery: ["topple"],
  },
};

// Fixture descriptors: what to equip, which base slug to pick for mastery, and
// the registry entities that back them (base weapon + optional magic item).
const GREATSWORD_2024 = {
  equipItem: "[[srd-2024_greatsword]]",
  masteryPick: "srd-2024_greatsword",
  attuned: false,
  entities: [GREATSWORD_WEAPON],
};

// +1 Battleaxe (mastery topple): a magic ItemEntity over the base battleaxe.
const BATTLEAXE_2024_PLUS1 = {
  equipItem: "[[srd-2024_plus-one-battleaxe]]",
  masteryPick: "srd-2024_battleaxe",
  attuned: false,
  entities: [
    BATTLEAXE_WEAPON,
    {
      slug: "srd-2024_plus-one-battleaxe",
      entityType: "item" as const,
      name: "+1 Battleaxe",
      data: {
        slug: "srd-2024_plus-one-battleaxe", name: "+1 Battleaxe",
        type: "weapon", rarity: "uncommon",
        base_item: "[[srd-2024_battleaxe]]",
        bonuses: { weapon_attack: 1, weapon_damage: 1 },
        attunement: false,
      },
    },
  ],
};

// Greatsword of Wounding: base_item resolves to the base greatsword (mastery graze).
const GREATSWORD_OF_WOUNDING = {
  equipItem: "[[srd-2024_greatsword-of-wounding]]",
  masteryPick: "srd-2024_greatsword",
  attuned: true,
  entities: [
    GREATSWORD_WEAPON,
    {
      slug: "srd-2024_greatsword-of-wounding",
      entityType: "item" as const,
      name: "Greatsword of Wounding",
      data: {
        slug: "srd-2024_greatsword-of-wounding", name: "Greatsword of Wounding",
        type: "weapon", rarity: "rare",
        base_item: "[[srd-2024_greatsword]]",
        attunement: { required: true },
      },
    },
  ],
};

function fighterClass(proficient: boolean) {
  return {
    slug: "fighter", name: "Fighter", edition: "2024", hit_die: "d10",
    primary_abilities: ["str"], saving_throws: ["str", "con"],
    proficiencies: {
      armor: ["light", "medium", "heavy", "shield"],
      weapons: { categories: proficient ? ["simple", "martial"] : [] },
    },
    features_by_level: {
      1: [{
        id: "weapon-mastery", name: "Weapon Mastery",
        description: "You gain mastery with a number of weapons.",
        choices: [{ kind: "select-entity", id: "weapon-mastery", entity_type: "weapon", count: 3 }],
      }],
    },
  };
}

function fighterChar(equipItem: string, picks: string[], attuned: boolean): Character {
  return {
    name: "Fig", edition: "2024", race: null, subrace: null, background: null,
    class: [{ name: "[[fighter]]", level: 1, subclass: null, choices: { 1: { "weapon-mastery": picks } } }],
    abilities: { str: 16, dex: 12, con: 14, int: 10, wis: 10, cha: 8 },
    ability_method: "manual",
    skills: { proficient: [], expertise: [] },
    spells: { known: [], overrides: [] },
    equipment: [{ item: equipItem, equipped: true, ...(attuned ? { attuned: true } : {}) }],
    overrides: {},
    state: { hp: { current: 10, max: 10, temp: 0 }, hit_dice: {}, spell_slots: {}, concentration: null, conditions: [] },
  } as unknown as Character;
}

interface RowArgs {
  weapon: typeof GREATSWORD_2024 | typeof BATTLEAXE_2024_PLUS1 | typeof GREATSWORD_OF_WOUNDING;
  mastered: boolean;
  proficient?: boolean;
}

function buildFighterAttackRow({ weapon, mastered, proficient = true }: RowArgs): AttackRow {
  const reg = buildMockRegistry([
    { slug: "fighter", entityType: "class", data: fighterClass(proficient) },
    ...weapon.entities,
  ]);
  const picks = mastered ? [weapon.masteryPick] : [];
  const char = fighterChar(weapon.equipItem, picks, weapon.attuned);
  const resolved = new PCResolver(reg).resolve(char).character;
  return recalc(resolved, reg).attacks[0];
}

describe("Task 3: AttackRow.mastery gated by mastered + proficient", () => {
  it("populates mastery for a mastered proficient weapon with graze derived", () => {
    const row = buildFighterAttackRow({ weapon: GREATSWORD_2024, mastered: true });
    expect(row.mastery?.slug).toBe("graze");
    expect(row.mastery?.label).toBe("Graze");
    expect(row.mastery?.derived).toEqual({ label: "On miss", value: 3 }); // = strMod
  });

  it("topple DC uses PB not toHit — a +1 weapon does not inflate the DC", () => {
    const row = buildFighterAttackRow({ weapon: BATTLEAXE_2024_PLUS1, mastered: true });
    expect(row.mastery?.slug).toBe("topple");
    expect(row.mastery?.derived).toEqual({ label: "Save DC", value: 13 }); // 8+PB2+strMod3, NOT +1
  });

  it("no mastery when unmastered, non-proficient, or empty set", () => {
    expect(buildFighterAttackRow({ weapon: GREATSWORD_2024, mastered: false }).mastery).toBeUndefined();
    expect(buildFighterAttackRow({ weapon: GREATSWORD_2024, mastered: true, proficient: false }).mastery).toBeUndefined();
  });

  it("magic weapon matches on resolved base slug", () => {
    const row = buildFighterAttackRow({ weapon: GREATSWORD_OF_WOUNDING, mastered: true });
    expect(row.mastery?.slug).toBe("graze");
  });
});
