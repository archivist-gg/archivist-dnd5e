import { describe, it, expect } from "vitest";
import { recalc } from "../src/pc/pc.recalc";
import type { Character, ResolvedCharacter } from "../src/pc/pc.types";
import type { ItemEntity } from "@archivist-gg/dnd5e/item/item.types";
import { buildMockRegistry } from "./mock-entity-registry";

// D7 — fail-loud when an equipped magic item's `base_item` fails to resolve.
//
// The flagship P2 bug: a magic armor whose `base_item` points at a base that
// isn't in the registry silently degrades AC to 10 (unarmored) with NO warning.
// A magic armor reaches AC via two mutually-exclusive slotting paths:
//   Path A — derived slot (no explicit `slot:`): assignSlots' derived sweep
//            calls defaultSlotForType → resolveBaseItem miss → null → the item
//            is never slotted → computeAC sees an empty armor slot → AC 10.
//   Path B — explicit `slot: armor`: the item lands in the armor slot directly;
//            computeAC's effectiveArmor returns null → AC 10.
// Both must now warn. The weapon path already warned but double-wrapped the
// wikilink (`[[[[…]]]]`); that cosmetic bug is fixed too.
//
// All three registries deliberately OMIT the base armor/weapon so `base_item`
// cannot resolve — reproducing Ser Baelor's real "AC 10" degradation.

const baseChar = (): Character => ({
  name: "T",
  edition: "2014",
  race: null,
  subrace: null,
  background: null,
  class: [{ name: "fighter", level: 1, subclass: null, choices: {} }],
  abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
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
});

const mkResolved = (definition: Character): ResolvedCharacter => ({
  definition,
  race: null,
  classes: [],
  background: null,
  feats: [],
  totalLevel: 1,
  features: [],
  spells: [],
  state: definition.state,
});

// Magic armor whose base_item points at "Plate Armor" — a base NOT registered
// below, so it can never resolve. This is Ser Baelor's actual data shape.
const MAGIC_PLATE: ItemEntity = {
  name: "Ser Baelor's Plate",
  slug: "magic-plate",
  type: "armor",
  rarity: "rare",
  base_item: "[[SRD 5e/Armor/Plate Armor]]",
  attunement: false,
};

// Magic weapon whose base_item points at "Longsword" — also NOT registered.
const MAGIC_SWORD: ItemEntity = {
  name: "Ser Baelor's Blade",
  slug: "magic-sword",
  type: "weapon",
  rarity: "rare",
  base_item: "[[SRD 5e/Weapons/Longsword]]",
  attunement: false,
};

describe("D7 — fail-loud on unresolvable magic-item base_item", () => {
  it("Case A: armor with NO explicit slot warns in the derived sweep (Ser Baelor's real mode)", () => {
    const reg = buildMockRegistry([
      { slug: "magic-plate", entityType: "item", name: MAGIC_PLATE.name, data: MAGIC_PLATE },
    ]);
    const c = baseChar();
    c.equipment = [{ item: "[[magic-plate]]", equipped: true }]; // no slot → derived sweep

    const d = recalc(mkResolved(c), reg);

    // The silent-degradation symptom: AC collapses to unarmored 10.
    expect(d.ac).toBe(10);
    // The guard: a warning names the item AND its unresolvable base_item.
    const warn = d.warnings.find((w) => w.includes(MAGIC_PLATE.name));
    expect(warn).toBeDefined();
    expect(warn).toContain("[[SRD 5e/Armor/Plate Armor]]");
  });

  it("Case B: armor with explicit slot: armor warns in the computeAC path", () => {
    const reg = buildMockRegistry([
      { slug: "magic-plate", entityType: "item", name: MAGIC_PLATE.name, data: MAGIC_PLATE },
    ]);
    const c = baseChar();
    c.equipment = [{ item: "[[magic-plate]]", equipped: true, slot: "armor" }]; // explicit → computeAC path

    const d = recalc(mkResolved(c), reg);

    expect(d.ac).toBe(10);
    const warn = d.warnings.find((w) => w.includes(MAGIC_PLATE.name));
    expect(warn).toBeDefined();
    expect(warn).toContain("[[SRD 5e/Armor/Plate Armor]]");
  });

  it("Case C: weapon warning wraps the wikilink exactly ONCE (no [[[[ double-wrap)", () => {
    const reg = buildMockRegistry([
      { slug: "magic-sword", entityType: "item", name: MAGIC_SWORD.name, data: MAGIC_SWORD },
    ]);
    const c = baseChar();
    // MUST set slot: a no-slot weapon base miss is intercepted by Path A's
    // continue and never reaches computeAttacks; the double-wrap lives in the
    // computeAttacks (explicit-slot) path.
    c.equipment = [{ item: "[[magic-sword]]", equipped: true, slot: "mainhand" }];

    const d = recalc(mkResolved(c), reg);

    const warn = d.warnings.find((w) => w.includes(MAGIC_SWORD.name));
    expect(warn).toBeDefined();
    expect(warn).toContain("[[SRD 5e/Weapons/Longsword]]");
    expect(warn).not.toContain("[[[[");
  });
});
