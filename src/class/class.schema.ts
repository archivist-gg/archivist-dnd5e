import { z } from "zod";
import { featureSchema } from "@archivist-gg/dnd5e/schemas/feature-schema";
import { choiceSchema } from "@archivist-gg/dnd5e/schemas/choice-schema";
import { resourceSchema } from "@archivist-gg/dnd5e/schemas/resource-schema";
import { startingEquipmentEntrySchema, startingGoldSchema } from "@archivist-gg/dnd5e/schemas/equipment-grant-schema";
import { selectionPoolSchema, poolGrantSchema, tabDeclSchema } from "@archivist-gg/dnd5e/schemas/selection-pool-schema";
import { casterTypeEnum } from "@archivist-gg/dnd5e/schemas/caster-type-schema";
import { imageField, additionalSpellsEntrySchema, progressionSchema }
  from "@archivist-gg/dnd5e/schemas/entity-extras-schema";

const abilityEnum = z.enum(["str", "dex", "con", "int", "wis", "cha"]);
const skillEnum = z.enum([
  "acrobatics", "animal-handling", "arcana", "athletics", "deception",
  "history", "insight", "intimidation", "investigation", "medicine",
  "nature", "perception", "performance", "persuasion", "religion",
  "sleight-of-hand", "stealth", "survival",
]);
const armorCategoryEnum = z.enum(["light", "medium", "heavy", "shield"]);
const weaponCategoryEnum = z.enum(["simple", "martial"]);
const hitDieEnum = z.enum(["d6", "d8", "d10", "d12"]);
const editionEnum = z.enum(["2014", "2024"]);

const weaponProficiencySchema = z.object({
  fixed: z.array(z.string()).optional(),
  categories: z.array(weaponCategoryEnum).optional(),
  conditional: z.array(z.object({
    category: weaponCategoryEnum,
    where_property: z.array(z.string()).nonempty(),
  })).optional(),
}).refine(
  (w) => (w.fixed?.length ?? 0) + (w.categories?.length ?? 0) + (w.conditional?.length ?? 0) > 0,
  { message: "weapon proficiency must declare at least one of fixed/categories/conditional" }
);

const toolProficiencySchema = z.object({
  fixed: z.array(z.string()).optional(),
  choice: z.object({
    count: z.number().int().positive(),
    from: z.array(z.string()).nonempty(),
  }).optional(),
}).refine((t) => (t.fixed?.length ?? 0) > 0 || t.choice !== undefined, {
  message: "tool proficiency must declare fixed or choice",
});

const spellcastingSchema = z.object({
  caster_type: casterTypeEnum,
  ability: abilityEnum,
  preparation: z.enum(["known", "prepared"]),
  spell_list: z.string().min(1),
});

const weaponMasterySchema = z.object({
  // §2.7's ONE deliberate relaxation, and the phase's only non-additive edit. Measured: `starting_count`
  // has ZERO read sites in either repo, all 24 SRD class records are `weapon_mastery: null`, and the
  // converter population is zero too (26 of 28 class docs null; both object carriers DO carry the count).
  // It exists so the converter can re-emit a countless mastery object later. R4-G5 did NOT make it read: §6 takes
  // the count from the class TABLE COLUMN instead (`COUNT_COLUMNS` in `pc.table-column.ts`), because the column
  // is the truth on BOTH corpora, and `count.column` on the choice itself is booked to the G7 converter handoff.
  // `starting_count` therefore still has ZERO read sites.
  // A THREE-declaration edit (finding 11): here, `class.types.ts`, and the generator's COPIED
  // `interface WeaponMasteryConfig` in tools/srd-canonical/merger-rules/class-merge.ts.
  starting_count: z.number().int().nonnegative().optional(),
  scaling: z.record(z.string(), z.number().int().nonnegative()).optional(),
});

const classTableRowSchema = z.object({
  prof_bonus: z.number().int().positive(),
  columns: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
  feature_ids: z.array(z.string()),
});

export const classEntitySchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1),
  edition: editionEnum,
  source: z.string().min(1),
  description: z.string(),
  hit_die: hitDieEnum,
  primary_abilities: z.array(abilityEnum).nonempty(),
  saving_throws: z.array(abilityEnum).length(2),
  proficiencies: z.object({
    armor: z.array(armorCategoryEnum),
    weapons: weaponProficiencySchema,
    tools: toolProficiencySchema.optional(),
  }),
  skill_choices: z.object({
    count: z.number().int().positive(),
    from: z.array(skillEnum).nonempty(),
  }),
  // Zod strips unknown keys by default, so without this declaration an authored
  // `choices:` block is silently deleted by `parseClass`. Same spelling as
  // `raceEntitySchema` / `backgroundEntitySchema`.
  choices: z.array(choiceSchema).optional(),
  starting_equipment: z.array(startingEquipmentEntrySchema),
  starting_gold: startingGoldSchema.optional(),
  spellcasting: spellcastingSchema.nullable(),
  subclass_level: z.number().int().positive(),
  subclass_feature_name: z.string().min(1),
  weapon_mastery: weaponMasterySchema.nullable(),
  epic_boon_level: z.number().int().positive().nullable(),
  table: z.record(z.string(), classTableRowSchema),
  features_by_level: z.record(z.string(), z.array(featureSchema)),
  resources: z.array(resourceSchema),
  selection_pools: z.array(selectionPoolSchema).optional(),
  pool_grants: z.array(poolGrantSchema).optional(),
  tabs: z.array(tabDeclSchema).optional(),
  rendering_hint: z.string().optional(),                                 // 28
  has_fluff: z.boolean().optional(),                                     // 28
  has_fluff_images: z.boolean().optional(),                              // 27
  table_col_labels: z.array(z.string().min(1)).optional(),               // 28
  starting_equipment_additional_from_background: z.boolean().optional(), // 28
  multiclassing: z.unknown().optional(),   // FOUR arities measured incl. {} ×3; free-form 5etools keys
                                           // ("thieves' tools", requirements.or[].{dex,str}) — Q1 ruling
  cantrip_progression: z.array(z.number()).optional(),                   // 15
  prepared_spells: z.string().min(1).optional(),              // formula string "<$level$> / 2 + <$int_mod$>"
  prepared_spells_change: z.string().min(1).optional(),       // "restLong"
  prepared_spells_progression: z.array(z.number()).optional(),
  spells_known_progression: z.array(z.number()).optional(),
  spells_known_progression_fixed: z.array(z.number()).optional(),
  spells_known_progression_fixed_allow_lower_level: z.boolean().optional(),   // ⚠️ BOOLEAN (finding 1)
  spells_known_progression_fixed_by_level:
    z.record(z.string(), z.record(z.string(), z.number())).optional(),        // ⚠️ two-deep record (finding 1)
  feat_progression: z.array(progressionSchema).optional(),               // 13
  optionalfeature_progression: z.array(progressionSchema).optional(),    // 9 carriers; the ARRAY
                                                                         // progression arm rides 4 of them
  additional_spells: z.array(additionalSpellsEntrySchema).optional(),    // 7
  image: imageField,
});
