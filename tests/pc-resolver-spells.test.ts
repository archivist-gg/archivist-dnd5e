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
