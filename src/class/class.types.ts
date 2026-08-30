import type { Feature, Ability, SkillSlug, Resource, Choice } from "@archivist-gg/dnd5e";
import type { StartingEquipmentEntry, StartingGold } from "@archivist-gg/dnd5e/types/equipment-grant";
export type { StartingEquipmentEntry, StartingGold } from "@archivist-gg/dnd5e/types/equipment-grant";
import type { SelectionPool, PoolGrant, TabDecl } from "@archivist-gg/dnd5e/types/selection-pool";

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
  starting_count: number;
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
}
