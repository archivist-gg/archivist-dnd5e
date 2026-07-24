import { describe, it, expect } from "vitest";
import { PCResolver } from "../src/pc/pc.resolver";
import { recalc } from "../src/pc/pc.recalc";
import { emptyFeatureEffectTotals } from "../src/pc/pc.feature-effects";
import { buildMockRegistry } from "./mock-entity-registry";
import { CLUB, GREATSWORD, LONGSWORD, SHORTBOW, SPEAR } from "./equipment-fixtures";
import type { Character, ResolvedCharacter, ResolvedClass } from "../src/pc/pc.types";

// Task 4 (MCDM #2): a `weapon-ability` effect can now scope its melee ability
// override to a CHOSEN weapon type. The MCDM Illrigger "Lies" combat-mastery
// carries `weapons: "chosen"` + a nested `lies-weapon` select-entity; the
// resolver resolves the pick at synthesis and recalc applies CHA-to-melee ONLY
// to the chosen weapon. Empty/absent/unresolved scope = GLOBAL (back-compat with
// P1 unscoped Lies + any Hexblade-like unscoped override).
//
// This copies the LOCAL hexbladeChar() pattern from pc-inline-pick.e2e.test.ts
// (STR 8 mod -1 vs CHA 18 mod +4 makes the melee ability unambiguous from the
// resulting toHit) and adds the nested lies-weapon select-entity + pick.

// A class whose L1 feature offers a select-inline "combat-mastery" pick. When
// `scoped`, the "lies" option carries `weapons:"chosen"` + a nested
// `lies-weapon` select-entity{weapon}; otherwise it is a plain global override.
function liesClass(scoped: boolean) {
  const liesEffect = scoped
    ? { kind: "weapon-ability", ability: "cha", weapons: "chosen" }
    : { kind: "weapon-ability", ability: "cha" };
  return {
    slug: "hexblade", name: "Hexblade", edition: "2014", hit_die: "d10",
    primary_abilities: ["cha"], saving_throws: ["wis", "cha"],
    // simple+martial so the greatsword/longsword/shortbow +prof all land (clean numbers).
    proficiencies: { weapons: { categories: ["simple", "martial"] } },
    features_by_level: {
      1: [{
        id: "combat-mastery", name: "Combat Mastery", description: "Pick a mastery.",
        choices: [{
          kind: "select-inline", id: "combat-mastery", options: [{
            value: "lies", label: "Lies",
            description: "Use Charisma for melee attack & damage with your chosen weapon.",
            effects: [liesEffect],
            ...(scoped ? { choices: [{ kind: "select-entity", id: "lies-weapon", entity_type: "weapon" }] } : {}),
          }],
        }],
      }],
    },
  };
}

function liesChar(opts: { scoped?: boolean; liesWeapon?: string; wield: string }): Character {
  const choices1: Record<string, string> = { "combat-mastery": "lies" };
  if (opts.liesWeapon) choices1["lies-weapon"] = opts.liesWeapon;
  return {
    name: "Bael", edition: "2014", race: null, subrace: null, background: null,
    class: [{ name: "[[hexblade]]", level: 1, subclass: null, choices: { 1: choices1 } }],
    abilities: { str: 8, dex: 10, con: 10, int: 10, wis: 10, cha: 18 },
    ability_method: "manual",
    skills: { proficient: [], expertise: [] },
    spells: { known: [], overrides: [] },
    equipment: [{ item: `[[${opts.wield}]]`, equipped: true }],
    overrides: {},
    state: { hp: { current: 10, max: 10, temp: 0 }, hit_dice: {}, spell_slots: {}, concentration: null, conditions: [] },
  } as unknown as Character;
}

function runLies(opts: { scoped?: boolean; liesWeapon?: string; wield: string }) {
  const scoped = opts.scoped ?? true;
  const reg = buildMockRegistry([
    { slug: "hexblade", entityType: "class", data: liesClass(scoped) },
    { slug: "greatsword", entityType: "weapon", name: "Greatsword", data: GREATSWORD },
    { slug: "longsword", entityType: "weapon", name: "Longsword", data: LONGSWORD },
    { slug: "shortbow", entityType: "weapon", name: "Shortbow", data: SHORTBOW },
    { slug: "spear", entityType: "weapon", name: "Spear", data: SPEAR },
  ]);
  const { character } = new PCResolver(reg).resolve(liesChar({ ...opts, scoped }));
  return recalc(character, reg).attacks;
}

describe("Task 4: scope MCDM Lies CHA override to a chosen weapon type", () => {
  it("(1) Lies scoped to greatsword + wielding greatsword ⇒ melee uses CHA", () => {
    // pick uses a namespaced slug to prove bareEntitySlug stripping (registry slug is bare).
    const attacks = runLies({ liesWeapon: "srd-2024_greatsword", wield: "greatsword" });
    expect(attacks[0].name).toBe("Greatsword");
    // CHA +4 + prof +2 = 6 (NOT STR -1 + 2 = 1)
    expect(attacks[0].toHit).toBe(6);
  });

  it("(2) same Lies (greatsword) but wielding a longsword ⇒ STR/DEX, NOT CHA", () => {
    const attacks = runLies({ liesWeapon: "srd-2024_greatsword", wield: "longsword" });
    expect(attacks[0].name).toBe("Longsword");
    // longsword is versatile (not finesse) ⇒ STR -1 + prof +2 = 1 (NOT CHA's 6)
    expect(attacks[0].toHit).toBe(1);
    expect(attacks[0].toHit).not.toBe(6);
  });

  it("(3) unresolved 'chosen' (no lies-weapon pick) ⇒ global CHA (back-compat)", () => {
    const attacks = runLies({ liesWeapon: undefined, wield: "longsword" });
    // scope stays GLOBAL when the choice is unresolved ⇒ melee CHA applies broadly.
    expect(attacks[0].name).toBe("Longsword");
    expect(attacks[0].toHit).toBe(6);
  });

  it("(4) a plain unscoped weapon-ability ⇒ global melee CHA", () => {
    const attacks = runLies({ scoped: false, wield: "greatsword" });
    expect(attacks[0].name).toBe("Greatsword");
    expect(attacks[0].toHit).toBe(6);
  });

  it("(5) a global override never applies to a ranged weapon (DEX)", () => {
    const attacks = runLies({ scoped: false, wield: "shortbow" });
    expect(attacks[0].name).toBe("Shortbow");
    // shortbow is simple-ranged ⇒ DEX 0 + prof +2 = 2 (NOT CHA's 6)
    expect(attacks[0].toHit).toBe(2);
    expect(attacks[0].toHit).not.toBe(6);
  });

  it("(6b) a global override APPLIES to a thrown-melee weapon (spear ⇒ CHA, RAW)", () => {
    // spear is SRD-categorized `simple-ranged` but is a throwable MELEE weapon
    // (no ammunition/loading; slug not dart/net). Per RAW it keeps melee rules,
    // so a global weapon-ability override now governs it — unlike the true
    // ranged shortbow above.
    const attacks = runLies({ scoped: false, wield: "spear" });
    expect(attacks[0].name).toBe("Spear");
    // CHA +4 + prof +2 = 6 (NOT DEX 0 + 2 = 2, which the old ranged-category test would give)
    expect(attacks[0].toHit).toBe(6);
    expect(attacks[0].toHit).not.toBe(2);
  });

  it("[R-D2b] (6) weapon-ability:spellcasting sentinel ⇒ global caster ability wins over a concrete global", () => {
    // A synthetic caster with TWO weapon-ability effects: {ability:"str"} (concrete
    // global) + {ability:"spellcasting"} (sentinel). recalc must resolve the
    // sentinel to the primary caster ability (INT) and PREPEND it so it wins over
    // the concrete "str" global — proving the unshift precedence is preserved.
    const casterEntity = {
      slug: "spellblade", name: "spellblade", edition: "2014", hit_die: "d8",
      primary_abilities: ["int"], saving_throws: [], features_by_level: {}, table: {},
      spellcasting: { caster_type: "full", ability: "int", preparation: "known", spell_list: "spellblade" },
      proficiencies: { weapons: { categories: ["simple"] } },
    };
    const cls: ResolvedClass = { entity: casterEntity as never, level: 1, subclass: null, choices: {} };
    const resolved: ResolvedCharacter = {
      definition: {
        name: "Arc", edition: "2014", race: null, subrace: null, background: null, class: [],
        abilities: { str: 8, dex: 10, con: 10, int: 18, wis: 10, cha: 10 },
        ability_method: "manual", skills: { proficient: [], expertise: [] },
        spells: { known: [], overrides: [] },
        equipment: [{ item: "[[club]]", equipped: true }],
        overrides: {},
        state: { hp: { current: 10, max: 10, temp: 0 }, hit_dice: {}, spell_slots: {}, concentration: null, conditions: [] },
      } as never,
      race: null, classes: [cls], background: null, feats: [], totalLevel: 1,
      features: [{
        feature: {
          name: "Arcane Blade",
          effects: [
            { kind: "weapon-ability", ability: "str" },
            { kind: "weapon-ability", ability: "spellcasting" },
          ],
        } as never,
        source: { kind: "class", slug: "spellblade" } as never,
      }],
      spells: [],
      state: { hp: { current: 10, max: 10, temp: 0 }, hit_dice: {}, spell_slots: {}, concentration: null, conditions: [] } as never,
    };
    const reg = buildMockRegistry([{ slug: "club", entityType: "weapon", name: "Club", data: CLUB }]);
    const attacks = recalc(resolved, reg).attacks;
    expect(attacks[0].name).toBe("Club");
    // INT +4 (resolved caster ability) + prof +2 = 6 — NOT STR -1 + 2 = 1.
    expect(attacks[0].toHit).toBe(6);
    // The empty totals carry an empty override list (no scalar straggler).
    expect(emptyFeatureEffectTotals().weaponAbilities).toEqual([]);
  });

  it("[R3-P4] weapon-ability:spellcasting honors the per-class ability override", () => {
    const casterEntity = {
      slug: "spellblade", name: "spellblade", edition: "2014", hit_die: "d8",
      primary_abilities: ["int"], saving_throws: [], features_by_level: {}, table: {},
      spellcasting: { caster_type: "full", ability: "int", preparation: "known", spell_list: "spellblade" },
      proficiencies: { weapons: { categories: ["simple"] } },
    };
    const cls: ResolvedClass = { entity: casterEntity as never, level: 1, subclass: null, choices: {} };
    const resolved: ResolvedCharacter = {
      definition: {
        name: "Arc", edition: "2014", race: null, subrace: null, background: null, class: [],
        abilities: { str: 8, dex: 10, con: 10, int: 10, wis: 10, cha: 18 },
        ability_method: "manual", skills: { proficient: [], expertise: [] },
        spells: { known: [], overrides: [] },
        equipment: [{ item: "[[club]]", equipped: true }],
        overrides: { spellcasting_ability_by_class: { spellblade: "cha" } },
        state: { hp: { current: 10, max: 10, temp: 0 }, hit_dice: {}, spell_slots: {}, concentration: null, conditions: [] },
      } as never,
      race: null, classes: [cls], background: null, feats: [], totalLevel: 1,
      features: [{
        feature: {
          name: "Arcane Blade",
          effects: [{ kind: "weapon-ability", ability: "spellcasting" }],
        } as never,
        source: { kind: "class", slug: "spellblade" } as never,
      }],
      spells: [],
      state: { hp: { current: 10, max: 10, temp: 0 }, hit_dice: {}, spell_slots: {}, concentration: null, conditions: [] } as never,
    };
    const reg = buildMockRegistry([{ slug: "club", entityType: "weapon", name: "Club", data: CLUB }]);
    const attacks = recalc(resolved, reg).attacks;
    // CHA +4 (override) + prof +2 = 6 - NOT default INT +0 + prof +2 = 2.
    expect(attacks[0].toHit).toBe(4 + 2);
  });
});
