import { describe, it, expect, vi } from "vitest";
import type { EntityRegistry } from "@archivist-gg/core";
import { PCResolver, collectResolvedFeatures } from "../src/pc/pc.resolver";
import { recalc } from "../src/pc/pc.recalc";
import { baseClassName } from "../src/class/class.slug";
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
// caster; an explicit `class:` always wins. Fix round 1 (review C-1) guards the move: see the next describe.
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
  it("the known-to-prepared castability flip is deliberate: a plain Bless moved off a known Warlock is an UNPREPARED Paladin spell (review C-1 (c))", () => {
    // The Cast view's rule (plugin `cast-view.ts:37-38`): a spell is castable when `prepared`, or when its class prepares
    // nothing (`preparation: "known"`). A plain-string entry carries no prepared flag, so on the Warlock it was castable and
    // on the Paladin it is not until the player prepares it. Chosen: the list names the Paladin, so the Prepare view owns it.
    const { character } = new PCResolver(MC).resolve(mc([WAR, PAL], ["[[phb_spell_bless]]"]));
    const derived = recalc(character, MC);
    const bless = character.spells.find((s) => s.slug === "phb_spell_bless");
    expect(bless?.classSlug).toBe(PAL);
    expect(bless?.prepared).toBe(false);
    expect(derived.spellcastingClasses.map((c) => [c.classSlug, c.preparation])).toEqual([[WAR, "known"], [PAL, "prepared"]]);
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

// R4-G7 T8 RIDER-19 fix round 1 (review C-1): the first caster keeps every un-classed spell unless its OWN list is
// observable: (i) its profile names a list (`spellList` non-null; the converter's Arcane Trickster / Eldritch Knight name
// none, their spells name `wizard`) AND (ii) its base class name is on at least one spell in the registry (the SRD 5e bundle
// lists `paladin` on no spell, DATA-SRD). Shapes from the review's probe (`g7-t8-rider-wave-C-review-probe.mts.txt`). Booked
// known limit: a list EXTENSION on an observable first caster (a 2014 Fiend Warlock's Burning Hands, Magical Secrets, Divine
// Soul) still moves; an explicit `class:` is the override.
describe("PCResolver · the first caster keeps its un-classed spells unless its own list is observable (R4-G7 T8 RIDER-19 fix round 1)", () => {
  const cls = (slug: string, name: string, spellcasting?: Record<string, unknown>) =>
    ({ slug, entityType: "class", data: { slug, name, ...(spellcasting ? { spellcasting } : {}), table: {}, features_by_level: {} } });
  const sub = (slug: string, name: string, spellcasting: Record<string, unknown>) =>
    ({ slug, entityType: "subclass", data: { slug, name, spellcasting, table: {}, features_by_level: {} } });
  const spell = (slug: string, name: string, classes: string[]) => ({ slug, entityType: "spell", data: { name, level: 1, classes } });
  const X = buildMockRegistry([
    cls("x_class_rogue", "Rogue"), sub("x_subclass_arcane-trickster", "Arcane Trickster", { caster_type: "third", ability: "int" }),
    cls("x_class_fighter", "Fighter"), sub("x_subclass_eldritch-knight", "Eldritch Knight", { caster_type: "third", ability: "int" }),
    cls("x_class_wizard", "Wizard", { caster_type: "full", ability: "int", preparation: "prepared", spell_list: "wizard" }),
    cls("x_class_sorcerer", "Sorcerer", { caster_type: "full", ability: "cha", preparation: "known", spell_list: "sorcerer" }),
    spell("x_spell_charm-person", "Charm Person", ["bard", "druid", "sorcerer", "warlock", "wizard"]),
    spell("x_spell_shield", "Shield", ["sorcerer", "wizard"]),
    // A homebrew spell naming both base classes, so guard (ii) alone would let the AT / EK spells move and only guard (i)
    // keeps them. Measured: no spell in the converter output or either SRD bundle lists `rogue` or `fighter`, so on real
    // data (ii) keeps them as well.
    spell("x_spell_homebrew-ward", "Homebrew Ward", ["fighter", "rogue"]),
  ]);
  const srd5 = () => buildMockRegistry([
    cls("srd-5e_class_paladin", "Paladin", { caster_type: "half", ability: "cha", preparation: "prepared", spell_list: "paladin" }),
    cls("srd-5e_class_cleric", "Cleric", { caster_type: "full", ability: "wis", preparation: "prepared", spell_list: "cleric" }),
    cls("srd-5e_class_warlock", "Warlock", { caster_type: "pact", ability: "cha", preparation: "known", spell_list: "warlock" }),
    spell("srd-5e_spell_bless", "Bless", ["cleric"]),
    spell("srd-5e_spell_command", "Command", ["cleric", "warlock"]),
    spell("srd-5e_spell_hex", "Hex", ["warlock"]),
  ]);
  const pc = (classes: [string, string | null][], known: Character["spells"]["known"], cha = 10): Character => {
    const base = char(known);
    return {
      ...base, abilities: { ...base.abilities, cha },
      class: classes.map(([name, subclass]) => ({ name: `[[${name}]]`, level: 5, subclass: subclass ? `[[${subclass}]]` : null, choices: {} })),
    };
  };
  /** The resolved owner of one spell, and the derived class row the Cast view reads its DC and castability from. */
  const owner = (reg: EntityRegistry, ch: Character, slug: string) => {
    const { character } = new PCResolver(reg).resolve(ch);
    const s = character.spells.find((x) => x.slug === slug);
    const row = recalc(character, reg).spellcastingClasses.find((c) => baseClassName(c.classSlug) === baseClassName(s?.classSlug ?? ""));
    return { classSlug: s?.classSlug, prepared: s?.prepared, preparation: row?.preparation, dc: row?.saveDC };
  };

  it("an Arcane Trickster-first Rogue / Wizard: Charm Person stays the Rogue's and castable (the AT names no list)", () => {
    const r = owner(X, pc([["x_class_rogue", "x_subclass_arcane-trickster"], ["x_class_wizard", null]], ["[[x_spell_charm-person]]"]), "x_spell_charm-person");
    expect(r.classSlug).toBe("x_class_rogue");
    expect([r.prepared, r.preparation]).toEqual([false, "known"]);
  });
  it("an Eldritch Knight-first Fighter / Sorcerer: Shield stays the Fighter's at the Fighter's DC 15 (the EK names no list)", () => {
    const r = owner(X, pc([["x_class_fighter", "x_subclass_eldritch-knight"], ["x_class_sorcerer", null]], ["[[x_spell_shield]]"]), "x_spell_shield");
    expect(r.classSlug).toBe("x_class_fighter");
    expect(r.dc).toBe(15);
  });
  it("an SRD 5e Paladin-first / Cleric: a prepared Bless keeps the Paladin's DC 15 (no SRD 5e spell lists paladin)", () => {
    const reg = srd5();
    const r = owner(reg, pc([["srd-5e_class_paladin", null], ["srd-5e_class_cleric", null]], [{ spell: "[[srd-5e_spell_bless]]", prepared: true }], 16), "srd-5e_spell_bless");
    expect(r.classSlug).toBe("srd-5e_class_paladin");
    expect(r.dc).toBe(15);
  });
  it("an SRD 5e Paladin-first / Warlock: Command stays the Paladin's, out of Pact Magic (and so does Hex: nothing moves off an unobservable list)", () => {
    const reg = srd5();
    const { character } = new PCResolver(reg).resolve(pc([["srd-5e_class_paladin", null], ["srd-5e_class_warlock", null]], ["[[srd-5e_spell_command]]", "[[srd-5e_spell_hex]]"], 16));
    const of = (slug: string) => character.spells.find((s) => s.slug === slug)?.classSlug;
    expect(of("srd-5e_spell_command")).toBe("srd-5e_class_paladin");
    expect(of("srd-5e_spell_hex")).toBe("srd-5e_class_paladin");
  });
  it("each derived spellcasting class carries its profile's spellList, the add drawer's input to the same rule", () => {
    const { character } = new PCResolver(X).resolve(pc([["x_class_fighter", "x_subclass_eldritch-knight"], ["x_class_sorcerer", null]], []));
    expect(recalc(character, X).spellcastingClasses.map((c) => [c.classSlug, c.spellList])).toEqual([["x_class_fighter", null], ["x_class_sorcerer", "sorcerer"]]);
  });
  it("the W-A2 shape on 2024 data: a Paladin-first Paladin / Warlock still sends Armor of Agathys to the Warlock (control)", () => {
    const reg = buildMockRegistry([
      cls("players-handbook-2024_class_paladin", "Paladin", { caster_type: "artificer", ability: "cha", preparation: "prepared", spell_list: "paladin" }),
      cls("players-handbook-2024_class_warlock", "Warlock", { caster_type: "pact", ability: "cha", preparation: "known", spell_list: "warlock" }),
      spell("players-handbook-2024_spell_armor-of-agathys", "Armor of Agathys", ["warlock"]),
      spell("players-handbook-2024_spell_bless", "Bless", ["cleric", "paladin"]),
    ]);
    const { character } = new PCResolver(reg).resolve(pc([["players-handbook-2024_class_paladin", null], ["players-handbook-2024_class_warlock", null]],
      ["[[players-handbook-2024_spell_armor-of-agathys]]", "[[players-handbook-2024_spell_bless]]"], 16));
    const of = (slug: string) => character.spells.find((s) => s.slug === slug)?.classSlug;
    expect(of("players-handbook-2024_spell_armor-of-agathys")).toBe("players-handbook-2024_class_warlock");
    expect(of("players-handbook-2024_spell_bless")).toBe("players-handbook-2024_class_paladin");
  });
  it("(ii) walks the registry's spells at most once per registry, only when a move is in question, and follows a registry that grows", () => {
    const reg = srd5();
    const search = vi.spyOn(reg, "search");
    const spellWalks = () => search.mock.calls.filter((c) => c[1] === "spell").length;
    const pw = pc([["srd-5e_class_paladin", null], ["srd-5e_class_warlock", null]], ["[[srd-5e_spell_command]]", "[[srd-5e_spell_hex]]"], 16);
    new PCResolver(reg).resolve(pw);
    new PCResolver(reg).resolve(pw);
    expect(spellWalks()).toBe(1);
    reg.register({ slug: "srd-5e_spell_divine-favor", name: "Divine Favor", entityType: "spell", filePath: "mock/divine-favor.md",
      data: { name: "Divine Favor", level: 1, classes: ["paladin"] }, compendium: "Mock", readonly: false, homebrew: false });
    const { character } = new PCResolver(reg).resolve(pw);
    expect(character.spells.find((s) => s.slug === "srd-5e_spell_command")?.classSlug).toBe("srd-5e_class_warlock");
    expect(character.spells.find((s) => s.slug === "srd-5e_spell_hex")?.classSlug).toBe("srd-5e_class_warlock");
    expect(spellWalks()).toBe(2);
    // No move in question, no walk: a single caster, and a spell the first caster's own list names, on a fresh registry.
    const fresh = srd5();
    const freshSearch = vi.spyOn(fresh, "search");
    new PCResolver(fresh).resolve(pc([["srd-5e_class_cleric", null]], ["[[srd-5e_spell_bless]]", "[[srd-5e_spell_command]]"]));
    new PCResolver(fresh).resolve(pc([["srd-5e_class_cleric", null], ["srd-5e_class_warlock", null]], ["[[srd-5e_spell_bless]]", "[[srd-5e_spell_command]]"]));
    expect(freshSearch.mock.calls.filter((c) => c[1] === "spell").length).toBe(0);
  });
});
