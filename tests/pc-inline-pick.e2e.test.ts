import { describe, it, expect } from "vitest";
import { PCResolver } from "../src/pc/pc.resolver";
import { recalc } from "../src/pc/pc.recalc";
import { buildMockRegistry } from "./mock-entity-registry";
import { CLUB } from "./equipment-fixtures";
import type { Character } from "../src/pc/pc.types";

// End-to-end guard for #3 (fixes the "blind safety net" — the existing
// pc-recalc-feature-effects weapon-ability test injects the effect DIRECTLY,
// bypassing resolver synthesis, so it cannot catch a resolver-side removal).
//
// A class whose L1 feature offers a select-inline "combat-mastery" pick; the
// "lies" option carries a weapon-ability→CHA effect (P1 #2). Choosing it and
// running the REAL resolve()→recalc() path must:
//   (a) drive melee attacks to CHA (#2 does NOT regress) — proving the
//       chosen-option synthetic still folds its effect through recalc, AND
//   (b) render-suppress that synthetic (so the sheet shows the prose on the
//       parent, not a duplicate row).
const HEXBLADE = {
  slug: "hexblade", name: "Hexblade", edition: "2014", hit_die: "d10",
  primary_abilities: ["cha"], saving_throws: ["wis", "cha"],
  // Grant simple-weapon proficiency so the club's +prof lands (clean numbers).
  proficiencies: { weapons: { categories: ["simple"] } },
  features_by_level: {
    1: [{
      id: "combat-mastery", name: "Combat Mastery", description: "Pick a mastery.",
      choices: [{ kind: "select-inline", id: "combat-mastery", options: [
        { value: "lies", label: "Lies",
          description: "Use Charisma for melee attack & damage.",
          effects: [{ kind: "weapon-ability", ability: "cha" }] },
      ] }],
    }],
  },
};

function hexbladeChar(): Character {
  return {
    name: "Bael", edition: "2014", race: null, subrace: null, background: null,
    class: [{ name: "[[hexblade]]", level: 1, subclass: null, choices: { 1: { "combat-mastery": "lies" } } }],
    // STR 8 (mod -1) vs CHA 18 (mod +4): the ability the melee attack uses is
    // unambiguous from the resulting numbers.
    abilities: { str: 8, dex: 10, con: 10, int: 10, wis: 10, cha: 18 },
    ability_method: "manual",
    skills: { proficient: [], expertise: [] },
    spells: { known: [], overrides: [] },
    equipment: [{ item: "[[club]]", equipped: true }],
    overrides: {},
    state: { hp: { current: 10, max: 10, temp: 0 }, hit_dice: {}, spell_slots: {}, concentration: null, conditions: [] },
  };
}

describe("#3 end-to-end: select-inline weapon-ability pick survives resolve→recalc", () => {
  it("melee attack uses CHA (#2 non-regression) AND the chosen-option synthetic is render-suppressed", () => {
    const reg = buildMockRegistry([
      { slug: "hexblade", entityType: "class", data: HEXBLADE },
      { slug: "club", entityType: "weapon", name: "Club", data: CLUB },
    ]);
    const { character } = new PCResolver(reg).resolve(hexbladeChar());

    // (b) the chosen-option synthetic REMAINS in resolved.features (so its
    //     effect can fold) but carries the render-suppression flag.
    const synth = character.features.find((rf) => rf.feature.id === "combat-mastery-lies");
    expect(synth).toBeDefined();
    expect(synth!.feature.effects).toEqual([{ kind: "weapon-ability", ability: "cha" }]);
    expect(synth!.renderSuppressed).toBe(true);

    // the parent feature carries the chosen prose for render.
    const parent = character.features.find((rf) => rf.feature.name === "Combat Mastery");
    expect(parent!.chosenInline).toEqual([{ label: "Lies", description: "Use Charisma for melee attack & damage." }]);

    // (a) #2 does NOT regress: the club (simple melee) uses CHA for to-hit AND
    //     damage end-to-end through the real recalc pipeline.
    const derived = recalc(character, reg);
    const club = derived.attacks[0];
    expect(club.name).toBe("Club");
    expect(club.toHit).toBe(6);              // CHA +4 + prof +2 — NOT STR (-1) + 2 = 1
    expect(club.damageDice).toBe("1d4+4");   // CHA +4 to damage
    expect(club.breakdown.damage).toContainEqual({ source: "CHA modifier", amount: 4, kind: "ability" });
  });
});
