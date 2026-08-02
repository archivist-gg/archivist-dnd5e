import { describe, it, expect } from "vitest";
import { assembleEffectFeatures, classifyProficiencyEffect, computeFeatureEffects, emptyFeatureEffectTotals, foldsNow } from "../src/pc/pc.feature-effects";
import type { ResolvedFeature } from "../src/pc/pc.types";
import type { FeatureEffect } from "@archivist-gg/dnd5e/types/feature-effect";

function rf(effects: FeatureEffect[], name = "Test Feature"): ResolvedFeature {
  return { feature: { name, effects }, source: { kind: "race", slug: "test-race" } };
}

describe("computeFeatureEffects", () => {
  it("returns the empty shape for no features / no effects / absent effects", () => {
    expect(computeFeatureEffects([])).toEqual(emptyFeatureEffectTotals());
    expect(computeFeatureEffects([rf([])])).toEqual(emptyFeatureEffectTotals());
    expect(
      computeFeatureEffects([{ feature: { name: "Plain" }, source: { kind: "race", slug: "r" } }]),
    ).toEqual(emptyFeatureEffectTotals());
  });

  it("sums initiative-bonus, hp-per-level-bonus and walk speed-bonus", () => {
    const out = computeFeatureEffects([
      rf([{ kind: "initiative-bonus", value: 2 }, { kind: "hp-per-level-bonus", value: 1 }]),
      rf([{ kind: "initiative-bonus", value: 1 }, { kind: "speed-bonus", mode: "walk", value: 5 }]),
      rf([{ kind: "speed-bonus", mode: "walk", value: 10 }]),
    ]);
    expect(out.initiative_bonus).toBe(3);
    expect(out.hp_per_level_bonus).toBe(1);
    expect(out.speed_walk_bonus).toBe(15);
  });

  it("ignores non-walk speed-bonus modes (deferred — no derived surface)", () => {
    const out = computeFeatureEffects([rf([{ kind: "speed-bonus", mode: "fly", value: 30 }])]);
    expect(out.speed_walk_bonus).toBe(0);
  });

  it("takes the max range per sense type", () => {
    const out = computeFeatureEffects([
      rf([{ kind: "sense", type: "darkvision", range: 60 }]),
      rf([{ kind: "sense", type: "darkvision", range: 120 }]),
      rf([{ kind: "sense", type: "truesight", range: 30 }]),
    ]);
    expect(out.senses.darkvision).toBe(120);
    expect(out.senses.truesight).toBe(30);
    expect(out.senses.blindsight).toBe(0);
  });

  it("unions resistances case-insensitively, first spelling wins", () => {
    const out = computeFeatureEffects([
      rf([{ kind: "resistance", damage_type: "Fire" }]),
      rf([{ kind: "resistance", damage_type: "fire" }]),
      rf([{ kind: "resistance", damage_type: "Cold" }]),
    ]);
    expect(out.resistances).toEqual(["Fire", "Cold"]);
  });

  it("applies ungated immune-condition and skips while-gated entries", () => {
    const out = computeFeatureEffects([
      rf([{ kind: "immune-condition", condition: "Charmed" }]),
      rf([{ kind: "immune-condition", condition: "Frightened", while: "while raging" }]),
    ]);
    expect(out.condition_immunities).toEqual(["Charmed"]);
  });

  it("buckets proficiency effects; skills normalize to kebab, saves to ability keys", () => {
    const out = computeFeatureEffects([
      rf([
        { kind: "proficiency", proficiency_type: "skill", value: "Animal Handling" },
        { kind: "proficiency", proficiency_type: "tool", value: "Thieves' Tools" },
        { kind: "proficiency", proficiency_type: "language", value: "Draconic" },
        { kind: "proficiency", proficiency_type: "saving-throw", value: "Wisdom" },
        { kind: "proficiency", proficiency_type: "saving-throw", value: "dex" },
      ]),
    ]);
    expect(out.proficiencies.skills).toEqual(["animal-handling"]);
    expect(out.proficiencies.tools).toEqual(["thieves'-tools"]);
    expect(out.proficiencies.languages).toEqual(["draconic"]);
    expect(out.proficiencies.saves).toEqual(["wis", "dex"]);
  });

  it("drops unrecognized saving-throw values", () => {
    const out = computeFeatureEffects([
      rf([{ kind: "proficiency", proficiency_type: "saving-throw", value: "luck" }]),
    ]);
    expect(out.proficiencies.saves).toEqual([]);
  });

  it("dedupes saves given the same ability as full name and key", () => {
    const out = computeFeatureEffects([
      rf([
        { kind: "proficiency", proficiency_type: "saving-throw", value: "Wisdom" },
        { kind: "proficiency", proficiency_type: "saving-throw", value: "wis" },
      ]),
    ]);
    expect(out.proficiencies.saves).toEqual(["wis"]);
  });

  it("buckets armor and weapon proficiency category effects, lowercased (category form)", () => {
    // Armor/weapon grants are CATEGORIES, kept as bare lowercase words (no kebab)
    // so they match the matcher's `.categories` form ("heavy", "martial", "shield").
    const out = computeFeatureEffects([
      rf([
        { kind: "proficiency", proficiency_type: "armor", value: "Heavy" },
        { kind: "proficiency", proficiency_type: "weapon", value: "Martial" },
      ]),
    ]);
    expect(out.proficiencies.armor).toEqual(["heavy"]);
    expect(out.proficiencies.weapons).toEqual(["martial"]);
  });

  it("tracks speed_walk_set as the max of set values, separate from additive bonus", () => {
    const out = computeFeatureEffects([
      rf([{ kind: "speed-bonus", mode: "walk", set: true, value: 40 }]),
      rf([{ kind: "speed-bonus", mode: "walk", set: true, value: 60 }]),
      rf([{ kind: "speed-bonus", mode: "walk", value: 10 }]),
    ]);
    expect(out.speed_walk_set).toBe(60);
    expect(out.speed_walk_bonus).toBe(10);
  });

  it("collects ac-bonus terms with feature-name labels and gating flag", () => {
    const out = computeFeatureEffects([
      rf([{ kind: "ac-bonus", value: 1, requires_armor: true }], "Defense"),
      rf([{ kind: "ac-bonus", value: 2 }], "Mystic Shield"),
    ]);
    expect(out.ac_terms).toEqual([
      { value: 1, requires_armor: true, label: "Defense" },
      { value: 2, requires_armor: false, label: "Mystic Shield" },
    ]);
  });

  it("collects ac-bonus terms from two same-named features as separate terms", () => {
    const out = computeFeatureEffects([
      rf([{ kind: "ac-bonus", value: 1 }], "Defense"),
      rf([{ kind: "ac-bonus", value: 1 }], "Defense"),
    ]);
    expect(out.ac_terms).toEqual([
      { value: 1, requires_armor: false, label: "Defense" },
      { value: 1, requires_armor: false, label: "Defense" },
    ]);
  });

  it("skips activatable feature effects unless the id is active", () => {
    const feat: ResolvedFeature = {
      feature: { id: "majesty", name: "Infernal Majesty", activatable: true, effects: [{ kind: "ac-bonus", value: 2 }] } as never,
      source: { kind: "class", slug: "reaver" } as never,
    };
    // Off by default (no opts) and off when the active set lacks the id.
    expect(computeFeatureEffects([feat]).ac_terms).toEqual([]);
    expect(computeFeatureEffects([feat], { activeBuffs: new Set<string>() }).ac_terms).toEqual([]);
    // Folds only when the id is in the active set.
    expect(computeFeatureEffects([feat], { activeBuffs: new Set(["majesty"]) }).ac_terms).toEqual([
      { value: 2, requires_armor: false, label: "Infernal Majesty" },
    ]);
  });

  it("folds non-activatable feature effects unconditionally (active set irrelevant)", () => {
    const feat = rf([{ kind: "ac-bonus", value: 1 }], "Shield of Faith");
    expect(computeFeatureEffects([feat]).ac_terms).toEqual([
      { value: 1, requires_armor: false, label: "Shield of Faith" },
    ]);
    // An empty (or unrelated) active set never suppresses a non-activatable feature.
    expect(computeFeatureEffects([feat], { activeBuffs: new Set(["other"]) }).ac_terms).toEqual([
      { value: 1, requires_armor: false, label: "Shield of Faith" },
    ]);
  });

  it("skips action-time kinds and unknown kinds without throwing", () => {
    const out = computeFeatureEffects([
      rf([
        { kind: "apply-condition", condition: "Prone" },
        { kind: "future-kind", whatever: 1 } as unknown as FeatureEffect,
      ]),
    ]);
    expect(out).toEqual(emptyFeatureEffectTotals());
  });

  it("hp-per-level-bonus emits labeled terms AND the sum stays equal", () => {
    const totals = computeFeatureEffects([
      rf([{ kind: "hp-per-level-bonus", value: 2 }], "Toughness"),
      rf([{ kind: "hp-per-level-bonus", value: 1 }], "Dwarven Toughness"),
    ]);
    expect(totals.hp_per_level_terms).toEqual([
      { label: "Toughness", value: 2 },
      { label: "Dwarven Toughness", value: 1 },
    ]);
    expect(totals.hp_per_level_bonus).toBe(totals.hp_per_level_terms.reduce((s, t) => s + t.value, 0));
  });

  describe("damage-bonus", () => {
    it("folds a weapon damage-bonus into damageBonuses with source = feature name", () => {
      const out = computeFeatureEffects([
        rf([{ kind: "damage-bonus", damage_type: "necrotic", amount: "1d8", applies_to: "weapon" }], "Terrorizing Force"),
      ]);
      expect(out.damageBonuses).toEqual([{ amount: "1d8", damage_type: "necrotic", source: "Terrorizing Force" }]);
    });
    it("treats absent applies_to as weapon", () => {
      const out = computeFeatureEffects([rf([{ kind: "damage-bonus", damage_type: "fire", amount: "2" }], "Aura")]);
      expect(out.damageBonuses).toEqual([{ amount: "2", damage_type: "fire", source: "Aura" }]);
    });
    it("ignores spell-only damage-bonus (no spell surface yet)", () => {
      const out = computeFeatureEffects([
        rf([{ kind: "damage-bonus", damage_type: "fire", amount: "1d6", applies_to: "spell" }], "Spell Rider"),
      ]);
      expect(out.damageBonuses).toEqual([]);
    });
  });
});

describe("classifyProficiencyEffect", () => {
  it("routes each proficiency_type to its bucket", () => {
    expect(classifyProficiencyEffect({ kind: "proficiency", proficiency_type: "skill", value: "Perception" }))
      .toEqual({ bucket: "skills", value: "perception", raw: "Perception" });
    expect(classifyProficiencyEffect({ kind: "proficiency", proficiency_type: "armor", value: "Heavy" }))
      .toEqual({ bucket: "armor", value: "heavy", raw: "Heavy" });
    expect(classifyProficiencyEffect({ kind: "proficiency", proficiency_type: "weapon", value: "Martial" }))
      .toEqual({ bucket: "weapons", value: "martial", raw: "Martial" });
    expect(classifyProficiencyEffect({ kind: "proficiency", proficiency_type: "saving-throw", value: "Strength" }))
      .toEqual({ bucket: "saves", value: "str", raw: "Strength" });
  });

  it("returns null for an unrecognized saving-throw value", () => {
    expect(classifyProficiencyEffect({ kind: "proficiency", proficiency_type: "saving-throw", value: "nonsense" }))
      .toBeNull();
  });

  it("returns null for a non-proficiency effect", () => {
    expect(classifyProficiencyEffect({ kind: "resistance", damage_type: "fire" })).toBeNull();
  });

  it("canonicalizes tool and language values, folding the curly apostrophe", () => {
    expect(classifyProficiencyEffect({ kind: "proficiency", proficiency_type: "tool", value: "Tinker’s Tools" }))
      .toEqual({ bucket: "tools", value: "tinker's-tools", raw: "Tinker’s Tools" });
    expect(classifyProficiencyEffect({ kind: "proficiency", proficiency_type: "language", value: "Draconic" }))
      .toEqual({ bucket: "languages", value: "draconic", raw: "Draconic" });
  });

  it("trims padded skill values, which the previous hand-rolled normalizer did not", () => {
    expect(classifyProficiencyEffect({ kind: "proficiency", proficiency_type: "skill", value: " Perception " }))
      .toEqual({ bucket: "skills", value: "perception", raw: " Perception " });
  });
});

describe("assembleEffectFeatures", () => {
  const trait = (id: string, activatable: boolean) => ({
    feature: { id, name: "T", activatable, effects: [{ kind: "resistance", damage_type: "fire" }] },
    source: { kind: "race" as const, slug: "r" },
  });

  it("survives a cast-built fixture with no pools and no state", () => {
    const resolved = { features: [trait("a", false)] } as never;
    const out = assembleEffectFeatures(resolved);
    expect(out.features).toHaveLength(1);
    expect(out.activeBuffs.size).toBe(0);
  });

  it("returns activeBuffs so an activatable boon still folds", () => {
    const resolved = {
      features: [trait("buff", true)],
      pools: [],
      state: { active_buffs: ["buff"] },
    } as never;
    const out = assembleEffectFeatures(resolved);
    expect(out.activeBuffs.has("buff")).toBe(true);
    expect(computeFeatureEffects(out.features, { activeBuffs: out.activeBuffs }).resistances).toEqual(["fire"]);
  });

  it("folds nothing for an activatable feature that is not toggled on", () => {
    const resolved = { features: [trait("buff", true)], pools: [], state: {} } as never;
    const out = assembleEffectFeatures(resolved);
    expect(computeFeatureEffects(out.features, { activeBuffs: out.activeBuffs }).resistances).toEqual([]);
    expect(foldsNow(out.features[0], out.activeBuffs)).toBe(false);
  });
});
