import { describe, it, expect } from "vitest";
import { recalc } from "../src/pc/pc.recalc";
import type { Ability, ResolvedCharacter, ResolvedClass, ResolvedSpell } from "../src/pc/pc.types";

const SC: Record<string, { caster_type: string; ability: string; preparation: string }> = {
  wizard:  { caster_type: "full", ability: "int", preparation: "prepared" },
  cleric:  { caster_type: "full", ability: "wis", preparation: "prepared" },
  warlock: { caster_type: "pact", ability: "cha", preparation: "known" },
};
function mkCaster(slug: string, level: number, extra: Record<string, unknown> = {}): ResolvedClass {
  const sc = SC[slug] ? { ...SC[slug], spell_list: slug } : null;
  return {
    entity: { slug, name: slug, edition: "2014", hit_die: "d6", primary_abilities: [], saving_throws: [], features_by_level: {}, table: {}, spellcasting: sc, ...extra } as never,
    level, subclass: null, choices: {},
  };
}
function resolvedWith(classes: ResolvedClass[], scores: Record<string, number>): ResolvedCharacter {
  const def = {
    name: "T", edition: "2014" as const, race: null, subrace: null, background: null,
    class: classes.map((c) => ({ name: c.entity!.slug, level: c.level, subclass: null, choices: {} })),
    abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10, ...scores },
    ability_method: "manual" as const, skills: { proficient: [], expertise: [] },
    spells: { known: [], overrides: [] }, equipment: [], overrides: {},
    state: { hp: { current: 1, max: 1, temp: 0 }, hit_dice: {}, spell_slots: {}, concentration: null, conditions: [], exhaustion: 0, inspiration: 0, feature_uses: {} },
  };
  return { definition: def as never, race: null, classes, background: null, feats: [], totalLevel: classes.reduce((s, c) => s + c.level, 0), features: [], spells: [], state: def.state as never };
}

describe("recalc — spellcasting", () => {
  it("computes per-class DC/attack for a single Wizard 5 (INT 16)", () => {
    const d = recalc(resolvedWith([mkCaster("wizard", 5)], { int: 16 }));
    expect(d.spellcastingClasses).toHaveLength(1);
    const w = d.spellcastingClasses[0];
    expect(w.ability).toBe("int");
    expect(w.saveDC).toBe(8 + 3 + 3);       // prof 3 (lvl5), INT mod +3
    expect(w.attackBonus).toBe(3 + 3);
    expect(d.derivedSpellSlots).toEqual({ 1: 4, 2: 3, 3: 2 });
    expect(d.pactMagic).toBeNull();
  });

  it("multiclass: Cleric 3 (WIS 14) / Wizard 2 (INT 16) → two entries + combined slots", () => {
    const d = recalc(resolvedWith([mkCaster("cleric", 3), mkCaster("wizard", 2)], { wis: 14, int: 16 }));
    expect(d.spellcastingClasses.map((s) => s.classSlug).sort()).toEqual(["cleric", "wizard"]);
    expect(d.derivedSpellSlots).toEqual({ 1: 4, 2: 3, 3: 2 }); // caster level 5
  });

  it("warlock produces pactMagic and no standard slots", () => {
    const d = recalc(resolvedWith([mkCaster("warlock", 5)], { cha: 16 }));
    expect(d.pactMagic).toEqual({ level: 3, total: 2 });
    expect(d.derivedSpellSlots).toEqual({});
  });

  it("non-caster: empty spellcastingClasses", () => {
    const d = recalc(resolvedWith([mkCaster("fighter", 5)], {}));
    expect(d.spellcastingClasses).toEqual([]);
    expect(d.spellcasting).toBeNull();
  });
});

// A feat-granted spell (Magic Initiate shape) carries its OWN spellcasting
// ability and is NOT owned by a class (classSlug null). Its DC/attack must be
// computed from that ability even on a NON-caster (spellcasting null / empty
// spellcastingClasses), surfaced via the additive `abilitySpellcasting` map.
function featSpell(ability: Ability, level = 1): ResolvedSpell {
  return {
    entity: { name: "FX Spell", level } as never,
    slug: `fx-${ability}-l${level}`, classSlug: null, source: "feat",
    prepared: true, alwaysPrepared: true, ability,
  };
}

describe("recalc · feat-spell own-ability DC/attack (non-caster safe)", () => {
  it("computes abilitySpellcasting for a non-caster Fighter with a feat spell (ability wis), spellcasting null", () => {
    const r = resolvedWith([mkCaster("fighter", 5)], { wis: 16 }); // fighter is not a caster
    r.spells = [featSpell("wis")];
    const d = recalc(r);
    // The class caster subsystem stays empty: a feat grants casting a class does not.
    expect(d.spellcasting).toBeNull();
    expect(d.spellcastingClasses).toEqual([]);
    // Own-ability DC/attack: prof 3 (lvl 5), WIS 16 -> mod +3.
    expect(d.abilitySpellcasting.wis).toEqual({ saveDC: 8 + 3 + 3, attackBonus: 3 + 3 });
    // Not null / not 0.
    expect(d.abilitySpellcasting.wis?.saveDC).toBe(14);
    expect(d.abilitySpellcasting.wis?.attackBonus).toBe(6);
  });

  it("populates every distinct feat-spell ability and leaves unused abilities absent", () => {
    const r = resolvedWith([mkCaster("fighter", 5)], { wis: 16, int: 12 });
    r.spells = [featSpell("wis", 0), featSpell("int", 1)];
    const d = recalc(r);
    expect(d.abilitySpellcasting.wis).toEqual({ saveDC: 8 + 3 + 3, attackBonus: 3 + 3 });
    expect(d.abilitySpellcasting.int).toEqual({ saveDC: 8 + 3 + 1, attackBonus: 3 + 1 });
    expect(d.abilitySpellcasting.cha).toBeUndefined();
  });

  it("adds abilitySpellcasting alongside a real class caster without changing spellcasting/spellcastingClasses", () => {
    const r = resolvedWith([mkCaster("wizard", 5)], { int: 16, wis: 14 });
    r.spells = [featSpell("wis")];
    const d = recalc(r);
    expect(d.spellcasting?.saveDC).toBe(8 + 3 + 3); // INT 16 wizard, unchanged
    expect(d.spellcastingClasses).toHaveLength(1);
    expect(d.abilitySpellcasting.wis).toEqual({ saveDC: 8 + 3 + 2, attackBonus: 3 + 2 }); // WIS 14 -> +2
  });

  it("no feat spells -> abilitySpellcasting is an empty object (not undefined)", () => {
    const d = recalc(resolvedWith([mkCaster("fighter", 5)], {}));
    expect(d.abilitySpellcasting).toEqual({});
  });
});
