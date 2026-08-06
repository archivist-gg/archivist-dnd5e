import { describe, it, expect } from "vitest";
import { recalc } from "../src/pc/pc.recalc";
import type { ResolvedCharacter, ResolvedClass, ResolvedFeature } from "../src/pc/pc.types";
import type { Character } from "../src/pc/pc.types";
import type { FeatureEffect } from "@archivist-gg/dnd5e/types/feature-effect";
import { buildMockRegistry } from "./mock-entity-registry";
import { STUDDED_LEATHER, CLUB, PLATE, BREASTPLATE, LONGSWORD, BATTLEAXE } from "./equipment-fixtures";
import item2024 from "../src/srd/data/runtime/item.2024.json";
import { isProficientWithArmor, isProficientWithWeapon } from "@archivist-gg/dnd5e/pc/pc.proficiency-query";

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

function effectFeature(effects: FeatureEffect[], name = "Effect Source"): ResolvedFeature {
  return { feature: { name, effects } as never, source: { kind: "race", slug: "test-race" } };
}

function resolvedWith(level: ResolvedClass, effects: FeatureEffect[]): ResolvedCharacter {
  const r = emptyResolved();
  r.classes = [level];
  r.features.push(effectFeature(effects));
  return r;
}

function resolvedWithEquipment(
  effects: FeatureEffect[],
  equipment: Character["equipment"],
): ResolvedCharacter {
  const r = resolvedWith(mkClass("fighter", "d10", 1), effects);
  r.definition.equipment = equipment;
  return r;
}

const registry = () =>
  buildMockRegistry([
    { slug: "studded-leather", entityType: "armor", name: "Studded Leather", data: STUDDED_LEATHER },
  ]);

const registryWithClub = () =>
  buildMockRegistry([
    { slug: "club", entityType: "weapon", name: "Club", data: CLUB },
  ]);

/** Grant simple-weapon proficiency to the (mock) fighter so +prof applies. */
function withSimpleWeaponProficiency(r: ResolvedCharacter): ResolvedCharacter {
  for (const c of r.classes) {
    (c.entity as unknown as { proficiencies?: unknown }).proficiencies = {
      weapons: { categories: ["simple"] },
    };
  }
  return r;
}

describe("recalc — feature effects: initiative / HP / speed / senses", () => {
  it("adds initiative-bonus to derived initiative", () => {
    const d = recalc(resolvedWith(mkClass("rogue", "d8", 5), [{ kind: "initiative-bonus", value: 2 }]));
    expect(d.initiative).toBe(2); // DEX +0 + 2
  });

  it("overrides.initiative wins over feature initiative", () => {
    const r = resolvedWith(mkClass("rogue", "d8", 5), [{ kind: "initiative-bonus", value: 2 }]);
    r.definition.overrides = { initiative: 7 };
    expect(recalc(r).initiative).toBe(7);
  });

  it("adds hp-per-level-bonus × totalLevel to max HP", () => {
    // Rogue d8 L5, CON +0: 8 + 4×5 = 28 base; +1/level × 5 = 33.
    const d = recalc(resolvedWith(mkClass("rogue", "d8", 5), [{ kind: "hp-per-level-bonus", value: 1 }]));
    expect(d.hp.max).toBe(33);
  });

  it("overrides.hp.max wins over feature HP bonus", () => {
    const r = resolvedWith(mkClass("rogue", "d8", 5), [{ kind: "hp-per-level-bonus", value: 1 }]);
    r.definition.overrides = { hp: { max: 50 } };
    expect(recalc(r).hp.max).toBe(50);
  });

  it("adds walk speed-bonus and ignores fly mode", () => {
    const d = recalc(resolvedWith(mkClass("rogue", "d8", 1), [
      { kind: "speed-bonus", mode: "walk", value: 10 },
      { kind: "speed-bonus", mode: "fly", value: 30 },
    ]));
    expect(d.speed).toBe(40); // 30 default + 10
  });

  it("overrides.speed wins over feature speed bonus", () => {
    const r = resolvedWith(mkClass("rogue", "d8", 1), [{ kind: "speed-bonus", mode: "walk", value: 10 }]);
    r.definition.overrides = { speed: 15 };
    expect(recalc(r).speed).toBe(15);
  });

  it("senses.darkvision comes from effects when race has none", () => {
    const d = recalc(resolvedWith(mkClass("rogue", "d8", 1), [{ kind: "sense", type: "darkvision", range: 60 }]));
    expect(d.senses.darkvision).toBe(60);
  });

  it("senses.darkvision takes the max of race vision and effects", () => {
    const r = resolvedWith(mkClass("rogue", "d8", 1), [{ kind: "sense", type: "darkvision", range: 60 }]);
    r.race = { slug: "drow", name: "Drow", speed: { walk: 30 }, vision: { darkvision: 120 } } as never;
    expect(recalc(r).senses.darkvision).toBe(120);
  });

  it("senses.darkvision is 0 with no race vision and no effects", () => {
    const r = emptyResolved();
    r.classes = [mkClass("rogue", "d8", 1)];
    expect(recalc(r).senses.darkvision).toBe(0);
  });

  it("surfaces a non-darkvision sense from effects", () => {
    const d = recalc(resolvedWith(mkClass("rogue", "d8", 1), [{ kind: "sense", type: "truesight", range: 30 }]));
    expect(d.senses.truesight).toBe(30);
    expect(d.senses.darkvision).toBe(0);
  });
});

describe("recalc — feature effects: proficiencies", () => {
  it("proficiency skill effect makes the skill proficient", () => {
    // L5 → prof +3; WIS 10 → mod 0; proficient Perception bonus = 3.
    const d = recalc(resolvedWith(mkClass("rogue", "d8", 5), [
      { kind: "proficiency", proficiency_type: "skill", value: "Perception" },
    ]));
    expect(d.skills.perception.proficiency).toBe("proficient");
    expect(d.skills.perception.bonus).toBe(3);
  });

  it("skill override still wins over a feature skill proficiency", () => {
    const r = resolvedWith(mkClass("rogue", "d8", 5), [
      { kind: "proficiency", proficiency_type: "skill", value: "Perception" },
    ]);
    r.definition.overrides = { skills: { perception: { bonus: 0, proficiency: "none" } } };
    const d = recalc(r);
    expect(d.skills.perception.proficiency).toBe("none");
    expect(d.skills.perception.bonus).toBe(0);
  });

  it("proficiency saving-throw effect marks the save proficient", () => {
    const d = recalc(resolvedWith(mkClass("rogue", "d8", 5), [
      { kind: "proficiency", proficiency_type: "saving-throw", value: "Wisdom" },
    ]));
    expect(d.saves.wis.proficient).toBe(true);
    expect(d.saves.wis.bonus).toBe(3); // mod 0 + prof 3
    expect(d.saves.str.proficient).toBe(false);
  });

  it("proficiency tool and language effects land in the proficiency sets", () => {
    const d = recalc(resolvedWith(mkClass("rogue", "d8", 1), [
      { kind: "proficiency", proficiency_type: "tool", value: "Thieves' Tools" },
      { kind: "proficiency", proficiency_type: "language", value: "Draconic" },
    ]));
    expect(d.proficiencies.tools.specific).toContain("thieves'-tools");
    expect(d.proficiencies.languages).toContain("draconic");
  });

  it("proficiency armor effect (category) lands in proficiencies.armor.categories", () => {
    const d = recalc(resolvedWith(mkClass("rogue", "d8", 1), [
      { kind: "proficiency", proficiency_type: "armor", value: "heavy" },
    ]));
    // Category form, NOT a per-item slug bucket — this is what the matcher reads.
    expect(d.proficiencies.armor.categories).toContain("heavy");
    expect(d.proficiencies.armor.specific).not.toContain("heavy");
  });

  it("armor 'heavy' grant makes the matcher proficient with a heavy entity (and implies medium/light)", () => {
    const d = recalc(resolvedWith(mkClass("rogue", "d8", 1), [
      { kind: "proficiency", proficiency_type: "armor", value: "Heavy" },
    ]));
    // End-to-end through the real matcher: the grant must drive isProficientWithArmor.
    expect(isProficientWithArmor(PLATE, d.proficiencies)).toBe(true);          // heavy
    expect(isProficientWithArmor(BREASTPLATE, d.proficiencies)).toBe(true);    // medium (implied)
    expect(isProficientWithArmor(STUDDED_LEATHER, d.proficiencies)).toBe(true); // light (implied)
  });

  it("proficiency weapon effect (category) lands in proficiencies.weapons.categories", () => {
    const d = recalc(resolvedWith(mkClass("rogue", "d8", 1), [
      { kind: "proficiency", proficiency_type: "weapon", value: "martial" },
    ]));
    expect(d.proficiencies.weapons.categories).toContain("martial");
    expect(d.proficiencies.weapons.specific).not.toContain("martial");
  });

  it("weapon 'martial' grant makes the matcher proficient with a martial weapon entity", () => {
    const d = recalc(resolvedWith(mkClass("rogue", "d8", 1), [
      { kind: "proficiency", proficiency_type: "weapon", value: "Martial" },
    ]));
    expect(isProficientWithWeapon(LONGSWORD, d.proficiencies)).toBe(true); // martial-melee
    expect(isProficientWithWeapon(CLUB, d.proficiencies)).toBe(false);     // simple-melee — not granted
  });
});

describe("recalc — feature effects: speed-bonus set (absolute floor)", () => {
  it("speed-bonus set yields d.speed >= the set value even on a 25-ft race", () => {
    const r = resolvedWith(mkClass("rogue", "d8", 1), [{ kind: "speed-bonus", mode: "walk", set: true, value: 60 }]);
    r.race = { slug: "halfling", name: "Halfling", speed: { walk: 25 } } as never;
    expect(recalc(r).speed).toBe(60);
  });

  it("speed-bonus set does NOT lower a higher race speed (floor only)", () => {
    const r = resolvedWith(mkClass("rogue", "d8", 1), [{ kind: "speed-bonus", mode: "walk", set: true, value: 20 }]);
    r.race = { slug: "human", name: "Human", speed: { walk: 30 } } as never;
    expect(recalc(r).speed).toBe(30);
  });

  it("non-set walk speed-bonus still adds (existing additive behavior unchanged)", () => {
    const d = recalc(resolvedWith(mkClass("rogue", "d8", 1), [{ kind: "speed-bonus", mode: "walk", value: 10 }]));
    expect(d.speed).toBe(40); // 30 default + 10
  });
});

describe("recalc — feature effects: defenses", () => {
  it("appends feature resistances to derived defenses", () => {
    const d = recalc(resolvedWith(mkClass("rogue", "d8", 1), [
      { kind: "resistance", damage_type: "Fire" },
      { kind: "resistance", damage_type: "Cold" },
    ]));
    expect(d.defenses.resistances.map((e) => e.label)).toEqual(["Fire", "Cold"]);
  });

  it("dedupes resistances case-insensitively across manual + feature sources (manual spelling wins)", () => {
    const r = resolvedWith(mkClass("rogue", "d8", 1), [{ kind: "resistance", damage_type: "Fire" }]);
    r.definition.defenses = { resistances: ["fire"], immunities: [], vulnerabilities: [], condition_immunities: [] };
    const d = recalc(r);
    expect(d.defenses.resistances.map((e) => e.label)).toEqual(["fire"]);
  });

  it("applies ungated immune-condition to condition immunities and skips while-gated", () => {
    const d = recalc(resolvedWith(mkClass("rogue", "d8", 1), [
      { kind: "immune-condition", condition: "Charmed" },
      { kind: "immune-condition", condition: "Frightened", while: "while raging" },
    ]));
    expect(d.defenses.condition_immunities.map((e) => e.label)).toEqual(["Charmed"]);
  });

  it("dedupes manual duplicate defense entries (pre-existing concat bug)", () => {
    const r = emptyResolved();
    r.classes = [mkClass("rogue", "d8", 1)];
    r.definition.defenses = { resistances: ["Fire", "fire"], immunities: [], vulnerabilities: [], condition_immunities: [] };
    expect(recalc(r).defenses.resistances.map((e) => e.label)).toEqual(["Fire"]);
  });

  it("labels a value supplied by BOTH the manual list and a grant as origin 'grant'", () => {
    // The merge puts manual FIRST, so a naive first-list-wins would say "manual".
    // The authored spelling is deliberately NON-canonical ("Psychic" vs the granted "psychic"):
    // that is what separates `label` from `value`. With both sides spelled "fire" this test could
    // not tell the two fields apart, and storing the raw string in `value` would survive it.
    const r = resolvedWith(mkClass("rogue", "d8", 1), [{ kind: "resistance", damage_type: "psychic" }]);
    r.definition.defenses = { resistances: ["Psychic"] };
    const entry = recalc(r).defenses.resistances.find((e) => e.value === "psychic");
    expect(entry).toBeDefined();
    expect(entry!.origin).toBe("grant");
    expect(entry!.label).toBe("Psychic"); // first spelling wins for DISPLAY
    expect(entry!.value).toBe("psychic"); // value is ALWAYS toDefenseSlug(raw)
  });

  it("trims whitespace off both the canonical value and the display label", () => {
    // The retired dedupeDefenseList keyed on `v.trim()` but pushed `v` UNTRIMMED, so "  Fire  "
    // reached the sheet with its whitespace. composeDefenseEntries stores `raw.trim()`.
    const r = emptyResolved();
    r.classes = [mkClass("rogue", "d8", 1)];
    r.definition.defenses = { resistances: ["  Fire  "] };
    const [entry] = recalc(r).defenses.resistances;
    expect(entry.label).toBe("Fire");
    expect(entry.value).toBe("fire");
  });
});

/** The REAL SRD entity, not a synthetic fixture: `Armor of Invulnerability` is the only item in the
 *  whole product carrying an `immune` array (census over src/srd/data/runtime/*.json + canonical:
 *  one hit, item.2024.json). Pulled by slug so a data change that renames or re-shapes it fails
 *  loudly here instead of silently emptying the fixture. */
const ARMOR_OF_INVULNERABILITY = (() => {
  const found = (item2024 as Array<Record<string, unknown>>).find(
    (i) => i.slug === "srd-2024_item_armor-of-invulnerability",
  );
  if (!found) throw new Error("SRD item 'srd-2024_item_armor-of-invulnerability' not found in item.2024.json");
  return found;
})();

const registryWithArmorOfInvulnerability = () =>
  buildMockRegistry([
    {
      slug: "srd-2024_item_armor-of-invulnerability",
      entityType: "item",
      name: "Armor of Invulnerability",
      data: ARMOR_OF_INVULNERABILITY,
    },
  ]);

describe("recalc · overrides.defenses suppression (R4-P5 T5)", () => {
  it("subtracts a suppressed grant from the derived bucket", () => {
    // "Psychic" (authored) vs "psychic" (canonical) on purpose: an assertion that passes here proves
    // WHICH string was compared. With both sides spelled alike the test could not tell `label` from
    // `value`, and a suppression keyed on the raw spelling would survive it.
    const r = resolvedWith(mkClass("rogue", "d8", 1), [
      { kind: "resistance", damage_type: "Psychic" },
      { kind: "resistance", damage_type: "Fire" },
    ]);
    r.definition.overrides = { defenses: { resistances: { remove: ["psychic"] } } };
    const values = recalc(r).defenses.resistances.map((e) => e.value);
    expect(values).not.toContain("psychic");
    // …and ONLY that one: a wholesale-emptying implementation passes the line above.
    expect(values).toEqual(["fire"]);
  });

  it("matches a suppression case-insensitively against the authored spelling", () => {
    const r = resolvedWith(mkClass("rogue", "d8", 1), [{ kind: "resistance", damage_type: "Psychic" }]);
    r.definition.overrides = { defenses: { resistances: { remove: ["PSYCHIC"] } } };
    expect(recalc(r).defenses.resistances).toHaveLength(0);
  });

  it("normalizes every spelling axis of a `remove` entry: case, outer padding, interior runs", () => {
    // The value channel on this boundary was MEASURED blind: against the Task 4 store only
    // letter-case mutants died, while `.trim()`-only, collapse-only, de-duplicate, sort and
    // drop-empty all shipped green. One value per axis, so each axis has its own executioner:
    //   psychic                → case ONLY   (neither remove spelling is the canonical one)
    //   cold                   → outer padding ONLY
    //   nonmagical bludgeoning → interior whitespace-run collapse ONLY
    //   fire                   → the negative control: named nowhere in `remove`, must SURVIVE
    // The empty string is inert by construction (composeDefenseEntries drops empty values), and
    // `fire` surviving is what proves it did not become a wildcard.
    // MEASURED against THIS test: collapse-blind, trim-blind and case-blind normalizers all die
    // here (1, 2 and 3 failures respectively), and each survives again once its own input above is
    // deleted. De-duplicate / sort / drop-empty still survive, and provably must: the `remove` list
    // becomes a Set, which is order-free and already deduplicated, and `""` can never equal a
    // composed value. Those three axes are unobservable through set-membership subtraction, so
    // guarding them belongs on the STORE, not here. That is why "duplicates" is NOT claimed in this
    // test's title: the second "Psychic" below is extra CASE coverage, nothing more.
    const r = resolvedWith(mkClass("rogue", "d8", 1), [{ kind: "resistance", damage_type: "Psychic" }]);
    r.definition.defenses = { resistances: ["Nonmagical Bludgeoning", "cold", "Fire"] };
    r.definition.overrides = {
      defenses: {
        resistances: { remove: ["PSYCHIC", "Psychic", "  cold  ", "nonmagical  bludgeoning", ""] },
      },
    };
    expect(recalc(r).defenses.resistances.map((e) => e.value)).toEqual(["fire"]);
  });

  it("subtracts an equipment-sourced immunity (Armor of Invulnerability)", () => {
    // `origin: "grant"` is unreachable on `immunities` · no feature-effect source exists for that
    // bucket (pc.recalc.ts passes [] for its grants) · so without this case the bucket has ZERO
    // suppression coverage and the equipment lane is never exercised through the subtraction.
    const equipment = [
      { item: "[[srd-2024_item_armor-of-invulnerability]]", equipped: true, attuned: true },
    ] as never;
    const r = resolvedWithEquipment([], equipment);

    const before = recalc(r, registryWithArmorOfInvulnerability()).defenses.immunities;
    expect(before.map((e) => e.value)).toEqual(["bludgeoning", "piercing", "slashing"]);
    // Proof that this case really rides the equipment lane, not manual and not a grant.
    expect(before.map((e) => e.origin)).toEqual(["equipment", "equipment", "equipment"]);

    // Authored non-canonically again, so a passing assertion names the normalizer.
    r.definition.overrides = { defenses: { immunities: { remove: ["  Piercing"] } } };
    const after = recalc(r, registryWithArmorOfInvulnerability()).defenses.immunities;
    expect(after.map((e) => e.value)).toEqual(["bludgeoning", "slashing"]);
    expect(after.map((e) => e.origin)).toEqual(["equipment", "equipment"]);
  });

  it("subtracts a suppressed condition immunity off the LIVE grant lane", () => {
    // `condition_immunities` is the one bucket besides `resistances` with a real feature-effect
    // source: `immune-condition` → `applyEffect` (pc.feature-effects.ts:400) →
    // featureEffects.condition_immunities, already exercised by "applies ungated immune-condition to
    // condition immunities" above. What this case adds is that lane UNDER SUPPRESSION, pinned by the
    // `origin: "grant"` assertion.
    // ⚠️ MEASURED against the tree this ships in, NOT the one the round started from: with this `it`
    // skipped, both `condition_immunities` mutants (drop the `suppress` call · read a different
    // bucket key) STILL die, through the cross-bucket case below. The redundancy is deliberate ·
    // do not read this comment as a uniqueness claim, because it is not one.
    const r = resolvedWith(mkClass("rogue", "d8", 1), [
      { kind: "immune-condition", condition: "Charmed" },
      { kind: "immune-condition", condition: "Frightened" },
    ]);
    r.definition.overrides = { defenses: { condition_immunities: { remove: ["CHARMED"] } } };
    const entries = recalc(r).defenses.condition_immunities;
    expect(entries.map((e) => e.value)).toEqual(["frightened"]);
    expect(entries.map((e) => e.origin)).toEqual(["grant"]); // the grant lane, not manual
  });

  it("subtracts a suppressed manual vulnerability", () => {
    // `vulnerabilities` has NO grant lane and no SRD item carries `vulnerable` (census over every
    // runtime + canonical data file: zero hits), so manual is its only reachable origin · and it was
    // the fourth wired bucket with zero suppression coverage.
    // Same measured caveat as the case above: with this `it` skipped both `vulnerabilities` mutants
    // still die through the cross-bucket case below. Redundant on purpose, not uniquely load-bearing.
    const r = emptyResolved();
    r.classes = [mkClass("rogue", "d8", 1)];
    r.definition.defenses = { vulnerabilities: ["Radiant", "Thunder"] };
    r.definition.overrides = { defenses: { vulnerabilities: { remove: ["RADIANT"] } } };
    const entries = recalc(r).defenses.vulnerabilities;
    expect(entries.map((e) => e.value)).toEqual(["thunder"]);
    expect(entries.map((e) => e.origin)).toEqual(["manual"]);
  });

  it("suppresses ONLY within the addressed bucket, never across buckets", () => {
    // `fire` is deliberately present in THREE buckets while only `resistances` suppresses it. That
    // OVERLAP is the whole point: it is what makes a bucket-AGNOSTIC `suppress` (one that ignores
    // its `bucket` argument and subtracts the union of all four `remove` lists) observable. A
    // disjoint fixture cannot see that mutant at all · removing "poison" from a bucket that never
    // contained "poison" is a no-op, so the union is harmless and the whole suite stays green.
    // ⚠️ MEASURED against the tree this ships in: with this `it` skipped the bucket-agnostic mutant
    // SURVIVES all 1505 tests, and it is the only mutant of which that is true · this test is its
    // sole executioner. Cross-wiring is NOT what earns this test its place: every wrong-key and
    // two-line-swap mutant is also caught by the single-bucket cases above, because a wrong key
    // reads `undefined` and suppresses nothing, which is exactly what makes a single-bucket
    // assertion fail. The overlap is the whole contribution.
    const r = emptyResolved();
    r.classes = [mkClass("rogue", "d8", 1)];
    r.definition.defenses = {
      resistances: ["Fire", "Cold"],
      immunities: ["Fire", "Poison"],
      vulnerabilities: ["Fire", "Radiant"],
      condition_immunities: ["Charmed", "Frightened"],
    };
    r.definition.overrides = {
      defenses: {
        resistances: { remove: ["fire"] },
        immunities: { remove: ["poison"] },
        vulnerabilities: { remove: ["radiant"] },
        condition_immunities: { remove: ["charmed"] },
      },
    };
    const d = recalc(r).defenses;
    expect(d.resistances.map((e) => e.value)).toEqual(["cold"]);
    // `fire` SURVIVES in both buckets that did not ask for it removed. These two lines are the
    // executioners: a union-of-all-buckets implementation empties them.
    expect(d.immunities.map((e) => e.value)).toEqual(["fire"]);
    expect(d.vulnerabilities.map((e) => e.value)).toEqual(["fire"]);
    expect(d.condition_immunities.map((e) => e.value)).toEqual(["frightened"]);
  });
});

describe("recalc — feature effects: AC", () => {
  it("applies an ungated ac-bonus on the unarmored path (no registry)", () => {
    const d = recalc(resolvedWith(mkClass("fighter", "d10", 1), [{ kind: "ac-bonus", value: 2 }]));
    expect(d.ac).toBe(12); // 10 + DEX 0 + 2
    expect(d.acBreakdown).toContainEqual({ source: "Effect Source", amount: 2, kind: "feature" });
  });

  it("does NOT apply a requires_armor ac-bonus when no armor is equipped", () => {
    const d = recalc(resolvedWithEquipment([{ kind: "ac-bonus", value: 1, requires_armor: true }], []), registry());
    expect(d.ac).toBe(10);
    expect(d.acBreakdown.some((t) => t.kind === "feature")).toBe(false);
  });

  it("applies a requires_armor ac-bonus when armor is equipped", () => {
    // Studded leather 12 + DEX 0 = 12; Defense +1 → 13.
    const d = recalc(
      resolvedWithEquipment(
        [{ kind: "ac-bonus", value: 1, requires_armor: true }],
        [{ item: "[[studded-leather]]", equipped: true }],
      ),
      registry(),
    );
    expect(d.ac).toBe(13);
    expect(d.acBreakdown).toContainEqual({ source: "Effect Source", amount: 1, kind: "feature" });
  });

  it("overrides.ac wins over feature AC terms", () => {
    const r = resolvedWithEquipment(
      [{ kind: "ac-bonus", value: 1, requires_armor: true }],
      [{ item: "[[studded-leather]]", equipped: true }],
    );
    r.definition.overrides = { ac: 25 };
    expect(recalc(r, registry()).ac).toBe(25);
  });

  it("unarmored-ac adds Σabilities over base on the no-armor path", () => {
    const r = resolvedWith(mkClass("reaver", "d10", 1), [{ kind: "unarmored-ac", abilities: ["cha"] }]);
    r.definition.abilities = { str: 10, dex: 14, con: 10, int: 10, wis: 10, cha: 16 };
    // 10 + DEX(+2) + CHA(+3) = 15
    expect(recalc(r).ac).toBe(15);
  });

  it("unarmored-ac with empty abilities is base + DEX only (explicit base)", () => {
    const r = resolvedWith(mkClass("reaver", "d10", 1), [{ kind: "unarmored-ac", abilities: [], base: 13 }]);
    r.definition.abilities = { str: 10, dex: 14, con: 10, int: 10, wis: 10, cha: 10 };
    // 13 + DEX(+2) = 15 (Draconic-Resilience shape; no extra ability mods)
    expect(recalc(r).ac).toBe(15);
  });

  it("unarmored-ac does not double-count DEX when listed in abilities", () => {
    const r = resolvedWith(mkClass("reaver", "d10", 1), [{ kind: "unarmored-ac", abilities: ["dex"] }]);
    r.definition.abilities = { str: 10, dex: 14, con: 10, int: 10, wis: 10, cha: 10 };
    // base 10 + DEX(+2); dex is skipped in the Σ loop, so it is NOT added twice = 12
    expect(recalc(r).ac).toBe(12);
  });
});

describe("recalc — feature effects: roll-modifier", () => {
  it("collects roll-modifier entries with label and condition", () => {
    const d = recalc(resolvedWith(mkClass("reaver", "d10", 1), [
      { kind: "roll-modifier", mode: "advantage", roll: "ability-check", scope: "deception" },
      { kind: "roll-modifier", mode: "advantage", roll: "attack", condition: "in dim light or darkness" },
    ]));
    expect(d.rollModifiers).toEqual([
      { mode: "advantage", roll: "ability-check", scope: "deception", condition: undefined, label: "Effect Source" },
      { mode: "advantage", roll: "attack", scope: undefined, condition: "in dim light or darkness", label: "Effect Source" },
    ]);
  });

  it("preserves order and accepts saving-throw roll (surfaced but not rendered here)", () => {
    const d = recalc(resolvedWith(mkClass("reaver", "d10", 1), [
      { kind: "roll-modifier", mode: "disadvantage", roll: "saving-throw", scope: "con" },
      { kind: "roll-modifier", mode: "advantage", roll: "ability-check" },
    ]));
    expect(d.rollModifiers).toEqual([
      { mode: "disadvantage", roll: "saving-throw", scope: "con", condition: undefined, label: "Effect Source" },
      { mode: "advantage", roll: "ability-check", scope: undefined, condition: undefined, label: "Effect Source" },
    ]);
  });

  it("rollModifiers is an empty list when no roll-modifier effects exist", () => {
    const d = recalc(resolvedWith(mkClass("reaver", "d10", 1), [{ kind: "ac-bonus", value: 1 }]));
    expect(d.rollModifiers).toEqual([]);
  });
});

describe("recalc — feature effects: crit-range", () => {
  it("crit-range lowers the AttackRow critRange", () => {
    const r = resolvedWithEquipment([{ kind: "crit-range", min_roll: 19 }], [{ item: "[[club]]", equipped: true }]);
    expect(recalc(r, registryWithClub()).attacks[0].critRange).toBe(19);
  });

  it("takes the lowest min_roll across multiple weapon/all crit-range effects", () => {
    const r = resolvedWithEquipment(
      [{ kind: "crit-range", min_roll: 19 }, { kind: "crit-range", min_roll: 18, applies_to: "all" }],
      [{ item: "[[club]]", equipped: true }],
    );
    expect(recalc(r, registryWithClub()).attacks[0].critRange).toBe(18);
  });

  it("does NOT lower weapon critRange for a spell-only crit-range", () => {
    const r = resolvedWithEquipment(
      [{ kind: "crit-range", min_roll: 19, applies_to: "spell" }],
      [{ item: "[[club]]", equipped: true }],
    );
    expect(recalc(r, registryWithClub()).attacks[0].critRange).toBeUndefined();
  });

  it("leaves critRange undefined on attacks when no crit-range effect is present", () => {
    const r = resolvedWithEquipment([], [{ item: "[[club]]", equipped: true }]);
    expect(recalc(r, registryWithClub()).attacks[0].critRange).toBeUndefined();
  });
});

describe("recalc — feature effects: attack notes (reroll-damage / attack-rule)", () => {
  it("reroll-damage and attack-rule surface as attack notes", () => {
    const r = resolvedWithEquipment([
      { kind: "reroll-damage", max_reroll: 2 }, { kind: "attack-rule", flag: "no-ranged-in-melee-disadvantage" },
    ], [{ item: "[[club]]", equipped: true }]);
    expect(recalc(r, registryWithClub()).attacks[0].attackNotes).toEqual(["Reroll 2s", "No disadvantage firing in melee"]);
  });

  it("once_per_die reroll-damage appends the (once/die) suffix", () => {
    const r = resolvedWithEquipment(
      [{ kind: "reroll-damage", max_reroll: 1, once_per_die: true }],
      [{ item: "[[club]]", equipped: true }],
    );
    expect(recalc(r, registryWithClub()).attacks[0].attackNotes).toEqual(["Reroll 1s (once/die)"]);
  });

  it("leaves attackNotes undefined on attacks when no annotation effect is present", () => {
    const r = resolvedWithEquipment([], [{ item: "[[club]]", equipped: true }]);
    expect(recalc(r, registryWithClub()).attacks[0].attackNotes).toBeUndefined();
  });
});

describe("recalc — feature effects: damage-bonus (damage riders)", () => {
  it("applies a global feature damage-bonus onto weapon attack rows", () => {
    const r = withSimpleWeaponProficiency(
      resolvedWithEquipment(
        [{ kind: "damage-bonus", damage_type: "necrotic", amount: "1d8", applies_to: "weapon" }],
        [{ item: "[[club]]", equipped: true }],
      ),
    );
    expect(recalc(r, registryWithClub()).attacks[0].damageRiders).toEqual([
      { amount: "1d8", damage_type: "necrotic", source: "Effect Source" },
    ]);
  });

  it("leaves damageRiders ABSENT on attack rows when no rider applies", () => {
    const r = withSimpleWeaponProficiency(resolvedWithEquipment([], [{ item: "[[club]]", equipped: true }]));
    expect(recalc(r, registryWithClub()).attacks[0].damageRiders).toBeUndefined();
  });
});

describe("recalc — feature effects: extra-attack", () => {
  it("extra-attack sets attacksPerAction (1 + max count, non-stacking)", () => {
    const d = recalc(resolvedWith(mkClass("reaver", "d10", 5), [
      { kind: "extra-attack", count: 1 }, { kind: "extra-attack", count: 1 },
    ]));
    expect(d.attacksPerAction).toBe(2);
  });

  it("attacksPerAction defaults to 1 when no extra-attack effect is present", () => {
    const d = recalc(resolvedWith(mkClass("reaver", "d10", 5), [{ kind: "ac-bonus", value: 1 }]));
    expect(d.attacksPerAction).toBe(1);
  });
});

describe("recalc — feature effects: weapon-ability (Lies / Hexblade)", () => {
  it("weapon-ability overrides the melee attack ability (Lies → CHA)", () => {
    const r = withSimpleWeaponProficiency(
      resolvedWithEquipment([{ kind: "weapon-ability", ability: "cha" }], [{ item: "[[club]]", equipped: true }]),
    );
    r.definition.abilities = { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 18 };
    // CHA +4 + prof (L1 fighter, simple weapon) +2 = +6
    const club = recalc(r, registryWithClub()).attacks[0];
    expect(club.toHit).toBe(6);
  });
});

describe("recalc — activatable buffs (pool boons + state.active_buffs)", () => {
  /** Resolved character with one selected activatable pool boon carrying an
   *  ac-bonus effect; `active` controls whether its slug is toggled on. */
  function resolvedWithActivatableBoon(active: boolean): ResolvedCharacter {
    const r = emptyResolved();
    r.classes = [mkClass("reaver", "d10", 1)];
    r.pools = [
      {
        id: "interdict-boons", label: "Interdict Boons", classIndex: 0, count: 1, anchorLevel: 1,
        selected: [
          {
            slug: "infernal-majesty",
            entity: {
              slug: "infernal-majesty", name: "Infernal Majesty", activatable: true,
              effects: [{ kind: "ac-bonus", value: 2 }],
            } as never,
          },
        ],
        available: [],
        grants: [],
      },
    ] as never;
    if (active) r.state.active_buffs = ["infernal-majesty"];
    return r;
  }

  it("does NOT raise AC when the boon's slug is absent from state.active_buffs", () => {
    const d = recalc(resolvedWithActivatableBoon(false));
    expect(d.ac).toBe(10); // 10 + DEX 0; buff off
    expect(d.acBreakdown.some((t) => t.kind === "feature")).toBe(false);
  });

  it("raises AC only when the boon's slug is in state.active_buffs", () => {
    const d = recalc(resolvedWithActivatableBoon(true));
    expect(d.ac).toBe(12); // 10 + DEX 0 + 2
    expect(d.acBreakdown).toContainEqual({ source: "Infernal Majesty", amount: 2, kind: "feature" });
  });
});

describe("recalc — granted + passive pool boons fold effects", () => {
  /** Pool carrying: a passive (non-activatable) SELECTED boon, a passive GRANTED
   *  boon, and an activatable GRANTED boon. `active` toggles the activatable
   *  granted boon's slug on in state.active_buffs. All three carry ac-bonus
   *  effects with distinct amounts so each fold is individually observable. */
  function resolvedWithGrantedBoons(active: boolean): ResolvedCharacter {
    const r = emptyResolved();
    r.classes = [mkClass("reaver", "d10", 1)];
    r.pools = [
      {
        id: "interdict-boons", label: "Interdict Boons", classIndex: 0, count: 1, anchorLevel: 1,
        selected: [
          {
            slug: "passive-pick",
            entity: {
              slug: "passive-pick", name: "Passive Pick", activatable: false,
              effects: [{ kind: "ac-bonus", value: 1 }],
            } as never,
          },
        ],
        available: [],
        grants: [
          {
            slug: "granted-passive",
            entity: {
              slug: "granted-passive", name: "Granted Passive", activatable: false,
              effects: [{ kind: "ac-bonus", value: 2 }],
            } as never,
          },
          {
            slug: "granted-buff",
            entity: {
              slug: "granted-buff", name: "Granted Buff", activatable: true,
              effects: [{ kind: "ac-bonus", value: 4 }],
            } as never,
          },
        ],
      },
    ] as never;
    if (active) r.state.active_buffs = ["granted-buff"];
    return r;
  }

  it("folds a passive selected boon and a granted passive boon unconditionally (activatable granted boon stays off)", () => {
    const d = recalc(resolvedWithGrantedBoons(false));
    // 10 base + DEX 0 + passive selected 1 + granted passive 2 = 13; activatable granted OFF
    expect(d.ac).toBe(13);
    expect(d.acBreakdown).toContainEqual({ source: "Passive Pick", amount: 1, kind: "feature" });
    expect(d.acBreakdown).toContainEqual({ source: "Granted Passive", amount: 2, kind: "feature" });
    expect(d.acBreakdown.some((t) => t.source === "Granted Buff")).toBe(false);
  });

  it("folds an activatable granted boon only when its slug is in state.active_buffs", () => {
    const d = recalc(resolvedWithGrantedBoons(true));
    // 13 (passive picks/grants) + activatable granted buff 4 = 17
    expect(d.ac).toBe(17);
    expect(d.acBreakdown).toContainEqual({ source: "Granted Buff", amount: 4, kind: "feature" });
  });
});

const registryWithBattleaxe = () =>
  buildMockRegistry([
    { slug: "battleaxe", entityType: "weapon", name: "Battleaxe", data: BATTLEAXE },
  ]);

describe("recalc — feature effects: additive weapon routing (R4-P3c)", () => {
  it("routes a specific weapon name into .specific while LEAVING it in .categories", () => {
    const d = recalc(resolvedWith(mkClass("rogue", "d8", 1), [
      { kind: "proficiency", proficiency_type: "weapon", value: "battleaxes" },
    ]));
    expect(d.proficiencies.weapons.categories).toContain("battleaxes"); // unchanged behaviour
    expect(d.proficiencies.weapons.specific).toContain("battleaxes");   // the fix
  });

  it("keeps the class-level category words OUT of .specific", () => {
    const d = recalc(resolvedWith(mkClass("rogue", "d8", 1), [
      { kind: "proficiency", proficiency_type: "weapon", value: "martial" },
    ]));
    expect(d.proficiencies.weapons.specific).not.toContain("martial");
  });

  it("keeps entity-level category forms OUT of .specific, so nothing that grants today stops", () => {
    // A value like "simple-ranged" grants today through isWeaponSlugProficient's
    // third fallback (exact equality with weapon.category). Exclusive routing
    // would move it to .specific and kill it silently.
    const d = recalc(resolvedWith(mkClass("rogue", "d8", 1), [
      { kind: "proficiency", proficiency_type: "weapon", value: "simple-ranged" },
    ]));
    expect(d.proficiencies.weapons.categories).toContain("simple-ranged");
    expect(d.proficiencies.weapons.specific).not.toContain("simple-ranged");
  });

  it("flips the LIVE attack gate for a granted specific weapon name", () => {
    // isWeaponSlugProficient matches .specific by normKey, which singularizes:
    // "battleaxes" -> "battleaxe" -> the Battleaxe entity's name.
    // ⚠️ EquipmentEntry is { item, equipped?, qty? } (pc.types.ts:64-80) and `item`
    // is a WIKILINK · computeAttacks resolves it via resolveEntityForEntry.
    // `{ slug, quantity }` resolves to null, produces NO attack row, and
    // `attacks[0].proficient` throws. All six sibling call sites use this form.
    const equipment = [{ item: "[[battleaxe]]", equipped: true }] as never;
    const before = recalc(resolvedWithEquipment([], equipment), registryWithBattleaxe());
    const after = recalc(resolvedWithEquipment(
      [{ kind: "proficiency", proficiency_type: "weapon", value: "battleaxes" }], equipment,
    ), registryWithBattleaxe());
    expect(before.attacks[0].proficient).toBe(false);
    expect(after.attacks[0].proficient).toBe(true);
  });
});
