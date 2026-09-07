import { describe, it, expect } from "vitest";
import { assembleEffectFeatures, classifyProficiencyEffect, collectProficiencyEffectGrants, computeFeatureEffects, emptyFeatureEffectTotals, foldsNow, foldsOnSelf, selfEffectsOf } from "../src/pc/pc.feature-effects";
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
    expect(out.resistances.map((g) => g.value)).toEqual(["Fire", "Cold"]);
  });

  it("applies ungated immune-condition and skips while-gated entries", () => {
    const out = computeFeatureEffects([
      rf([{ kind: "immune-condition", condition: "Charmed" }]),
      rf([{ kind: "immune-condition", condition: "Frightened", while: "while raging" }]),
    ]);
    expect(out.condition_immunities.map((g) => g.value)).toEqual(["Charmed"]);
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

  // R4-G3a §7. This is the ONLY assertion with kill power on the fold's
  // `bucket === "skills"` guard: at the recalc level a stray "thieves'-tools" in
  // skillExpertise coincides with no skill key, so every skill still reads
  // "none" and the guard's removal is invisible there.
  it("routes an expertise SKILL into both skills and skillExpertise; a tool never reaches skillExpertise", () => {
    const skill = computeFeatureEffects([
      rf([{ kind: "proficiency", proficiency_type: "skill", value: "Arcana", expertise: true }]),
    ]);
    expect(skill.proficiencies.skills).toEqual(["arcana"]);
    expect(skill.proficiencies.skillExpertise).toEqual(["arcana"]);

    const plain = computeFeatureEffects([
      rf([{ kind: "proficiency", proficiency_type: "skill", value: "Arcana" }]),
    ]);
    expect(plain.proficiencies.skills).toEqual(["arcana"]);
    expect(plain.proficiencies.skillExpertise).toEqual([]);

    const tool = computeFeatureEffects([
      rf([{ kind: "proficiency", proficiency_type: "tool", value: "Thieves' Tools", expertise: true }]),
    ]);
    expect(tool.proficiencies.tools).toEqual(["thieves'-tools"]);
    expect(tool.proficiencies.skillExpertise).toEqual([]);
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
      .toEqual({ bucket: "skills", value: "perception", raw: "Perception", expertise: false });
    expect(classifyProficiencyEffect({ kind: "proficiency", proficiency_type: "armor", value: "Heavy" }))
      .toEqual({ bucket: "armor", value: "heavy", raw: "Heavy", expertise: false });
    expect(classifyProficiencyEffect({ kind: "proficiency", proficiency_type: "weapon", value: "Martial" }))
      .toEqual({ bucket: "weapons", value: "martial", raw: "Martial", expertise: false });
    expect(classifyProficiencyEffect({ kind: "proficiency", proficiency_type: "saving-throw", value: "Strength" }))
      .toEqual({ bucket: "saves", value: "str", raw: "Strength", expertise: false });
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
      .toEqual({ bucket: "tools", value: "tinker's-tools", raw: "Tinker’s Tools", expertise: false });
    expect(classifyProficiencyEffect({ kind: "proficiency", proficiency_type: "language", value: "Draconic" }))
      .toEqual({ bucket: "languages", value: "draconic", raw: "Draconic", expertise: false });
  });

  it("trims padded skill values, which the previous hand-rolled normalizer did not", () => {
    expect(classifyProficiencyEffect({ kind: "proficiency", proficiency_type: "skill", value: " Perception " }))
      .toEqual({ bucket: "skills", value: "perception", raw: " Perception ", expertise: false });
  });

  // R4-G3a §7: the classification carries the expertise flag for BOTH consumers.
  // `expertise` is required (never absent), so an absent authored key reads false
  // rather than undefined and no consumer has to distinguish the two.
  it("carries expertise:true from the effect, and false when the key is absent", () => {
    expect(classifyProficiencyEffect({ kind: "proficiency", proficiency_type: "skill", value: "Arcana", expertise: true }))
      .toEqual({ bucket: "skills", value: "arcana", raw: "Arcana", expertise: true });
    expect(classifyProficiencyEffect({ kind: "proficiency", proficiency_type: "skill", value: "Arcana" }))
      .toEqual({ bucket: "skills", value: "arcana", raw: "Arcana", expertise: false });
    // Non-skill buckets carry the flag too; only the FOLD refuses to route them.
    expect(classifyProficiencyEffect({ kind: "proficiency", proficiency_type: "tool", value: "Thieves' Tools", expertise: true }))
      .toEqual({ bucket: "tools", value: "thieves'-tools", raw: "Thieves' Tools", expertise: true });
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
    expect(computeFeatureEffects(out.features, { activeBuffs: out.activeBuffs }).resistances.map((g) => g.value)).toEqual(["fire"]);
  });

  it("folds nothing for an activatable feature that is not toggled on", () => {
    const resolved = { features: [trait("buff", true)], pools: [], state: {} } as never;
    const out = assembleEffectFeatures(resolved);
    expect(computeFeatureEffects(out.features, { activeBuffs: out.activeBuffs }).resistances.map((g) => g.value)).toEqual([]);
    expect(foldsNow(out.features[0], out.activeBuffs)).toBe(false);
  });

  it("RED FIRST (R4-G5 §9.2.4, row 37): a buff stored under the NON-surviving twin folds the survivor's effects exactly once", () => {
    // §9.2.3 rewrites a stored twin's pick to the surviving entry, but `active_buffs` is never pruned,
    // so the stored key stays the OTHER edition's full slug. Matching by BARE slug at the set is what
    // keeps the fold alive; the survivor is added, the stale key is left in place.
    const survivor = {
      slug: "players-handbook-2014_optional-feature_commanders-strike",
      entity: { name: "Commander's Strike", activatable: true,
                effects: [{ kind: "resistance", damage_type: "fire" }] },
    };
    const resolved = {
      features: [],
      pools: [{ id: "battle-master-maneuvers", label: "Maneuvers", classIndex: 0, anchorLevel: 3,
               count: 3, selected: [survivor], available: [], grants: [] }],
      classes: [{ entity: { slug: "players-handbook-2014_class_fighter" } }],
      state: { active_buffs: ["players-handbook-2024_optional-feature_commanders-strike"] },
    } as never;
    const out = assembleEffectFeatures(resolved);
    expect(out.activeBuffs.has(survivor.slug)).toBe(true);
    // and the fold runs ONCE, not twice: one boon feature, one resistance
    expect(computeFeatureEffects(out.features, { activeBuffs: out.activeBuffs }).resistances.map((g) => g.value))
      .toEqual(["fire"]);
    // the stale key is NOT pruned (the stated consequence: the rail's End control clears it)
    expect(out.activeBuffs.has("players-handbook-2024_optional-feature_commanders-strike")).toBe(true);
  });

  it("a stored key that shares no bare slug with any pool entry adds nothing (the control)", () => {
    const resolved = {
      features: [],
      pools: [{ id: "p", label: "P", classIndex: 0, anchorLevel: 3, count: 1,
               selected: [{ slug: "a_optional-feature_parry", entity: { name: "Parry", activatable: true, effects: [{ kind: "resistance", damage_type: "cold" }] } }],
               available: [], grants: [] }],
      classes: [{ entity: { slug: "a_class_fighter" } }],
      state: { active_buffs: ["b_optional-feature_riposte"] },
    } as never;
    expect(assembleEffectFeatures(resolved).activeBuffs.size).toBe(1);
  });

  it("RED FIRST (R4-G5 T11 fix wave): a stored CLASS-FEATURE id never aliases a pool entry whose bare slug equals it", () => {
    // The two keyspaces intersect on two ids of the 13-book install (`elemental-attunement`,
    // `replicate-magic-item`), so without the feature-id skip a stored FEATURE id would alias an
    // unrelated pool entry and fold its effects. The class feature's own fold is untouched.
    const resolved = {
      features: [trait("elemental-attunement", true)],
      pools: [{ id: "p", label: "P", classIndex: 0, anchorLevel: 3, count: 1,
               selected: [{ slug: "a_optional-feature_elemental-attunement",
                            entity: { name: "Elemental Attunement", activatable: true, effects: [{ kind: "resistance", damage_type: "cold" }] } }],
               available: [], grants: [] }],
      classes: [{ entity: { slug: "a_class_monk" } }],
      state: { active_buffs: ["elemental-attunement"] },
    } as never;
    const out = assembleEffectFeatures(resolved);
    expect(out.activeBuffs.has("a_optional-feature_elemental-attunement")).toBe(false);
    // and the entry's effects never reach the totals: only the stored class feature's own resistance folds
    expect(computeFeatureEffects(out.features, { activeBuffs: out.activeBuffs }).resistances.map((g) => g.value))
      .toEqual(["fire"]);
  });
});

describe("collectProficiencyEffectGrants", () => {
  // `effects` is typed, not `unknown[]`: an untyped array made every call site an
  // assignability error against ResolvedFeature (5 at T0), which hid whether a
  // fixture's effect literal was even a valid FeatureEffect.
  const feat = (name: string, slug: string, effects: FeatureEffect[], activatable = false) => ({
    feature: { id: slug, name, activatable, effects },
    source: { kind: "race" as const, slug },
  });

  it("collects per bucket, carrying both the normalized and the raw value", () => {
    const out = collectProficiencyEffectGrants(
      [feat("Tinker", "srd-5e_race_rock-gnome", [
        { kind: "proficiency", proficiency_type: "tool", value: "Tinker’s Tools" },
        { kind: "proficiency", proficiency_type: "weapon", value: "battleaxes" },
      ])],
      new Set(),
    );
    expect(out.tools).toEqual([
      { value: "tinker's-tools", raw: "Tinker’s Tools", sourceKind: "race", sourceSlug: "srd-5e_race_rock-gnome" },
    ]);
    expect(out.weapons[0].raw).toBe("battleaxes");
    expect(out.languages).toEqual([]);
  });

  it("does NOT dedupe across sources: two entities granting one value yield two entries", () => {
    const out = collectProficiencyEffectGrants(
      [feat("A", "slug-a", [{ kind: "proficiency", proficiency_type: "language", value: "Dwarvish" }]),
       feat("B", "slug-b", [{ kind: "proficiency", proficiency_type: "language", value: "Dwarvish" }])],
      new Set(),
    );
    expect(out.languages).toHaveLength(2);
    expect(out.languages.map((g) => g.sourceSlug)).toEqual(["slug-a", "slug-b"]);
  });

  // R4-G3a §7: the display collector reads the same classification the fold does,
  // so the flag is present ONLY on an expertise grant · a plain grant keeps the
  // four-key shape the two display consumers already assert on.
  it("tags an expertise grant with expertise:true and leaves a plain grant untagged", () => {
    const out = collectProficiencyEffectGrants(
      [feat("Scholar", "phb-2024_class_wizard", [
        { kind: "proficiency", proficiency_type: "skill", value: "Arcana", expertise: true },
        { kind: "proficiency", proficiency_type: "skill", value: "History" },
      ])],
      new Set(),
    );
    expect(out.skills).toEqual([
      { value: "arcana", raw: "Arcana", sourceKind: "race", sourceSlug: "phb-2024_class_wizard", expertise: true },
      { value: "history", raw: "History", sourceKind: "race", sourceSlug: "phb-2024_class_wizard" },
    ]);
  });

  it("skips an activatable feature that is not toggled on", () => {
    const effects: FeatureEffect[] = [{ kind: "proficiency", proficiency_type: "tool", value: "thieves'-tools" }];
    expect(collectProficiencyEffectGrants([feat("B", "b", effects, true)], new Set()).tools).toEqual([]);
    expect(collectProficiencyEffectGrants([feat("B", "b", effects, true)], new Set(["b"])).tools).toHaveLength(1);
  });
});

describe("foldsOnSelf · non-self effects never fold (R4-G1a D2, G6)", () => {
  const res = (subject?: string) => ({ kind: "resistance", damage_type: "Poison", ...(subject !== undefined ? { subject } : {}) }) as FeatureEffect;
  it("absent and \"self\" fold identically; \"target\" never reaches the totals", () => {
    // `applyEffect`'s resistance case is `pushDefenseGrant(out.resistances, eff.damage_type, label, eff.condition)`:
    // the authored spelling is kept as `value.trim()`, exactly as `pushUnique` did (toDefenseSlug runs later, in
    // pc.recalc.ts), so "Poison" proves which field was read.
    expect(computeFeatureEffects([rf([res()])]).resistances.map((g) => g.value)).toEqual(["Poison"]);
    expect(computeFeatureEffects([rf([res("self")])]).resistances.map((g) => g.value)).toEqual(["Poison"]);
    expect(computeFeatureEffects([rf([res("target")])]).resistances.map((g) => g.value)).toEqual([]);
  });
  it("a non-self initiative-bonus leaves the total at 0", () => {
    expect(computeFeatureEffects([rf([{ kind: "initiative-bonus", value: 2, subject: "target" } as FeatureEffect])]).initiative_bonus).toBe(0);
  });
  it("the predicate itself", () => {
    expect(foldsOnSelf({})).toBe(true); expect(foldsOnSelf({ subject: "self" })).toBe(true); expect(foldsOnSelf({ subject: "target" })).toBe(false);
    expect(selfEffectsOf({ effects: [res(), res("target"), res("self")] })).toHaveLength(2);
  });
  it("collectProficiencyEffectGrants drops a non-self proficiency (the display cannot disagree with the engine)", () => {
    const f = (effects: FeatureEffect[]) => ({ feature: { id: "x", name: "X", effects }, source: { kind: "race" as const, slug: "x" } });
    const self = collectProficiencyEffectGrants([f([{ kind: "proficiency", proficiency_type: "tool", value: "Thieves' Tools", subject: "self" }])], new Set());
    const other = collectProficiencyEffectGrants([f([{ kind: "proficiency", proficiency_type: "tool", value: "Thieves' Tools", subject: "target" }])], new Set());
    expect(self.tools).toHaveLength(1);
    expect(other.tools).toEqual([]);
  });
});

describe("ability-score-increase: the chosen arms stay INERT at the fold (R4-G1a D3 → R4-G3b §4 folds fixed-list arms only)", () => {
  it("the converter Fighter 4 `chosen` pair folds nothing while a known arm in the same fixture folds", () => {
    const out = computeFeatureEffects([rf([
      { kind: "ability-score-increase", abilities: "chosen", amount: 2, choose: 1, max: 20, subject: "self" } as FeatureEffect,
      { kind: "ability-score-increase", abilities: "chosen", amount: 1, choose: 2, max: 20, subject: "self" } as FeatureEffect,
      { kind: "initiative-bonus", value: 2 },
    ])]);
    const expected = emptyFeatureEffectTotals();
    expected.initiative_bonus = 2;
    expect(out).toEqual(expected);
  });
});

describe("ability-score-increase (R4-G3b §4)", () => {
  const CHOSEN = [
    { kind: "ability-score-increase", abilities: "chosen", amount: 2, choose: 1, max: 20 },
    { kind: "ability-score-increase", abilities: "chosen", amount: 1, choose: 2, max: 20 },
  ] as FeatureEffect[];
  const CAPSTONE = [{ kind: "ability-score-increase", abilities: ["str", "con"], amount: 4, choose: null, max: 24 }] as FeatureEffect[];

  it("a `chosen` arm folds NOTHING (the ASI slot's second encoding)", () => {
    // RED FIRST before Task 2 (cc9d9a4): ability_bonus read `undefined` (the field did not exist).
    // This is the ONLY layer that sees the gate mutant: recalc iterates the STRING "chosen" and still reads 24/18.
    expect(computeFeatureEffects([rf(CHOSEN)]).ability_bonus).toEqual({});
  });

  it("a fixed-list capstone folds flat per ability, with NO cap (user ruling 2026-09-03; `max` unread)", () => {
    // RED FIRST before Task 2 (cc9d9a4): `undefined`.
    expect(computeFeatureEffects([rf(CAPSTONE)]).ability_bonus).toEqual({ str: 4, con: 4 });
    expect(computeFeatureEffects([rf(CAPSTONE), rf(CAPSTONE)]).ability_bonus).toEqual({ str: 8, con: 8 });
  });

  // RED FIRST before Task 2 (cc9d9a4): `undefined`.
  it("the empty shape carries ability_bonus: {}", () => expect(emptyFeatureEffectTotals().ability_bonus).toEqual({}));
});
