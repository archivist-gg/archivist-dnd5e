import { describe, it, expect } from "vitest";
import { PCResolver } from "../src/pc/pc.resolver";
import { recalc } from "../src/pc/pc.recalc";
import { buildMockRegistry } from "./mock-entity-registry";
import { CLUB } from "./equipment-fixtures";
import type { Character } from "../src/pc/pc.types";

const RAVAGER = {
  slug: "ravager", name: "Ravager", edition: "2014", hit_die: "d10",
  primary_abilities: ["str"], saving_throws: ["str", "con"],
  proficiencies: { weapons: { categories: ["simple"] } },
  features_by_level: {
    1: [{
      id: "terrorizing-force", name: "Terrorizing Force",
      description: "You deal an extra 1d8 damage on a weapon hit.",
      effects: [{ kind: "damage-bonus", damage_type: "necrotic", amount: "1d8", applies_to: "weapon" }],
    }],
  },
};

// Mirror hexbladeChar() in pc-inline-pick.e2e.test.ts: a minimal L1 Character
// on the Ravager class wielding an equipped club.
function ravagerChar(): Character {
  return {
    name: "Rav", edition: "2014", race: null, subrace: null, background: null,
    class: [{ name: "[[ravager]]", level: 1, subclass: null, choices: {} }],
    abilities: { str: 12, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    ability_method: "manual",
    skills: { proficient: [], expertise: [] },
    spells: { known: [], overrides: [] },
    equipment: [{ item: "[[club]]", equipped: true }],
    overrides: {},
    state: { hp: { current: 10, max: 10, temp: 0 }, hit_dice: {}, spell_slots: {}, concentration: null, conditions: [] },
  } as unknown as Character;
}

describe("damage-bonus e2e (flat feature effect → resolve → recalc)", () => {
  it("surfaces a class feature's damage-bonus on weapon attacks with source = feature name", () => {
    const reg = buildMockRegistry([
      { slug: "ravager", entityType: "class", data: RAVAGER },
      { slug: "club", entityType: "weapon", name: "Club", data: CLUB },
    ]);
    const { character } = new PCResolver(reg).resolve(ravagerChar());
    const derived = recalc(character, reg);
    expect(derived.attacks[0].damageRiders).toEqual([
      { amount: "1d8", damage_type: "necrotic", source: "Terrorizing Force" },
    ]);
  });
});
