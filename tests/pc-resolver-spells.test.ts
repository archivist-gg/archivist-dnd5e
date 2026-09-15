import { describe, it, expect } from "vitest";
import { PCResolver, collectResolvedFeatures } from "../src/pc/pc.resolver";
import { buildMockRegistry } from "./mock-entity-registry";
import type { Character } from "../src/pc/pc.types";

function char(known: Character["spells"]["known"], subclass: string | null = null): Character {
  return {
    name: "Mage", edition: "2014", race: null, subrace: null, background: null,
    class: [{ name: "[[wizard]]", level: 5, subclass, choices: {} }],
    abilities: { str: 10, dex: 12, con: 12, int: 16, wis: 10, cha: 10 },
    ability_method: "manual", skills: { proficient: [], expertise: [] },
    spells: { known, overrides: [] }, equipment: [], overrides: {},
    state: { hp: { current: 30, max: 30, temp: 0 }, hit_dice: {}, spell_slots: {}, concentration: null, conditions: [], exhaustion: 0, inspiration: 0, feature_uses: {} },
  };
}

const REG = buildMockRegistry([
  { slug: "wizard", entityType: "class", data: { slug: "wizard", name: "Wizard", spellcasting: { caster_type: "full", ability: "int", preparation: "prepared", spell_list: "wizard" }, table: {}, features_by_level: {} } },
  { slug: "fireball", entityType: "spell", data: { name: "Fireball", level: 3, school: "evocation", classes: ["wizard"] } },
  { slug: "fire-bolt", entityType: "spell", data: { name: "Fire Bolt", level: 0, school: "evocation", classes: ["wizard"] } },
  // R4-G3b §5: a subclass carrying ONE `additional_spells` entry, so a grant of a spell the
  // character already knows exercises step (0) + the OR-merge through the real resolve() path.
  { slug: "wizard-evoker", entityType: "subclass", data: { slug: "wizard-evoker", name: "Evoker", features_by_level: {}, additional_spells: [{ prepared: { "1": ["fireball"] } }] } },
]);

describe("PCResolver — spells", () => {
  it("resolves bare-slug cantrips as prepared (always ready)", () => {
    const { character } = new PCResolver(REG).resolve(char(["[[fire-bolt]]"]));
    expect(character.spells).toHaveLength(1);
    expect(character.spells[0].entity.name).toBe("Fire Bolt");
    expect(character.spells[0].prepared).toBe(true);       // cantrip
    expect(character.spells[0].classSlug).toBe("wizard");  // sole caster
  });

  it("resolves object-form with explicit prepared + source", () => {
    const { character } = new PCResolver(REG).resolve(char([{ spell: "[[fireball]]", prepared: true, source: "class" }]));
    expect(character.spells[0].entity.level).toBe(3);
    expect(character.spells[0].prepared).toBe(true);
    expect(character.spells[0].alwaysPrepared).toBe(false);
  });

  it("emits a warning for an unresolved spell slug but does not throw", () => {
    const { character, warnings } = new PCResolver(REG).resolve(char(["[[missing-spell]]"]));
    expect(character.spells).toHaveLength(0);
    expect(warnings.some((w) => w.includes("missing-spell"))).toBe(true);
  });

  it("marks a persisted known spell `persisted: true`; a granted one carries no flag", () => {
    const { character } = new PCResolver(REG).resolve(char(["[[fire-bolt]]"]));
    // RED FIRST before Task 6 (dnd5e feb6c50): this read `undefined`; the persisted-known loop
    // pushed no flag and `ResolvedSpell.persisted` did not exist.
    expect(character.spells[0].persisted).toBe(true);
    expect(character.spells[0].source).toBe("class");
  });

  it("a subclass grant of an already-known spell merges into the known row (ONE row, always)", () => {
    const { character } = new PCResolver(REG).resolve(
      char([{ spell: "[[fireball]]", prepared: false, source: "class" }], "[[wizard-evoker]]"),
    );
    const fireballs = character.spells.filter((s) => s.slug === "fireball");
    // RED FIRST before Task 6 (dnd5e feb6c50): this read `false`; the subclass's `additional_spells`
    // were never folded, so the only row was the persisted copy with its own `alwaysPrepared: false`.
    expect(fireballs[0].alwaysPrepared).toBe(true);
    expect(fireballs).toHaveLength(1);
    expect(fireballs[0].persisted).toBe(true);
    expect(fireballs[0].prepared).toBe(true);
  });
});

describe("§16 row 48 · the background push is the sixth `withResolvedActionCost` site (Gate 2 I-5)", () => {
  it("an AUTHORED background feature spelled action_cost resolves with `action` mirrored", () => {
    const bg = { slug: "x_background_wildspacer", name: "Wildspacer", feature: { name: "Ship Passage", description: "x", action_cost: "bonus-action" } } as never;
    const row = collectResolvedFeatures(null, [], bg, []).find((f) => f.source.kind === "background")!;
    // RED FIRST before Task 6 (dnd5e feb6c50): this read `undefined`; the background push was the
    // one unwrapped entity-feature site in collectResolvedFeatures.
    expect(row.feature.action).toBe("bonus-action");
  });
});

// R4-G7 T8 RIDER-19 (F-PACT): an un-classed known spell goes to the FIRST caster class (class-entry order) whose base name
// its own `classes` names, not blindly to the first caster. Live witness W-A2 `conv-paladin5e5-warlock5e5`: the
// Paladin-first sheet printed "No spells." under PACT MAGIC while Armor of Agathys (`classes: [warlock]`) sat in the 1st
// level block, because every un-classed entry fell to `primaryCasterSlug`. A spell no caster list names keeps the first
// caster; an explicit `class:` always wins.
describe("PCResolver · an un-classed known spell on a multiclass caster (R4-G7 T8 RIDER-19)", () => {
  const MC = buildMockRegistry([
    { slug: "players-handbook-2014_class_paladin", entityType: "class", data: { slug: "players-handbook-2014_class_paladin", name: "Paladin", spellcasting: { caster_type: "half", ability: "cha", preparation: "prepared", spell_list: "paladin" }, table: {}, features_by_level: {} } },
    { slug: "players-handbook-2014_class_warlock", entityType: "class", data: { slug: "players-handbook-2014_class_warlock", name: "Warlock", spellcasting: { caster_type: "pact", ability: "cha", preparation: "known", spell_list: "warlock" }, table: {}, features_by_level: {} } },
    { slug: "players-handbook-2014_class_cleric", entityType: "class", data: { slug: "players-handbook-2014_class_cleric", name: "Cleric", spellcasting: { caster_type: "full", ability: "wis", preparation: "prepared", spell_list: "cleric" }, table: {}, features_by_level: {} } },
    { slug: "players-handbook-2014_class_fighter", entityType: "class", data: { slug: "players-handbook-2014_class_fighter", name: "Fighter", table: {}, features_by_level: {} } },
    { slug: "phb_spell_armor-of-agathys", entityType: "spell", data: { name: "Armor of Agathys", level: 1, classes: ["warlock"] } },
    { slug: "phb_spell_bless", entityType: "spell", data: { name: "Bless", level: 1, classes: ["cleric", "paladin"] } },
    { slug: "phb_spell_detect-magic", entityType: "spell", data: { name: "Detect Magic", level: 1, classes: ["paladin", "warlock", "wizard"] } },
    { slug: "phb_spell_shield", entityType: "spell", data: { name: "Shield", level: 1, classes: ["sorcerer", "wizard"] } },
  ]);
  const PAL = "players-handbook-2014_class_paladin", WAR = "players-handbook-2014_class_warlock", CLE = "players-handbook-2014_class_cleric", FTR = "players-handbook-2014_class_fighter";
  const mc = (classes: string[], known: Character["spells"]["known"]): Character => ({
    ...char(known), class: classes.map((c) => ({ name: `[[${c}]]`, level: 5, subclass: null, choices: {} })),
  });
  const slugOf = (character: { spells: { slug: string; classSlug: string | null }[] }, slug: string) =>
    character.spells.find((s) => s.slug === slug)?.classSlug;

  it("a Paladin-first Paladin / Warlock: Armor of Agathys (classes: [warlock]) is the Warlock's spell", () => {
    const { character } = new PCResolver(MC).resolve(mc([PAL, WAR], ["[[phb_spell_armor-of-agathys]]", "[[phb_spell_bless]]"]));
    expect(slugOf(character, "phb_spell_armor-of-agathys")).toBe(WAR);
    expect(slugOf(character, "phb_spell_bless")).toBe(PAL);
  });
  it("a Warlock-first sheet sends the Paladin's own spell to the Paladin (the rule is not an order swap)", () => {
    const { character } = new PCResolver(MC).resolve(mc([WAR, PAL], ["[[phb_spell_bless]]", "[[phb_spell_armor-of-agathys]]"]));
    expect(slugOf(character, "phb_spell_bless")).toBe(PAL);
    expect(slugOf(character, "phb_spell_armor-of-agathys")).toBe(WAR);
  });
  it("the FIRST listed caster wins, not a unique one: Bless on a Warlock / Cleric / Paladin is the Cleric's", () => {
    const { character } = new PCResolver(MC).resolve(mc([WAR, CLE, PAL], ["[[phb_spell_bless]]", "[[phb_spell_armor-of-agathys]]"]));
    expect(slugOf(character, "phb_spell_bless")).toBe(CLE);
    expect(slugOf(character, "phb_spell_armor-of-agathys")).toBe(WAR);
  });
  it("a spell BOTH lists name (Detect Magic) and one NEITHER names (Shield) stay with the first caster", () => {
    const { character } = new PCResolver(MC).resolve(mc([PAL, WAR], ["[[phb_spell_detect-magic]]", "[[phb_spell_shield]]"]));
    expect(slugOf(character, "phb_spell_detect-magic")).toBe(PAL);
    expect(slugOf(character, "phb_spell_shield")).toBe(PAL);
  });
  it("an explicit `class:` always wins, even naming a class the spell's list does not name", () => {
    const { character } = new PCResolver(MC).resolve(mc([PAL, WAR], [{ spell: "[[phb_spell_armor-of-agathys]]", class: `[[${PAL}]]` }]));
    expect(slugOf(character, "phb_spell_armor-of-agathys")).toBe(PAL);
  });
  it("a non-caster class never attracts a spell, and a single caster keeps every un-classed spell (characterisation)", () => {
    const { character } = new PCResolver(MC).resolve(mc([FTR, PAL], ["[[phb_spell_armor-of-agathys]]", "[[phb_spell_bless]]"]));
    expect(slugOf(character, "phb_spell_armor-of-agathys")).toBe(PAL);
    expect(slugOf(character, "phb_spell_bless")).toBe(PAL);
  });
});
