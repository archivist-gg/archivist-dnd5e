import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { toClassCanonical, classMergeRule } from "../../../tools/srd-canonical/merger-rules/class-merge";
import { loadOverlay } from "../../../tools/srd-canonical/sources/overlay";
import { ARTISANS_TOOLS, MUSICAL_INSTRUMENTS } from "../../../src/types/choice";
import type { CanonicalEntry } from "../../../tools/srd-canonical/merger";

const baseEntry = (overrides: Partial<CanonicalEntry> & { base: unknown }): CanonicalEntry => ({
  slug: overrides.slug ?? "srd-5e_fighter",
  edition: overrides.edition ?? "2014",
  kind: "class",
  base: overrides.base as never,
  structured: overrides.structured ?? null,
  activation: null,
  overlay: overrides.overlay ?? null,
});

describe("class-merge: Open5e v2 class shape", () => {
  it("emits lowercase d10 hit_die (was uppercase D10 'hit_dice')", () => {
    const result = toClassCanonical(baseEntry({
      base: {
        key: "srd_fighter",
        name: "Fighter",
        desc: "",
        hit_dice: "D10",
        subclass_of: null,
        features: [],
        saving_throws: [{ name: "Strength" }, { name: "Constitution" }],
      },
    })) as { hit_die: string };
    expect(result.hit_die).toBe("d10");
  });

  it("buckets features by gained_at[].level (filters CLASS_LEVEL_FEATURE, drops [Column data] CLASS_TABLE_DATA)", () => {
    const result = toClassCanonical(baseEntry({
      base: {
        key: "srd_fighter",
        name: "Fighter",
        desc: "",
        hit_dice: "D10",
        subclass_of: null,
        features: [
          {
            key: "srd_fighter_ability-score-improvement",
            name: "Ability Score Improvement",
            desc: "Boost an ability.",
            feature_type: "CLASS_LEVEL_FEATURE",
            gained_at: [{ level: 4, detail: null }, { level: 6, detail: null }, { level: 8, detail: null }],
            data_for_class_table: [],
          },
          {
            key: "srd_fighter_cantrips-known",
            name: "Cantrips Known",
            desc: "[Column data]",
            feature_type: "CLASS_TABLE_DATA",
            gained_at: [],
            data_for_class_table: [{ level: 1, column_value: "3" }, { level: 4, column_value: "4" }],
          },
        ],
        saving_throws: [{ name: "Strength" }, { name: "Constitution" }],
      },
    })) as { features_by_level: Record<string, Array<{ name: string }>> };
    const allFeatureNames = Object.values(result.features_by_level)
      .flat()
      .map((f) => f.name);
    expect(allFeatureNames).not.toContain("Cantrips Known");
    expect(allFeatureNames.filter((n) => n === "Ability Score Improvement").length).toBeGreaterThanOrEqual(3);
  });

  it("reads saving_throws[{name}] and shortens to 3-letter ability keys", () => {
    const result = toClassCanonical(baseEntry({
      base: {
        key: "srd_fighter",
        name: "Fighter",
        desc: "",
        hit_dice: "D10",
        subclass_of: null,
        saving_throws: [{ name: "Strength" }, { name: "Constitution" }],
        features: [],
      },
    })) as { saving_throws: string[] };
    expect(result.saving_throws.sort()).toEqual(["con", "str"]);
  });

  it("reconstructs table rows from features[].data_for_class_table[]", () => {
    const result = toClassCanonical(baseEntry({
      base: {
        key: "srd_wizard",
        name: "Wizard",
        desc: "",
        hit_dice: "D6",
        subclass_of: null,
        saving_throws: [{ name: "Intelligence" }, { name: "Wisdom" }],
        features: [
          {
            key: "srd_wizard_proficiency-bonus",
            name: "Proficiency Bonus",
            desc: "[Column data]",
            feature_type: "PROFICIENCY_BONUS",
            gained_at: [],
            data_for_class_table: [
              { level: 1, column_value: "+2" },
              { level: 5, column_value: "+3" },
              { level: 9, column_value: "+4" },
              { level: 13, column_value: "+5" },
              { level: 17, column_value: "+6" },
            ],
          },
          {
            key: "srd_wizard_cantrips-known",
            name: "Cantrips Known",
            desc: "[Column data]",
            feature_type: "CLASS_TABLE_DATA",
            gained_at: [],
            data_for_class_table: [
              { level: 1, column_value: "3" },
              { level: 4, column_value: "4" },
              { level: 10, column_value: "5" },
            ],
          },
        ],
      },
    })) as { table: Record<string, { prof_bonus: number; columns?: Record<string, unknown>; feature_ids: string[] }> };
    expect(result.table["1"].prof_bonus).toBe(2);
    expect(result.table["5"].prof_bonus).toBe(3);
    expect(result.table["1"].columns?.["Cantrips Known"]).toBe("3");
    expect(result.table["4"].columns?.["Cantrips Known"]).toBe("4");
  });

  it("assigns feature_ids from CLASS_LEVEL_FEATURE features at each gained_at level", () => {
    const result = toClassCanonical(baseEntry({
      base: {
        key: "srd_fighter",
        name: "Fighter",
        desc: "",
        hit_dice: "D10",
        subclass_of: null,
        saving_throws: [{ name: "Strength" }, { name: "Constitution" }],
        features: [
          {
            key: "srd_fighter_action-surge",
            name: "Action Surge",
            desc: "Take one extra action.",
            feature_type: "CLASS_LEVEL_FEATURE",
            gained_at: [{ level: 2, detail: null }],
            data_for_class_table: [],
          },
          {
            key: "srd_fighter_proficiency-bonus",
            name: "Proficiency Bonus",
            desc: "[Column data]",
            feature_type: "PROFICIENCY_BONUS",
            gained_at: [],
            data_for_class_table: [{ level: 2, column_value: "+2" }],
          },
        ],
      },
    })) as { table: Record<string, { feature_ids: string[] }> };
    expect(result.table["2"].feature_ids).toContain("action-surge");
  });

  it("emits required scalar fields (slug, name, edition, source, description, hit_die)", () => {
    const result = toClassCanonical(baseEntry({
      slug: "srd-5e_fighter",
      base: {
        key: "srd_fighter",
        name: "Fighter",
        desc: "Master of combat.",
        hit_dice: "D10",
        subclass_of: null,
        saving_throws: [{ name: "Strength" }, { name: "Constitution" }],
        features: [],
      },
    })) as Record<string, unknown>;
    expect(result.slug).toBe("srd-5e_fighter");
    expect(result.name).toBe("Fighter");
    expect(result.edition).toBe("2014");
    expect(result.source).toBe("SRD 5.1");
    expect(result.description).toBe("Master of combat.");
    expect(result.hit_die).toBe("d10");
  });

  it("emits primary_abilities, proficiencies, skill_choices, starting_equipment, subclass_level, weapon_mastery, epic_boon_level, resources defaults", () => {
    const result = toClassCanonical(baseEntry({
      base: {
        key: "srd_fighter",
        name: "Fighter",
        desc: "",
        hit_dice: "D10",
        subclass_of: null,
        saving_throws: [{ name: "Strength" }, { name: "Constitution" }],
        features: [],
      },
    })) as Record<string, unknown>;
    expect(Array.isArray(result.primary_abilities)).toBe(true);
    expect((result.primary_abilities as string[]).length).toBeGreaterThanOrEqual(1);
    expect(typeof result.proficiencies).toBe("object");
    expect(typeof result.skill_choices).toBe("object");
    expect(Array.isArray(result.starting_equipment)).toBe(true);
    expect(typeof result.subclass_level).toBe("number");
    expect(typeof result.subclass_feature_name).toBe("string");
    expect(result.weapon_mastery).toBeNull();
    expect(result.epic_boon_level).toBeNull();
    expect(Array.isArray(result.resources)).toBe(true);
    expect(result.spellcasting === null || typeof result.spellcasting === "object").toBe(true);
  });

  it("populates spellcasting from caster_type=FULL", () => {
    const result = toClassCanonical(baseEntry({
      slug: "srd-5e_wizard",
      base: {
        key: "srd_wizard",
        name: "Wizard",
        desc: "",
        hit_dice: "D6",
        subclass_of: null,
        caster_type: "FULL",
        saving_throws: [{ name: "Intelligence" }, { name: "Wisdom" }],
        features: [],
      },
    })) as { spellcasting: { caster_type: string; ability: string; preparation: string; spell_list: string } | null };
    expect(result.spellcasting).not.toBeNull();
    expect(result.spellcasting?.ability).toBe("int");
    expect(result.spellcasting?.spell_list.length).toBeGreaterThan(0);
    expect(result.spellcasting?.caster_type).toBe("full");
  });

  it("prefers the overlay spellcasting over the base caster_type-derived fallback", () => {
    const result = toClassCanonical(baseEntry({
      slug: "srd-5e_architect",
      base: {
        key: "srd_architect",
        name: "Architect",
        desc: "",
        hit_dice: "D8",
        subclass_of: null,
        // A DIFFERENT base caster_type than the overlay — overlay must win.
        caster_type: "FULL",
        saving_throws: [{ name: "Intelligence" }, { name: "Charisma" }],
        features: [],
      },
      overlay: {
        classes: {
          architect: {
            spellcasting: { caster_type: "third", ability: "cha", preparation: "known", spell_list: "architect" },
          },
        },
      },
    })) as { spellcasting: { caster_type: string; ability: string; preparation: string; spell_list: string } | null };
    expect(result.spellcasting).not.toBeNull();
    expect(result.spellcasting).toEqual({
      caster_type: "third",
      ability: "cha",
      preparation: "known",
      spell_list: "architect",
    });
  });

  it("attaches overlay choices via class-scoped key, falling back to the bare key (SP2 Plan 3)", () => {
    const out = toClassCanonical(baseEntry({
      slug: "srd-2024_fighter",
      edition: "2024",
      base: {
        key: "srd-2024_fighter",
        name: "Fighter",
        desc: "",
        hit_dice: "D10",
        subclass_of: null,
        saving_throws: [{ name: "Strength" }, { name: "Constitution" }],
        features: [
          {
            key: "srd-2024_fighter_fighting-style",
            name: "Fighting Style",
            desc: "Choose a fighting style.",
            feature_type: "CLASS_LEVEL_FEATURE",
            gained_at: [{ level: 1, detail: null }],
            data_for_class_table: [],
          },
          {
            key: "srd-2024_fighter_ability-score-improvement",
            name: "Ability Score Improvement",
            desc: "Boost an ability.",
            feature_type: "CLASS_LEVEL_FEATURE",
            gained_at: [{ level: 4, detail: null }],
            data_for_class_table: [],
          },
        ],
      },
      overlay: {
        class_features: {
          "fighter:fighting-style": { choices: [{ kind: "select-entity", id: "fighting-style", count: 1, entity_type: "optional-feature", where: { feature_type: "fighting_style", available_to: "self" } }] },
          "ability-score-improvement": { choices: [{ kind: "select-inline", id: "asi-or-feat", count: 1, options: [{ value: "asi", label: "ASI" }] }] },
        },
        classes: { fighter: { skill_choices: { count: 2, from: ["athletics", "perception"] }, subclass_feature_name: "Martial Archetype" } },
      },
    })) as {
      features_by_level: Record<string, Array<{ id?: string; choices?: Array<{ kind: string; id: string }> }>>;
      skill_choices: { count: number; from: string[] };
      subclass_feature_name: string;
    };
    const l1 = out.features_by_level["1"].find(f => f.id === "fighting-style")!;
    expect(l1.choices?.[0]).toMatchObject({ kind: "select-entity", id: "fighting-style" });
    const l4 = out.features_by_level["4"].find(f => f.id === "ability-score-improvement")!;
    expect(l4.choices?.[0]).toMatchObject({ id: "asi-or-feat" });
    expect(out.skill_choices).toEqual({ count: 2, from: ["athletics", "perception"] });
    expect(out.subclass_feature_name).toBe("Martial Archetype");
  });

  // Gate 3 of 3 for entity-level class `choices`: the merge-rule apply.
  // `ClassOverride.choices` and `classOverrideSchema.choices` have always existed,
  // so the overlay PARSES today and then the value is dropped on the floor: nothing
  // copies it onto the canonical entity. Races and backgrounds already apply theirs.
  it("applies an entity-level overlay `choices` onto the canonical class", () => {
    const out = toClassCanonical(baseEntry({
      slug: "srd-2024_bard",
      edition: "2024",
      base: {
        key: "srd-2024_bard",
        name: "Bard",
        desc: "",
        hit_dice: "D8",
        subclass_of: null,
        saving_throws: [{ name: "Dexterity" }, { name: "Charisma" }],
        features: [],
      },
      overlay: {
        classes: {
          bard: {
            choices: [{
              kind: "select-proficiency", id: "bard-instruments", label: "Musical Instruments",
              count: 3, domain: "tool", from: ["lute", "flute", "drum"],
            }],
          },
        },
      },
    })) as { choices?: Array<{ kind: string; id: string; count: number; domain: string }> };

    expect(out.choices).toHaveLength(1);
    expect(out.choices?.[0]).toMatchObject({
      kind: "select-proficiency", id: "bard-instruments", count: 3, domain: "tool",
    });
  });

  it("prefers the class-scoped overlay key over the bare key when both exist (SP2 Plan 3)", () => {
    const out = toClassCanonical(baseEntry({
      slug: "srd-2024_fighter",
      edition: "2024",
      base: {
        key: "srd-2024_fighter",
        name: "Fighter",
        desc: "",
        hit_dice: "D10",
        subclass_of: null,
        saving_throws: [{ name: "Strength" }, { name: "Constitution" }],
        features: [
          {
            key: "srd-2024_fighter_fighting-style",
            name: "Fighting Style",
            desc: "Choose a fighting style.",
            feature_type: "CLASS_LEVEL_FEATURE",
            gained_at: [{ level: 1, detail: null }],
            data_for_class_table: [],
          },
        ],
      },
      overlay: {
        class_features: {
          "fighter:fighting-style": { choices: [{ kind: "select-entity", id: "scoped-wins", count: 1, entity_type: "optional-feature", where: { feature_type: "fighting_style", available_to: "self" } }] },
          "fighting-style": { choices: [{ kind: "select-entity", id: "bare-loses", count: 1, entity_type: "optional-feature", where: { feature_type: "fighting_style", available_to: "self" } }] },
        },
      },
    })) as {
      features_by_level: Record<string, Array<{ id?: string; choices?: Array<{ id: string }> }>>;
    };
    const l1 = out.features_by_level["1"].find(f => f.id === "fighting-style")!;
    expect(l1.choices?.[0]?.id).toBe("scoped-wins");
  });

  it("backfills the subclass feature's level from subclass_level when gained_at is empty (2024 Bard data gap)", () => {
    const out = toClassCanonical(baseEntry({
      slug: "srd-2024_bard",
      edition: "2024",
      base: {
        key: "srd-2024_bard",
        name: "Bard",
        desc: "",
        hit_dice: "D8",
        subclass_of: null,
        saving_throws: [{ name: "Dexterity" }, { name: "Charisma" }],
        features: [
          {
            // Mirrors the upstream defect: the subclass feature exists but
            // carries no gained_at level (every sibling class has [{level:3}]).
            key: "srd-2024_bard_bard-subclass",
            name: "Bard Subclass",
            desc: "You gain a Bard subclass of your choice.",
            feature_type: "CLASS_LEVEL_FEATURE",
            gained_at: [],
            data_for_class_table: [],
          },
        ],
      },
      overlay: {
        class_features: {
          "bard:bard-subclass": { choices: [{ kind: "select-entity", id: "subclass", count: 1, entity_type: "subclass", where: { parent_class: "self" } }] },
        },
        classes: { bard: { subclass_feature_name: "Bard Subclass" } },
      },
    })) as {
      features_by_level: Record<string, Array<{ id?: string; name: string; choices?: Array<{ kind: string; id: string; entity_type?: string }> }>>;
      table: Record<string, { feature_ids: string[] }>;
    };
    const l3 = out.features_by_level["3"]?.find(f => f.id === "bard-subclass");
    expect(l3, "Bard Subclass should bucket at L3").toBeDefined();
    expect(l3!.choices?.[0]).toMatchObject({ kind: "select-entity", id: "subclass", entity_type: "subclass" });
    expect(out.table["3"].feature_ids).toContain("bard-subclass");
  });

  it("does NOT backfill non-subclass features that lack gained_at (spell-list pseudo-features stay out)", () => {
    const out = toClassCanonical(baseEntry({
      slug: "srd-2024_bard",
      edition: "2024",
      base: {
        key: "srd-2024_bard",
        name: "Bard",
        desc: "",
        hit_dice: "D8",
        subclass_of: null,
        saving_throws: [{ name: "Dexterity" }, { name: "Charisma" }],
        features: [
          {
            key: "srd-2024_bard_bard-spell-list",
            name: "Bard Spell List",
            desc: "The Bard Spell List.",
            feature_type: "CLASS_LEVEL_FEATURE",
            gained_at: [],
            data_for_class_table: [],
          },
        ],
      },
      overlay: { classes: { bard: { subclass_feature_name: "Bard Subclass" } } },
    })) as { features_by_level: Record<string, Array<{ name: string }>> };
    const names = Object.values(out.features_by_level).flat().map(f => f.name);
    expect(names).not.toContain("Bard Spell List");
  });

  // -------------------------------------------------------------------------
  // Task 6a: 2024 Core-Traits proficiency parsing.
  //
  // 2024 classes carry weapon/armor proficiencies in a `CORE_TRAITS_TABLE`
  // markdown table (`|Weapon Proficiencies|Simple and Martial weapons|`), not
  // the 2014 `PROFICIENCIES` prose feature (`**Weapons:** …`). The generator
  // must read the table so 2024 martials emit real categories instead of the
  // schema-appeasing `weapons.fixed: ["unarmed"]` fallback.
  // -------------------------------------------------------------------------
  describe("2024 Core-Traits proficiencies (Task 6a)", () => {
    const coreTraits = (rows: string): {
      key: string; name: string; desc: string; feature_type: string;
      gained_at: never[]; data_for_class_table: never[];
    } => ({
      key: "core-traits",
      name: "Core Traits",
      desc: `|||\n|---|---|\n${rows}`,
      feature_type: "CORE_TRAITS_TABLE",
      gained_at: [],
      data_for_class_table: [],
    });

    it("2024 Fighter: reads Simple/Martial weapons + full armor from the Core-Traits table", () => {
      const result = toClassCanonical(baseEntry({
        slug: "srd-2024_fighter",
        edition: "2024",
        base: {
          key: "srd-2024_fighter",
          name: "Fighter",
          desc: "",
          hit_dice: "D10",
          subclass_of: null,
          saving_throws: [{ name: "Strength" }, { name: "Constitution" }],
          features: [
            coreTraits(
              "|Weapon Proficiencies|Simple and Martial weapons|\n" +
              "|Armor Training|Light, Medium, and Heavy armor and Shields|\n",
            ),
          ],
        },
      })) as { proficiencies: { armor: string[]; weapons: { fixed?: string[]; categories?: string[] } } };
      expect(result.proficiencies.weapons.categories).toEqual(["simple", "martial"]);
      expect(result.proficiencies.weapons.fixed).toBeUndefined();
      expect(result.proficiencies.armor).toEqual(["light", "medium", "heavy", "shield"]);
    });

    it("2024 Wizard: Simple weapons only + no armor (Armor Training: None → [])", () => {
      const result = toClassCanonical(baseEntry({
        slug: "srd-2024_wizard",
        edition: "2024",
        base: {
          key: "srd-2024_wizard",
          name: "Wizard",
          desc: "",
          hit_dice: "D6",
          subclass_of: null,
          saving_throws: [{ name: "Intelligence" }, { name: "Wisdom" }],
          features: [
            coreTraits(
              "|Weapon Proficiencies|Simple weapons|\n" +
              "|Armor Training|None|\n",
            ),
          ],
        },
      })) as { proficiencies: { armor: string[]; weapons: { fixed?: string[]; categories?: string[] } } };
      expect(result.proficiencies.weapons.categories).toEqual(["simple"]);
      expect(result.proficiencies.weapons.fixed).toBeUndefined();
      expect(result.proficiencies.armor).toEqual([]);
    });

    it("2024 Monk: conditional 'Martial … that have the Light property' → [simple, martial] (documented over-grant)", () => {
      const result = toClassCanonical(baseEntry({
        slug: "srd-2024_monk",
        edition: "2024",
        base: {
          key: "srd-2024_monk",
          name: "Monk",
          desc: "",
          hit_dice: "D8",
          subclass_of: null,
          saving_throws: [{ name: "Strength" }, { name: "Dexterity" }],
          features: [
            coreTraits(
              "|Weapon Proficiencies|Simple weapons and Martial weapons that have the Light property|\n" +
              "|Armor Training|None|\n",
            ),
          ],
        },
      })) as { proficiencies: { armor: string[]; weapons: { fixed?: string[]; categories?: string[] } } };
      expect(result.proficiencies.weapons.categories).toEqual(["simple", "martial"]);
      expect(result.proficiencies.weapons.fixed).toBeUndefined();
      expect(result.proficiencies.armor).toEqual([]);
    });

    it("2014 regression (categories): PROFICIENCIES prose still parses 'Simple weapons, martial weapons' + 'All armor, shields'", () => {
      const result = toClassCanonical(baseEntry({
        slug: "srd-5e_fighter",
        edition: "2014",
        base: {
          key: "srd_fighter",
          name: "Fighter",
          desc: "",
          hit_dice: "D10",
          subclass_of: null,
          saving_throws: [{ name: "Strength" }, { name: "Constitution" }],
          features: [
            {
              key: "srd_fighter_proficiencies",
              name: "Proficiencies",
              desc: "**Armor:** All armor, shields\n**Weapons:** Simple weapons, martial weapons\n**Tools:** None\n**Skills:** Choose two skills from Acrobatics, Athletics, and Survival",
              feature_type: "PROFICIENCIES",
              gained_at: [],
              data_for_class_table: [],
            },
          ],
        },
      })) as { proficiencies: { armor: string[]; weapons: { fixed?: string[]; categories?: string[] } } };
      expect(result.proficiencies.weapons.categories).toEqual(["simple", "martial"]);
      expect(result.proficiencies.weapons.fixed).toBeUndefined();
      expect(result.proficiencies.armor).toEqual(["shield", "light", "medium", "heavy"]);
    });

    it("2014 regression (specific weapons): PROFICIENCIES prose still emits weapons.fixed for casters", () => {
      const result = toClassCanonical(baseEntry({
        slug: "srd-5e_wizard",
        edition: "2014",
        base: {
          key: "srd_wizard",
          name: "Wizard",
          desc: "",
          hit_dice: "D6",
          subclass_of: null,
          saving_throws: [{ name: "Intelligence" }, { name: "Wisdom" }],
          features: [
            {
              key: "srd_wizard_proficiencies",
              name: "Proficiencies",
              desc: "**Weapons:** Daggers, darts, slings, quarterstaffs, light crossbows",
              feature_type: "PROFICIENCIES",
              gained_at: [],
              data_for_class_table: [],
            },
          ],
        },
      })) as { proficiencies: { weapons: { fixed?: string[]; categories?: string[] } } };
      expect(result.proficiencies.weapons.fixed).toEqual(["daggers", "darts", "slings", "quarterstaffs", "light crossbows"]);
      expect(result.proficiencies.weapons.categories).toBeUndefined();
    });

    it("no-data fallback: neither PROFICIENCIES prose nor CORE_TRAITS_TABLE → weapons.fixed ['unarmed']", () => {
      const result = toClassCanonical(baseEntry({
        slug: "srd-2024_ghost",
        edition: "2024",
        base: {
          key: "srd-2024_ghost",
          name: "Ghost",
          desc: "",
          hit_dice: "D8",
          subclass_of: null,
          saving_throws: [{ name: "Wisdom" }, { name: "Charisma" }],
          features: [
            {
              key: "srd-2024_ghost_spooky",
              name: "Spooky",
              desc: "You are spooky.",
              feature_type: "CLASS_LEVEL_FEATURE",
              gained_at: [{ level: 1, detail: null }],
              data_for_class_table: [],
            },
          ],
        },
      })) as { proficiencies: { armor: string[]; weapons: { fixed?: string[]; categories?: string[] } } };
      expect(result.proficiencies.weapons.fixed).toEqual(["unarmed"]);
      expect(result.proficiencies.weapons.categories).toBeUndefined();
    });
  });

  it("attaches overlay resources to the matching class feature", () => {
    const result = toClassCanonical(baseEntry({
      slug: "srd-5e_barbarian",
      base: {
        key: "srd_barbarian",
        name: "Barbarian",
        desc: "",
        hit_dice: "D12",
        subclass_of: null,
        saving_throws: [{ name: "Strength" }, { name: "Constitution" }],
        features: [
          {
            key: "srd_barbarian_rage",
            name: "Rage",
            desc: "You can enter a rage as a bonus action.",
            feature_type: "CLASS_LEVEL_FEATURE",
            gained_at: [{ level: 1, detail: null }],
            data_for_class_table: [],
          },
        ],
      },
      overlay: {
        class_features: {
          rage: {
            resources: [{
              id: "barbarian:rage", name: "Rage", max_formula: "2", reset: "long-rest",
            }],
          },
        },
      },
    })) as { features_by_level: Record<string, Array<{ name: string; resources?: Array<{ id: string }> }>> };
    const rage = Object.values(result.features_by_level).flat().find((f) => f.name === "Rage");
    expect(rage?.resources?.[0]?.id).toBe("barbarian:rage");
  });

  it("maps overlay action_cost onto the matching class feature's `action` field (Second Wind economy)", () => {
    const result = toClassCanonical(baseEntry({
      slug: "srd-2024_fighter",
      edition: "2024",
      base: {
        key: "srd-2024_fighter",
        name: "Fighter",
        desc: "",
        hit_dice: "D10",
        subclass_of: null,
        saving_throws: [{ name: "Strength" }, { name: "Constitution" }],
        features: [
          {
            key: "srd-2024_fighter_second-wind",
            name: "Second Wind",
            desc: "You have a limited well of stamina you can draw on.",
            feature_type: "CLASS_LEVEL_FEATURE",
            gained_at: [{ level: 1, detail: null }],
            data_for_class_table: [],
          },
        ],
      },
      overlay: {
        class_features: {
          "second-wind": { action_cost: "bonus-action" },
        },
      },
    })) as { features_by_level: Record<string, Array<{ name: string; action?: string }>> };
    const secondWind = Object.values(result.features_by_level).flat().find((f) => f.name === "Second Wind");
    expect(secondWind?.action).toBe("bonus-action");
  });
});

// P3a task 8: a class's "Tools" prose is sometimes a CHOICE ("Three musical
// instruments of your choice"), and it used to land in `tools.fixed` verbatim,
// so the sheet showed a fake fixed proficiency literally named after the prose.
// The real picks are authored as overlay `choices` (task 7); these cases pin
// that the prose stops becoming a grant WITHOUT taking genuinely fixed tools
// (Herbalism kit, Thieves' tools) down with it.
describe("class tool prose: choice prose drops per item, fixed prose survives [P3a task 8]", () => {
  /**
   * Drives a Tools value through the ONLY exported entry point. The inline tool
   * parse lives in module-private `parseProficienciesProse`, so the value has to
   * arrive the way the real pipeline delivers it: a 2014 `PROFICIENCIES` prose
   * feature (`**Tools:** …`) or a 2024 `CORE_TRAITS_TABLE` row
   * (`|Tool Proficiencies|…|`).
   */
  const runTools = (
    edition: "2014" | "2024",
    bare: string,
    toolsValue: string,
    overlay: unknown = null,
  ) => {
    const prefix = edition === "2014" ? "srd-5e" : "srd-2024";
    const slug = `${prefix}_class_${bare}`;
    const feature = edition === "2014"
      ? {
        key: `${slug}_proficiencies`,
        name: "Proficiencies",
        desc: `**Armor:** Light armor\n**Weapons:** Simple weapons\n**Tools:** ${toolsValue}\n**Skills:** Choose any three`,
        feature_type: "PROFICIENCIES",
        gained_at: [],
        data_for_class_table: [],
      }
      : {
        key: `${slug}_core-traits`,
        name: "Core Traits",
        desc: `|Armor Training|Light armor|\n|Weapon Proficiencies|Simple weapons|\n|Tool Proficiencies|${toolsValue}|\n|Skill Proficiencies|Choose any three|`,
        feature_type: "CORE_TRAITS_TABLE",
        gained_at: [],
        data_for_class_table: [],
      };
    return toClassCanonical(baseEntry({
      slug,
      edition,
      base: {
        key: slug,
        name: bare[0].toUpperCase() + bare.slice(1),
        desc: "",
        hit_dice: "D8",
        subclass_of: null,
        saving_throws: [{ name: "Dexterity" }, { name: "Charisma" }],
        features: [feature],
      },
      overlay,
    })) as {
      proficiencies: { tools?: { fixed: string[] } };
      choices?: Array<{ id: string }>;
    };
  };

  // Binds tasks 6a and 8, NOT 7 and 8: the overlay here is SYNTHETIC, so a
  // mis-keyed real overlay entry would still pass. The real-overlay evidence is
  // the `real overlay:` describe below. What this pins is that the two halves
  // land together: a partial implementation yields "fake fixed row AND a picker"
  // or "neither".
  it("drops Bard's instrument prose from tools.fixed while the overlay choice supplies the picker", () => {
    const out = runTools("2014", "bard", "Three musical instruments of your choice", {
      class_features: null,
      classes: {
        bard: {
          choices: [{
            kind: "select-proficiency",
            id: "tool",
            label: "Musical Instruments",
            count: 3,
            domain: "tool",
            from: MUSICAL_INSTRUMENTS,
          }],
        },
      },
    });
    expect(out.proficiencies.tools).toBeUndefined();
    expect(out.choices?.some((c) => c.id === "tool")).toBe(true);
  });

  // The whole justification for filtering PER ITEM rather than rejecting the
  // whole string the way background-merge's `parseToolProf` does. None of the 8
  // live strings is mixed, so nothing else in the suite can catch a regression
  // to the whole-string form.
  it("keeps the fixed half of a MIXED grant and drops only the choice item", () => {
    const out = runTools("2014", "rogue", "Thieves' tools, choose one artisan's tool");
    expect(out.proficiencies.tools).toEqual({ fixed: ["Thieves' tools"] });
  });

  // All 8 non-null `Tools` values shipped today, hardcoded rather than read from
  // src/srd/data/runtime/class.*.json: a future regen empties four of them, and a
  // test that reads its own expectations out of regenerated output proves nothing.
  interface LiveCase {
    label: string;
    edition: "2014" | "2024";
    bare: string;
    prose: string;
    /** null = the whole value was choice prose, so `tools` must be absent. */
    expected: string[] | null;
  }
  const LIVE: LiveCase[] = [
    { label: "bard 2014 (drop)", edition: "2014", bare: "bard", prose: "Three musical instruments of your choice", expected: null },
    { label: "druid 2014 (keep)", edition: "2014", bare: "druid", prose: "Herbalism kit", expected: ["Herbalism kit"] },
    { label: "monk 2014 (drop)", edition: "2014", bare: "monk", prose: "Choose one type of artisan’s tools or one musical instrument", expected: null },
    { label: "rogue 2014 (keep, curly apostrophe)", edition: "2014", bare: "rogue", prose: "Thieves’ tools", expected: ["Thieves’ tools"] },
    { label: "bard 2024 (drop)", edition: "2024", bare: "bard", prose: "Choose 3 Musical Instruments", expected: null },
    { label: "druid 2024 (keep)", edition: "2024", bare: "druid", prose: "Herbalism Kit", expected: ["Herbalism Kit"] },
    { label: "monk 2024 (drop)", edition: "2024", bare: "monk", prose: "Choose one type of Artisan's Tools or Musical Instrument", expected: null },
    { label: "rogue 2024 (keep)", edition: "2024", bare: "rogue", prose: "Thieves' Tools", expected: ["Thieves' Tools"] },
  ];

  it.each(LIVE)("live Tools string: $label", ({ edition, bare, prose, expected }) => {
    const out = runTools(edition, bare, prose);
    if (expected === null) expect(out.proficiencies.tools).toBeUndefined();
    else expect(out.proficiencies.tools).toEqual({ fixed: expected });
  });

  // The divergence comment at the filter claims class-merge and background-merge
  // share the same choice VOCABULARY and differ only in PLACEMENT, and the standing
  // decision NOT to widen the regex rests on that claim. The two are a verbatim
  // COPY, not a shared constant, and nothing else links them: a one-sided
  // vocabulary edit would silently falsify the comment and the decision together.
  // Guarded at SOURCE level rather than by exporting the two module-private
  // regexes, which would widen the surface of two modules to buy one assertion.
  it("shares its choice-prose vocabulary verbatim with background-merge's parseToolProf", () => {
    const read = (rel: string) => fs.readFileSync(path.resolve(__dirname, "../../../tools/srd-canonical/merger-rules", rel), "utf8");

    // Anchored to the NAMED constant, so this can never drift away from the literal
    // the per-item filter actually uses. The constant's DEFINITION alone does not
    // establish that: dnd5e has neither `noUnusedLocals` nor eslint, so inlining a
    // divergent literal at the filter site while leaving the constant defined
    // typechecks and passes every other assertion in this suite. The use-site
    // anchor below is what closes that mutant, and it is load-bearing · without it
    // the sentence above is false.
    expect(
      read("class-merge.ts"),
      "the per-item filter must go through TOOL_CHOICE_PROSE, not an inlined literal",
    ).toContain("!TOOL_CHOICE_PROSE.test(s)");

    const classLiteral = /const TOOL_CHOICE_PROSE = (.+);/.exec(read("class-merge.ts"))?.[1];
    // Scoped to parseToolProf's body, then the regex it `.test()`s the desc with.
    const bgBody = /export function parseToolProf\([\s\S]*?\n}/.exec(read("background-merge.ts"))?.[0] ?? "";
    const bgLiteral = /(\/[^\n]*?\/i)\.test\(desc\)/.exec(bgBody)?.[1];

    // Both `toBeDefined` guards are load-bearing: if a rename breaks either anchor,
    // the equality below would compare undefined to undefined and pass VACUOUSLY.
    expect(classLiteral, "TOOL_CHOICE_PROSE literal not found in class-merge.ts").toBeDefined();
    expect(bgLiteral, "choice-prose literal not found in parseToolProf").toBeDefined();
    // Whole-literal equality, so the `i` flag is compared too, not just `.source`.
    expect(classLiteral).toBe(bgLiteral);
  });
});

// P3a task 7: the REAL overlays, not a hand-built one. The authored Bard and
// Monk tool pools are inert until the next SRD regeneration (which this phase
// does not run), so driving the shipped YAML through loadOverlay +
// classMergeRule.pickOverlay + toClassCanonical is the only evidence that what
// was authored actually lands on the canonical class.
describe("real overlay: entity-level tool `choices` for Bard and Monk [P3a task 7]", () => {
  const OVERLAYS = {
    "2014": path.resolve(__dirname, "../../../tools/srd-canonical/overlays/srd-5e.yaml"),
    "2024": path.resolve(__dirname, "../../../tools/srd-canonical/overlays/srd-2024.yaml"),
  } as const;

  const drive = async (edition: "2014" | "2024", bare: string, hitDice: string) => {
    const overlay = await loadOverlay(OVERLAYS[edition]);
    const prefix = edition === "2014" ? "srd-5e" : "srd-2024";
    const entrySlug = `${prefix}_class_${bare}`;
    return toClassCanonical(baseEntry({
      slug: entrySlug,
      edition,
      base: {
        key: entrySlug,
        name: bare[0].toUpperCase() + bare.slice(1),
        desc: "",
        hit_dice: hitDice,
        subclass_of: null,
        saving_throws: [{ name: "Dexterity" }, { name: "Charisma" }],
        features: [],
      },
      overlay: classMergeRule.pickOverlay(overlay, entrySlug) as never,
    })) as { choices?: Array<{ kind: string; id: string; count: number; domain: string; from?: string[] }> };
  };

  it.each(["2014", "2024"] as const)("Bard %s gets a count-3 tool pick over the 10 musical instruments", async (edition) => {
    const out = await drive(edition, "bard", "D8");
    expect(out.choices).toHaveLength(1);
    expect(out.choices?.[0]).toMatchObject({
      kind: "select-proficiency", id: "tool", domain: "tool", count: 3,
    });
    expect(out.choices?.[0]?.from).toEqual(MUSICAL_INSTRUMENTS);
  });

  it.each(["2014", "2024"] as const)("Monk %s gets a count-1 tool pick over artisan's tools plus instruments", async (edition) => {
    const out = await drive(edition, "monk", "D8");
    expect(out.choices).toHaveLength(1);
    expect(out.choices?.[0]).toMatchObject({
      kind: "select-proficiency", id: "tool", domain: "tool", count: 1,
    });
    expect(out.choices?.[0]?.from).toHaveLength(27);
    expect(out.choices?.[0]?.from).toEqual([...ARTISANS_TOOLS, ...MUSICAL_INSTRUMENTS]);
  });
});

/**
 * R4-G7 T5 · the three class-pipeline changes of spec §8.1 items 1, 2 and 3.
 *
 * 1. `effects` reaches the emitted feature. The overlay's `class_features` map is keyed
 *    `<class>:<feature-slug>` with NO level component and `bucketFeaturesByLevel` emits ONE overlay
 *    record into EVERY `gained_at` bucket, which is why the SRD 5e Fighter's whole 5 / 11 / 20
 *    Extra Attack progression has to live inside one effect (`scales_at`) rather than one effect per
 *    copy: measured below on a two-level feature.
 * 2. The 2024 NAME normaliser. Both upstream typos are ONE site each in `classes.2024.json`
 *    (MEASURED at T5: `unarmoed` 1, `studdied` 1; both 0 in `classes.2014.json`), and the 2024 Monk's
 *    carrier is a single CLASS_LEVEL_FEATURE that ALSO owns 19 table cells, so the rename has to land
 *    before BOTH the slug/name emit and the column label or the bundle keeps a mixed spelling.
 * 3. The `classes:` saving-throw override, the ONE upstream pair the SRD block gets wrong.
 */
describe("class-merge: R4-G7 T5 · effects, the 2024 name normaliser, saving_throws", () => {
  const featured = (name: string, levels: number[], cells: Array<{ level: number; column_value: string }> = []) => ({
    key: `srd_x_${name.toLowerCase().replace(/\s+/g, "-")}`,
    name,
    desc: `${name} does a thing.`,
    feature_type: "CLASS_LEVEL_FEATURE",
    gained_at: levels.map((level) => ({ level, detail: null })),
    data_for_class_table: cells,
  });

  const drive = (edition: "2014" | "2024", bare: string, features: unknown[], overlay: unknown = null) =>
    toClassCanonical(baseEntry({
      slug: `${edition === "2014" ? "srd-5e" : "srd-2024"}_class_${bare}`,
      edition,
      base: {
        key: `srd_${bare}`,
        name: bare[0].toUpperCase() + bare.slice(1),
        desc: "",
        hit_dice: "D8",
        subclass_of: null,
        saving_throws: [{ name: "Dexterity" }, { name: "Strength" }],
        features,
      },
      overlay,
    })) as {
      saving_throws: string[];
      table: Record<string, { columns?: Record<string, string | number>; feature_ids: string[] }>;
      features_by_level: Record<string, Array<{ id?: string; name: string; effects?: unknown[] }>>;
    };

  it("emits an authored overlay effects array onto the feature, in EVERY level bucket it is gained at", () => {
    const out = drive("2014", "fighter", [featured("Extra Attack", [5, 11, 20])], {
      class_features: {
        "fighter:extra-attack": {
          effects: [{ kind: "extra-attack", count: 1, scales_at: [{ level: 11, count: 2 }, { level: 20, count: 3 }] }],
        },
      },
      classes: null,
    });
    for (const lvl of ["5", "11", "20"]) {
      expect(out.features_by_level[lvl]?.[0]?.effects, `level ${lvl}`)
        .toEqual([{ kind: "extra-attack", count: 1, scales_at: [{ level: 11, count: 2 }, { level: 20, count: 3 }] }]);
    }
  });

  it("leaves a feature with no authored effects without an `effects` key at all", () => {
    const out = drive("2014", "fighter", [featured("Second Wind", [1])], { class_features: {}, classes: null });
    expect(Object.keys(out.features_by_level["1"][0])).not.toContain("effects");
  });

  it("renames the two 2024 upstream typos in the feature name, the id, the table row and the COLUMN LABEL", () => {
    const out = drive("2024", "monk", [
      featured("Unarmoed Movement", [2, 2], [{ level: 2, column_value: "+10 ft." }]),
      featured("Studdied Attacks", [13]),
    ]);
    expect(out.features_by_level["2"][0]).toMatchObject({ id: "unarmored-movement", name: "Unarmored Movement" });
    expect(out.table["2"].feature_ids).toContain("unarmored-movement");
    expect(Object.keys(out.table["2"].columns ?? {})).toContain("Unarmored Movement");
    expect(out.features_by_level["13"][0]).toMatchObject({ id: "studied-attacks", name: "Studied Attacks" });
    expect(out.table["13"].feature_ids).toContain("studied-attacks");
  });

  it("looks the RENAMED slug up in the overlay, so the Monk speed-bonus is keyed monk:unarmored-movement", () => {
    const out = drive("2024", "monk", [featured("Unarmoed Movement", [2])], {
      class_features: { "monk:unarmored-movement": { effects: [{ kind: "speed-bonus", mode: "walk", value: 10 }] } },
      classes: null,
    });
    expect(out.features_by_level["2"][0].effects).toEqual([{ kind: "speed-bonus", mode: "walk", value: 10 }]);
  });

  it("passes an unknown 2024 feature name through untouched, and does not rename in the 2014 pipeline", () => {
    const out2024 = drive("2024", "monk", [featured("Deflect Attacks", [3])]);
    expect(out2024.features_by_level["3"][0]).toMatchObject({ id: "deflect-attacks", name: "Deflect Attacks" });
    // Scoped to the 2024 pipeline, where both typos live: `classes.2014.json` carries 0 of either.
    const out2014 = drive("2014", "monk", [featured("Unarmoed Movement", [2])]);
    expect(out2014.features_by_level["2"][0].name).toBe("Unarmoed Movement");
  });

  it("takes the saving-throw pair from the classes: overlay when one is authored", () => {
    const out = drive("2024", "fighter", [], {
      class_features: null,
      classes: { fighter: { saving_throws: ["str", "con"] } },
    });
    expect(out.saving_throws).toEqual(["str", "con"]);
    // Control: with no override the upstream pair (Dexterity, Strength) survives unchanged.
    expect(drive("2024", "fighter", []).saving_throws).toEqual(["dex", "str"]);
  });
});
