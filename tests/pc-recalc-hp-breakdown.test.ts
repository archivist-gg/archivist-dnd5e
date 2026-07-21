import { describe, it, expect } from "vitest";
import { recalc, hitDiceAverageSum, hpLevelCount, multiclassMaxHP } from "../src/pc/pc.recalc";
import type { ResolvedCharacter, ResolvedClass } from "../src/pc/pc.types";

// ─────── helpers (copied from tests/pc-recalc.test.ts) ───────

function mkClass(slug: string, die: string, level: number): ResolvedClass {
  return {
    entity: {
      slug,
      name: slug,
      edition: "2014",
      hit_die: die,
      primary_abilities: ["str"],
      saving_throws: [],
      features_by_level: {},
    } as never,
    level,
    subclass: null,
    choices: {},
  };
}

function emptyResolved(): ResolvedCharacter {
  return {
    definition: {
      name: "T",
      edition: "2014",
      race: null,
      subrace: null,
      background: null,
      class: [],
      abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
      ability_method: "manual",
      skills: { proficient: [], expertise: [] },
      spells: { known: [], overrides: [] },
      equipment: [],
      overrides: {},
      state: { hp: { current: 1, max: 1, temp: 0 }, hit_dice: {}, spell_slots: {}, concentration: null, conditions: [] },
    } as never,
    race: null,
    classes: [],
    background: null,
    feats: [],
    totalLevel: 0,
    features: [],
    spells: [],
    state: { hp: { current: 1, max: 1, temp: 0 }, hit_dice: {}, spell_slots: {}, concentration: null, conditions: [] } as never,
  };
}

function withClass(c: ResolvedClass): ResolvedCharacter {
  const r = emptyResolved();
  r.classes = [c];
  return r;
}

function withClasses(cs: ResolvedClass[]): ResolvedCharacter {
  const r = emptyResolved();
  r.classes = cs;
  return r;
}

describe("recalc: HPBreakdown (P5 T4)", () => {
  it("1. unset rolled/modifier: hp.max matches pre-phase multiclassMaxHP + level-bonus math; average dice source", () => {
    const rogue = mkClass("rogue", "d8", 5);
    const fighter = mkClass("fighter", "d10", 3);
    const r = withClasses([rogue, fighter]);
    r.definition.abilities = { str: 10, dex: 14, con: 14, int: 10, wis: 12, cha: 8 }; // CON +2
    const d = recalc(r);

    // Pre-phase behavior, computed inline (byte-identity anchor):
    const expectedMax = multiclassMaxHP([rogue, fighter], 2) + 0 /* hp_per_level_bonus */ * 8 /* totalLevel */;
    expect(expectedMax).toBe(62);
    expect(d.hp.max).toBe(62);

    const b = d.hpBreakdown;
    expect(b.diceSum).toBe(hitDiceAverageSum([rogue, fighter])); // 46
    expect(b.diceSource).toBe("average");
    expect(b.averageDiceSum).toBe(46);
    expect(b.conMod).toBe(2);
    expect(b.conLevels).toBe(hpLevelCount([rogue, fighter])); // 8
    expect(b.clampApplied).toBe(false);
    expect(b.perLevelTerms).toEqual([]);
    expect(b.modifier).toBeNull();
    expect(b.exhaustionMultiplier).toBe(1);
    expect(b.exhaustionLevel).toBe(0);
    expect(b.derivedMax).toBe(62);
    expect(b.override).toBeNull();
    expect(b.final).toBe(62);
    expect(b.final).toBe(d.hp.max);
  });

  it("2. rolled=62 on a d10 x11 CON+2 fixture: hp.max 84; diceSource rolled; averageDiceSum 70", () => {
    const r = withClass(mkClass("fighter", "d10", 11));
    r.definition.abilities = { str: 10, dex: 10, con: 14, int: 10, wis: 10, cha: 10 }; // CON +2
    r.definition.overrides = { hp: { rolled: 62 } };
    const d = recalc(r);

    expect(d.hp.max).toBe(84);

    const b = d.hpBreakdown;
    expect(b.diceSum).toBe(62);
    expect(b.diceSource).toBe("rolled");
    expect(b.averageDiceSum).toBe(70);
    expect(b.conMod).toBe(2);
    expect(b.conLevels).toBe(11);
    expect(b.clampApplied).toBe(false);
    expect(b.modifier).toBeNull();
    expect(b.derivedMax).toBe(84);
    expect(b.override).toBeNull();
    expect(b.final).toBe(84);
  });

  it("3. modifier -5 stacked on rolled 62 (same d10 x11 CON+2 fixture): hp.max 79; breakdown.modifier -5", () => {
    const r = withClass(mkClass("fighter", "d10", 11));
    r.definition.abilities = { str: 10, dex: 10, con: 14, int: 10, wis: 10, cha: 10 };
    r.definition.overrides = { hp: { rolled: 62, modifier: -5 } };
    const d = recalc(r);

    expect(d.hp.max).toBe(79);

    const b = d.hpBreakdown;
    expect(b.modifier).toBe(-5);
    expect(b.final).toBe(79);
    expect(b.final).toBe(d.hp.max);
  });

  it("4. rolled 62 + modifier -5 compose: diceSum + conMod*conLevels + modifier = 62+22-5 = 79", () => {
    const r = withClass(mkClass("fighter", "d10", 11));
    r.definition.abilities = { str: 10, dex: 10, con: 14, int: 10, wis: 10, cha: 10 };
    r.definition.overrides = { hp: { rolled: 62, modifier: -5 } };
    const d = recalc(r);

    const b = d.hpBreakdown;
    expect(b.diceSum).toBe(62);
    expect(b.conMod * b.conLevels).toBe(22);
    expect(b.modifier).toBe(-5);
    expect(b.diceSum + b.conMod * b.conLevels + (b.modifier ?? 0)).toBe(79);
    expect(b.derivedMax).toBe(79);
    expect(b.final).toBe(79);
    expect(d.hp.max).toBe(79);
  });

  it("5. override 45 beats rolled+modifier: hp.max 45; breakdown.override 45; derivedMax stays the computed 79", () => {
    const r = withClass(mkClass("fighter", "d10", 11));
    r.definition.abilities = { str: 10, dex: 10, con: 14, int: 10, wis: 10, cha: 10 };
    r.definition.overrides = { hp: { rolled: 62, modifier: -5, max: 45 } };
    const d = recalc(r);

    expect(d.hp.max).toBe(45);

    const b = d.hpBreakdown;
    expect(b.override).toBe(45);
    expect(b.final).toBe(45);
    expect(b.derivedMax).toBe(79);
  });

  it("6. exhaustion 4 fixture: derivedMax floors 43*0.5=21.5→21; exhaustionMultiplier 0.5; exhaustionLevel 4", () => {
    const r = withClass(mkClass("rogue", "d8", 5));
    r.definition.abilities = { str: 10, dex: 10, con: 16, int: 10, wis: 10, cha: 10 }; // CON +3
    r.state.exhaustion = 4;
    const d = recalc(r);

    expect(d.hp.max).toBe(21);

    const b = d.hpBreakdown;
    expect(b.exhaustionMultiplier).toBe(0.5);
    expect(b.exhaustionLevel).toBe(4);
    expect(b.derivedMax).toBe(21);
    expect(b.final).toBe(21);
    expect(b.override).toBeNull();
  });

  it("7. class-less draft, keys unset: hp.max 1 (>=1 clamp); clampApplied true", () => {
    const r = withClasses([]);
    const d = recalc(r);

    expect(d.hp.max).toBe(1);

    const b = d.hpBreakdown;
    expect(b.diceSum).toBe(0);
    expect(b.conLevels).toBe(0);
    expect(b.clampApplied).toBe(true);
    expect(b.derivedMax).toBe(1);
    expect(b.final).toBe(1);
  });

  it("8. class-less draft, rolled=40: hp.max 40; conLevels 0; clampApplied false", () => {
    const r = withClasses([]);
    r.definition.overrides = { hp: { rolled: 40 } };
    const d = recalc(r);

    expect(d.hp.max).toBe(40);

    const b = d.hpBreakdown;
    expect(b.diceSum).toBe(40);
    expect(b.diceSource).toBe("rolled");
    expect(b.conLevels).toBe(0);
    expect(b.clampApplied).toBe(false);
    expect(b.derivedMax).toBe(40);
    expect(b.final).toBe(40);
  });

  it("9. large negative modifier floors to 0 (max(0,...); NOT a byte-identity case, new P5 behavior)", () => {
    const r = withClass(mkClass("rogue", "d8", 5));
    // CON +0, no feature bonus: derived dice+con = 28; modifier -1000 → -972 → max(0,...) = 0.
    r.definition.overrides = { hp: { modifier: -1000 } };
    const d = recalc(r);

    expect(d.hp.max).toBe(0);

    const b = d.hpBreakdown;
    expect(b.modifier).toBe(-1000);
    expect(b.derivedMax).toBe(0);
    expect(b.final).toBe(0);
  });

  it("10. hp-per-level buff fixture: perLevelTerms carry label/perLevel/levels/total; sum of totals === hp_per_level_bonus * totalLevel", () => {
    const r = withClass(mkClass("rogue", "d8", 5));
    r.features.push({
      feature: { name: "Toughness", effects: [{ kind: "hp-per-level-bonus", value: 2 }] } as never,
      source: { kind: "race", slug: "test-race" },
    });
    r.features.push({
      feature: { name: "Dwarven Toughness", effects: [{ kind: "hp-per-level-bonus", value: 1 }] } as never,
      source: { kind: "feat", slug: "test-feat" },
    });
    const d = recalc(r);

    // dice+CON = 28 (rogue d8 L5, CON +0); +(2+1)*5 = 15 level-bonus → 43.
    expect(d.hp.max).toBe(43);

    const b = d.hpBreakdown;
    expect(b.perLevelTerms).toEqual([
      { label: "Toughness", perLevel: 2, levels: 5, total: 10 },
      { label: "Dwarven Toughness", perLevel: 1, levels: 5, total: 5 },
    ]);
    const sumOfTotals = b.perLevelTerms.reduce((s, t) => s + t.total, 0);
    expect(sumOfTotals).toBe(15);
    expect(sumOfTotals).toBe((2 + 1) * 5);
    expect(b.derivedMax).toBe(43);
    expect(b.final).toBe(43);
  });
});
