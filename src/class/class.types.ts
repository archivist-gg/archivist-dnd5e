import type { Feature, Ability, SkillSlug, Resource, Choice } from "@archivist-gg/dnd5e";
import type { StartingEquipmentEntry, StartingGold } from "@archivist-gg/dnd5e/types/equipment-grant";
export type { StartingEquipmentEntry, StartingGold } from "@archivist-gg/dnd5e/types/equipment-grant";
import type { SelectionPool, PoolGrant, TabDecl } from "@archivist-gg/dnd5e/types/selection-pool";
import type { AdditionalSpellsEntry, ProgressionEntry }
  from "@archivist-gg/dnd5e/schemas/entity-extras-schema";

import type { Edition } from "@archivist-gg/dnd5e/types/edition";
export type { Edition };
export type ArmorCategory = "light" | "medium" | "heavy" | "shield";
export type WeaponCategory = "simple" | "martial";

export interface WeaponProficiency {
  fixed?: string[];
  categories?: WeaponCategory[];
  conditional?: Array<{ category: WeaponCategory; where_property: string[] }>;
}

export interface ToolProficiency {
  fixed?: string[];
  choice?: { count: number; from: string[] };
}

export interface ClassProficiencies {
  armor: ArmorCategory[];
  weapons: WeaponProficiency;
  tools?: ToolProficiency;
}

export interface SkillChoices {
  count: number;
  from: SkillSlug[];
}

// CasterType is declared ONCE in schemas/caster-type-schema.ts; re-exported here so existing importers keep working. Never redeclare it.
import type { CasterType } from "@archivist-gg/dnd5e/schemas/caster-type-schema";
export type { CasterType };
export type SpellcastingPreparation = "known" | "prepared";

export interface SpellcastingConfig {
  caster_type: CasterType;
  ability: Ability;
  preparation: SpellcastingPreparation;
  spell_list: string;
}

/** A SUBCLASS spellcasting block is a partial (R4-G1a D7): the converter emits {ability} alone on subclasses that
 *  only name a save ability (Path of the Giant, Four Elements) and {ability, caster_type} on the third-casters
 *  (Eldritch Knight, Arcane Trickster). The CLASS block stays fully required. */
export interface SubclassSpellcastingConfig {
  ability: Ability;
  caster_type?: CasterType;
  preparation?: SpellcastingPreparation;
  spell_list?: string;
}

export interface WeaponMasteryConfig {
  /** OPTIONAL since R4-G1b (§2.7): the converter must be able to re-emit a countless mastery object
   *  (G5 owns counts-from-prose). Declaration 2 of 3 — the schema and the generator's COPIED
   *  `interface WeaponMasteryConfig` in tools/srd-canonical/merger-rules/class-merge.ts are the others. */
  starting_count?: number;
  scaling?: Record<number, number>;
}

export interface ClassTableRow {
  prof_bonus: number;
  columns?: Record<string, string | number>;
  feature_ids: string[];
}

export interface ClassEntity {
  slug: string;
  name: string;
  edition: Edition;
  source: string;
  description: string;
  hit_die: string;
  primary_abilities: Ability[];
  saving_throws: Ability[];
  proficiencies: ClassProficiencies;
  skill_choices: SkillChoices;
  /**
   * Entity-level decisions the class grants at L1, mirroring the long-standing
   * `RaceEntity.choices` / `BackgroundEntity.choices` precedent. Classes were the
   * sole holdout: a tool pick like the Bard's "three musical instruments of your
   * choice" belongs to the CLASS, not to any one of its L1 features, so before
   * this there was nowhere to author it.
   */
  choices?: Choice[];
  starting_equipment: StartingEquipmentEntry[];
  starting_gold?: StartingGold;
  spellcasting: SpellcastingConfig | null;
  subclass_level: number;
  subclass_feature_name: string;
  weapon_mastery: WeaponMasteryConfig | null;
  epic_boon_level: number | null;
  table: Record<number, ClassTableRow>;
  features_by_level: Record<number, Feature[]>;
  resources: Resource[];
  selection_pools?: SelectionPool[];
  pool_grants?: PoolGrant[];
  tabs?: TabDecl[];
  /** Converter/bundle extras declared by class.schema.ts §2.7; all optional, none read today. */
  rendering_hint?: string;
  has_fluff?: boolean;
  has_fluff_images?: boolean;
  table_col_labels?: string[];
  starting_equipment_additional_from_background?: boolean;
  /** RAW 5etools passthrough (four measured arities incl. `{}`): `unknown` mirrors `z.unknown()`. */
  multiclassing?: unknown;
  cantrip_progression?: number[];
  prepared_spells?: string;
  prepared_spells_change?: string;
  prepared_spells_progression?: number[];
  spells_known_progression?: number[];
  spells_known_progression_fixed?: number[];
  /** ⚠️ BOOLEAN, not an array (finding 1). */
  spells_known_progression_fixed_allow_lower_level?: boolean;
  /** ⚠️ TWO-DEEP record: level -> spell level -> count (finding 1). */
  spells_known_progression_fixed_by_level?: Record<string, Record<string, number>>;
  feat_progression?: ProgressionEntry[];
  optionalfeature_progression?: ProgressionEntry[];
  additional_spells?: AdditionalSpellsEntry[];
  /** One wikilink, or an array of them for the multi-fluff-image emit. */
  image?: string | string[];
}
