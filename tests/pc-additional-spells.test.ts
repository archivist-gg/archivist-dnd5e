/**
 * R4-G3b §5 · `additional_spells` granted at RESOLVE time.
 *
 * Provenance: every case in this file was RED before Task 6 (dnd5e base feb6c50) for one and the same
 * reason: `src/pc/pc.additional-spells.ts` and `src/race/race.structural.ts` did not exist, so vitest
 * failed the whole file at module load ("Failed to load url ../src/pc/pc.additional-spells"). The
 * per-case `RED FIRST` notes below therefore record which MUTANT each first assertion discriminates,
 * not a value the pre-Task-6 tree produced.
 *
 * Fixtures are RAW registry entities handed to a real `EntityRegistry` (spec §5.4): nothing here is
 * parsed, exactly as the resolver reads them.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { buildMockRegistry } from "./mock-entity-registry";
import { normalizeSpellRef, resolveSpellByName, buildSpellNameIndex, collectAdditionalSpells } from "../src/pc/pc.additional-spells";
import { RACE_STRUCTURAL_PSEUDO } from "../src/race/race.structural";
import { dedupeResolvedSpells } from "../src/pc/pc.resolver";
import { __resetWarnOnceForTests } from "../src/dnd/warn-once";
import type { ResolvedClass, ResolvedSpell } from "../src/pc/pc.types";

const spell = (slug: string, name: string, level: number, edition?: string) =>
  ({ slug, entityType: "spell", name, data: { name, level, school: "evocation", ...(edition ? { edition } : {}) } });
const REG = buildMockRegistry([
  spell("players-handbook-2024_spell_fireball", "Fireball", 3, "2024"), spell("players-handbook-2014_spell_fireball", "Fireball", 3, "2014"),
  spell("srd-2024_spell_fireball", "Fireball", 3, "2024"), spell("srd-5e_spell_fireball", "Fireball", 3, "2014"),
  spell("elemental-evil-players-companion_spell_levitate", "Levitate", 2, "2014"),
  spell("players-handbook-2024_spell_light", "Light", 0, "2024"), spell("srd-2024_spell_druidcraft", "Druidcraft", 0, "2024"),
  spell("srd-5e_spell_thaumaturgy", "Thaumaturgy", 0, "2014"),
  spell("srd-2024_spell_blindness-deafness", "Blindness/Deafness", 2, "2024"), spell("players-handbook-2014_spell_blindnessdeafness", "Blindness/Deafness", 2, "2014"),
  spell("players-handbook-2024_spell_magic-missile", "Magic Missile", 1, "2024"), spell("players-handbook-2024_spell_mirror-image", "Mirror Image", 2, "2024"),
  spell("players-handbook-2024_spell_bless", "Bless", 1, "2024"), spell("players-handbook-2014_spell_bless", "Bless", 1, "2014"),
  spell("players-handbook-2024_spell_mage-hand", "Mage Hand", 0, "2024"),
  spell("zz-homebrew_spell_fireball", "Fireball", 3),   // edition-less, sorts LAST: the M-17b substitute (Gate 2 I-4); the absent-edition case still resolves the PHB 2014 copy
]);
const cls = (slug: string, level: number, additional_spells?: unknown, subclass?: unknown): ResolvedClass =>
  ({ entity: { slug, name: slug, edition: "2024", ...(additional_spells ? { additional_spells } : {}) }, level, subclass: subclass ?? null, choices: {} } as never);
const collect = (over: Partial<Parameters<typeof collectAdditionalSpells>[0]>) => collectAdditionalSpells({
  race: null, feats: [], classes: [], totalLevel: 1, ownAbility: null, alreadyCollected: [], entities: REG, warnings: [], ...over });
const slugs = (rows: ResolvedSpell[]) => rows.map((r) => r.slug);
beforeEach(() => __resetWarnOnceForTests());

describe("normalizeSpellRef (R4-G3b §5.2.2)", () => {
  it.each([
    ["levitate", "levitate"], ["fog cloud|xphb", "fog-cloud"], ["light|xphb#c", "light"], ["minor illusion#c", "minor-illusion"],
    ["[[SRD 2024/Spells/Druidcraft|xphb|druidcraft|xphb]]", "druidcraft"], ["[[SRD 5e/Spells/Thaumaturgy|thaumaturgy]]", "thaumaturgy"],
    ["blindness/deafness", "blindnessdeafness"],   // a bare NAME keeps its slash (Gate 0 B1) · this row goes RED under an unconditional path tail
    ["fire shield|", "fire-shield"],
  ])("%s → %s", (ref, expected) => expect(normalizeSpellRef(ref)).toBe(expected));
  it("returns null for a non-string ({choose} / {all} objects)", () => {
    expect(normalizeSpellRef({ choose: "level=0|class=Druid" })).toBeNull(); expect(normalizeSpellRef({ all: "x" })).toBeNull();
  });
});

describe("resolveSpellByName (R4-G3b §5.2.3)", () => {
  const index = buildSpellNameIndex(REG);
  const res = (nameSlug: string, carrierSlug: string, carrierEdition?: string, alreadyCollected: ResolvedSpell[] = []) =>
    resolveSpellByName({ entities: REG, index, nameSlug, carrierSlug, carrierEdition, alreadyCollected });
  it("(a) the carrier's own compendium wins exactly", () => {
    expect(res("fireball", "players-handbook-2024_subclass_x", "2024")?.slug).toBe("players-handbook-2024_spell_fireball");
  });
  it("(b) a carrier with no Spells folder resolves by name through the SAME-EDITION step, then lexicographic", () => {
    expect(res("fireball", "eberron-forge-of-the-artificer_subclass_x", "2024")?.slug).toBe("players-handbook-2024_spell_fireball");   // 2024 pool: phb-2024 < srd-2024
    expect(res("fireball", "eberron-forge-of-the-artificer_subclass_x", "2014")?.slug).toBe("players-handbook-2014_spell_fireball");
  });
  it("(b) the index is keyed on slugify(name), so the bundle's slash spell resolves from a bundle carrier (Gate 0 B2)", () => {
    expect(res("blindnessdeafness", "srd-2024_subclass_circle-of-spores", "2024")?.slug).toBe("srd-2024_spell_blindness-deafness");   // goes RED under a slug-tail index; asserted on the EXACT SRD slug: with the PHB copy also registered the mutant flips the winner to PHB, a presence-only assertion would stay green (Gate 1 A D row 15)
  });
  it("(0) the character's own copy wins whatever its compendium (Gate 0 I4)", () => {
    const own = { entity: REG.getByTypeAndSlug("spell", "players-handbook-2014_spell_bless")!.data, slug: "players-handbook-2014_spell_bless", classSlug: "cleric", source: "class", prepared: false, alwaysPrepared: false, persisted: true } as unknown as ResolvedSpell;
    expect(res("bless", "players-handbook-2024_subclass_life-domain", "2024", [own])?.slug).toBe("players-handbook-2014_spell_bless");
  });
  it("(c) a MISS returns null and warns once, never throws", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(res("no-such-spell", "x_race_y")).toBeNull(); expect(res("no-such-spell", "x_race_y")).toBeNull();
    expect(spy).toHaveBeenCalledTimes(1); spy.mockRestore();
  });
});

describe("collectAdditionalSpells (R4-G3b §5.2.1)", () => {
  it("race root, bare ref, CHARACTER level, literal ability, alwaysPrepared on the `known` bucket", () => {
    const rows = collect({ race: { slug: "elemental-evil-players-companion_race_air-genasi", edition: "2014", traits: [], additional_spells: [{ ability: "con", known: { "1": ["levitate"] } }] } as never });
    expect(slugs(rows)).toEqual(["elemental-evil-players-companion_spell_levitate"]);
    expect(rows[0]).toMatchObject({ source: "race", classSlug: null, prepared: true, alwaysPrepared: true, ability: "con" });
  });
  it("a granted row carries no persisted flag (M-19)", () => {
    const rows = collect({ race: { slug: "elemental-evil-players-companion_race_air-genasi", edition: "2014", traits: [], additional_spells: [{ ability: "con", known: { "1": ["levitate"] } }] } as never });
    expect(rows[0].persisted).toBeUndefined();   // FIRST · goes RED if the reader stamps `persisted`
    expect(slugs(rows)).toEqual(["elemental-evil-players-companion_spell_levitate"]);
  });
  it("subclass root, CLASS level comparand (Armorer 3 / Wizard 3: the level-5 list is ABSENT)", () => {
    const armorer = { slug: "eberron-forge-of-the-artificer_subclass_armorer-2024-efa", edition: "2024", additional_spells: [{ prepared: { "3": ["magic missile|xphb"], "5": ["mirror image|xphb"] } }] };
    const rows = collect({ classes: [cls("eberron-forge-of-the-artificer_class_artificer", 3, undefined, armorer), cls("players-handbook-2024_class_wizard", 3)], totalLevel: 6 });
    expect(slugs(rows)).not.toContain("players-handbook-2024_spell_mirror-image");   // FIRST · goes RED if the comparand is totalLevel
    expect(slugs(rows)).toContain("players-handbook-2024_spell_magic-missile");
    expect(rows[0]).toMatchObject({ source: "class", classSlug: "eberron-forge-of-the-artificer_class_artificer", alwaysPrepared: true });
  });
  it("the `_` sentinel is always", () => {
    const rows = collect({ feats: [{ slug: "x_feat_y", additional_spells: [{ known: { _: ["light|xphb#c"] } }] } as never], totalLevel: 1 });
    expect(slugs(rows)).toEqual(["players-handbook-2024_spell_light"]);
  });
  it("dual arity: the bundle's BARE OBJECT race carrier folds", () => {
    const rows = collect({ race: { slug: "srd-5e_race_tiefling", edition: "2014", traits: [], additional_spells: { known: { "1": ["[[SRD 5e/Spells/Thaumaturgy|thaumaturgy]]"] } } } as never });
    expect(slugs(rows)).toEqual(["srd-5e_spell_thaumaturgy"]);
  });
  it("the sibling gate: >1 entry skips the whole carrier and warns once (Circle of the Land / Arcane Archer shape)", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const archer = { slug: "xge_subclass_arcane-archer", edition: "2024", additional_spells: [{ known: { "3": ["light|xphb#c"] } }, { known: { "3": ["druidcraft#c"] } }] };
    const rows = collect({ classes: [cls("players-handbook-2024_class_fighter", 3, undefined, archer)], totalLevel: 3 });
    expect(rows).toHaveLength(0);                                            // FIRST · goes RED under a distinct-name rule (the carrier folds a cantrip)
    expect(spy).toHaveBeenCalledTimes(1); spy.mockRestore();
  });
  it("a multi-entry carrier with NO in-slice leaf is skipped SILENTLY", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    collect({ race: { slug: "x_race_astral-elf", traits: [], additional_spells: [{ ability: { choose: ["int"] }, known: { "1": ["light#c"] } }, { ability: { choose: ["wis"] }, known: { "1": ["light#c"] } }] } as never });
    expect(spy).not.toHaveBeenCalled(); spy.mockRestore();
  });
  it("one-level descent: a USAGE OBJECT at a level key is skipped whole (The Fathomless shape; Enclave Magic is `{choose}`-gated and cannot discriminate · Gate 1 A B2)", () => {
    const fathomless = { slug: "tce_subclass_the-fathomless", edition: "2024", additional_spells: [{ known: { "10": { daily: { "1": ["bless|xphb"] } } } }] };
    const rows = collect({ classes: [cls("players-handbook-2024_class_warlock", 10, undefined, fathomless)], totalLevel: 10 });
    expect(rows).toHaveLength(0);                                            // FIRST · goes RED if the reader recurses
  });
  it("Q5(ii) absent-edition fallback: a carrier without `edition` falls to the lexicographic tail (Gate 1 B M-7)", () => {
    const rows = collect({ feats: [{ slug: "x_feat_no-edition", additional_spells: [{ known: { _: ["fireball"] } }] } as never] });
    expect(slugs(rows)).toEqual(["players-handbook-2014_spell_fireball"]);   // (i) no same-prefix candidate → (ii) SKIPPED → (iii) lowest full slug
  });
  it("ability: \"inherit\" maps to the character's own spellcasting ability, never the literal", () => {
    const rows = collect({ feats: [{ slug: "x_feat_telekinetic", additional_spells: [{ ability: "inherit", known: { _: ["mage hand|xphb#c"] } }] } as never], ownAbility: "int" });
    expect(rows[0].ability).toBe("int");
    expect(collect({ feats: [{ slug: "x_feat_telekinetic", additional_spells: [{ ability: "inherit", known: { _: ["mage hand|xphb#c"] } }] } as never], ownAbility: null })[0].ability).toBeUndefined();
  });
  it("ability: {choose} skips the entry", () => {
    expect(collect({ feats: [{ slug: "x_feat_spellfire-spark", additional_spells: [{ ability: { choose: ["int", "wis", "cha"] }, known: { _: ["light|xphb#c"] } }] } as never] })).toHaveLength(0);
  });
  it("the race gate walks traits[]: a lineage select-inline on a TRAIT gates the race (M-21c)", () => {
    const elf = { slug: "srd-2024_race_elf", edition: "2024", traits: [{ name: "Elven Lineage", choices: [{ kind: "select-inline", id: "elven-lineage", options: [] }] }], additional_spells: { known: { "1": ["[[SRD 2024/Spells/Druidcraft|xphb|druidcraft|xphb]]"] } } };
    expect(collect({ race: elf as never })).toHaveLength(0);                 // FIRST · no Druidcraft on a Drow
  });
  it("the race gate EXEMPTS the structural set: a `size` choice does not gate (M-21a)", () => {
    const aasimar = { slug: "players-handbook-2024_race_aasimar", edition: "2024", traits: [{ name: "Size", choices: [{ kind: "select-inline", id: "size", options: [] }] }], additional_spells: [{ ability: "cha", known: { "1": ["light|xphb#c"] } }] };
    expect(slugs(collect({ race: aasimar as never }))).toEqual(["players-handbook-2024_spell_light"]);   // FIRST
  });
  it("the race gate walks race.choices[] too: a TOP-LEVEL select-inline gates the race (M-21b)", () => {
    const gith = { slug: "x_race_githyanki", traits: [], choices: [{ kind: "select-inline", id: "skill-tool-lang", options: [] }], additional_spells: [{ known: { "1": ["light#c"] } }] };
    expect(collect({ race: gith as never })).toHaveLength(0);                // FIRST · a TOP-LEVEL race.choices gate
  });
  it("RACE_STRUCTURAL_PSEUDO is the shared three-member set", () => expect([...RACE_STRUCTURAL_PSEUDO].sort()).toEqual(["darkvision", "size", "speed"]));
});

describe("the spell-name index builds LAZILY (R4-G3b final wave)", () => {
  // `buildSpellNameIndex` is a whole-bucket `search` plus a per-entity slugify.
  // It used to run once per `resolve()` before any carrier was known to have
  // entries, so every character without an `additional_spells` carrier paid for a
  // scan whose result was thrown away. `REG.search` is the only route into the
  // bucket (`resolveSpellByName`'s steps (0) and (a) use `alreadyCollected` and
  // `getByTypeAndSlug`, neither of which calls it), so the spy counts index
  // builds exactly.
  //
  // ⚠️ Describe-scoped restore. A case that fails BEFORE its own `mockRestore()`
  // leaks the spy into the next one (`vi.spyOn` on an already-spied method hands
  // back the SAME spy, calls and all), which turned the second case below into a
  // false second RED (2 calls) while the first was still failing. Measured
  // 2026-09-04.
  afterEach(() => { vi.restoreAllMocks(); });

  it("a collect with NO carriers never scans the spell bucket", () => {
    const spy = vi.spyOn(REG, "search");
    const rows = collect({});
    // RED FIRST before the final wave (01a79e1): 1 · the index was built at the
    // top of `collectAdditionalSpells`, unconditionally.
    expect(spy).toHaveBeenCalledTimes(0);
    expect(rows).toEqual([]);
    spy.mockRestore();
  });

  it("a collect with one in-slice leaf scans it exactly once, and still folds the leaf", () => {
    const spy = vi.spyOn(REG, "search");
    const rows = collect({ feats: [{ slug: "x_feat_y", additional_spells: [{ known: { _: ["levitate"] } }] } as never] });
    expect(spy).toHaveBeenCalledTimes(1);   // memoised: the second leaf would reuse it
    expect(slugs(rows)).toEqual(["elemental-evil-players-companion_spell_levitate"]);
    spy.mockRestore();
  });
});

describe("dedupeResolvedSpells OR-merge (R4-G3b §5.2.8) + persisted", () => {
  const bless = REG.getByTypeAndSlug("spell", "players-handbook-2014_spell_bless")!.data as never;
  it("a persisted copy that loses the flag gains alwaysPrepared from the granted copy (branch i)", () => {
    const rows = dedupeResolvedSpells([
      { entity: bless, slug: "players-handbook-2014_spell_bless", classSlug: "cleric", source: "class", prepared: false, alwaysPrepared: false, persisted: true },
      { entity: bless, slug: "players-handbook-2014_spell_bless", classSlug: "cleric", source: "class", prepared: true, alwaysPrepared: true },
    ]);
    expect(rows[0]).toMatchObject({ alwaysPrepared: true, prepared: true, persisted: true, classSlug: "cleric" });   // FIRST · the merge assertion; the length below stays green under M-20a
    expect(rows).toHaveLength(1);
  });
  // Branch (ii)'s two mutants get an `it()` each so the RED assertion is the FIRST expect of both
  // (spec invariant 6). The persisted row is the FEAT one, because `addKnownSpell` persists a `source`
  // and a hand-added spell can therefore be `source: "feat"` (pc.edit-state.ts); branch (ii) drops that
  // row for the class grant, so both flags have to be carried across or the sheet loses a control.
  const displacedFeatCopy = () => dedupeResolvedSpells([
    { entity: bless, slug: "players-handbook-2014_spell_bless", classSlug: null, source: "feat", prepared: true, alwaysPrepared: true, ability: "wis", persisted: true },
    { entity: bless, slug: "players-handbook-2014_spell_bless", classSlug: "cleric", source: "class", prepared: false, alwaysPrepared: false },
  ]);
  it("a feat copy displaced by a class copy keeps the persisted flag (branch ii, M-20c)", () => {
    const rows = displacedFeatCopy();
    expect(rows[0].persisted).toBe(true);   // RED FIRST before fix 1b (dnd5e 1320613): read `undefined`, the `{ ...s }` winner never carried it
    expect(rows[0].source).toBe("class");
  });
  it("a feat copy displaced by a class copy keeps alwaysPrepared (branch ii, M-20b)", () => {
    const rows = displacedFeatCopy();
    expect(rows[0]).toMatchObject({ alwaysPrepared: true, prepared: true });   // FIRST
    expect(rows[0].source).toBe("class");
  });
});
