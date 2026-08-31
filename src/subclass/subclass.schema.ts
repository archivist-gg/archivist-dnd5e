import { z } from "zod";
import { featureSchema } from "@archivist-gg/dnd5e/schemas/feature-schema";
import { resourceSchema } from "@archivist-gg/dnd5e/schemas/resource-schema";
import { selectionPoolSchema, poolGrantSchema, tabDeclSchema } from "@archivist-gg/dnd5e/schemas/selection-pool-schema";
import { casterTypeEnum } from "@archivist-gg/dnd5e/schemas/caster-type-schema";
import { imageField, additionalSpellsEntrySchema, progressionSchema }
  from "@archivist-gg/dnd5e/schemas/entity-extras-schema";

const editionEnum = z.enum(["2014", "2024"]);
const wikilinkRegex = /^\[\[[^[\]]+\]\]$/;

const abilityEnum = z.enum(["str", "dex", "con", "int", "wis", "cha"]);

const spellcastingSchema = z.object({
  caster_type: casterTypeEnum.optional(),
  ability: abilityEnum,
  preparation: z.enum(["known", "prepared"]).optional(),
  spell_list: z.string().min(1).optional(),
});

const subclassTableRowSchema = z.object({
  columns: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
});

export const subclassEntitySchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1),
  parent_class: z.string().regex(wikilinkRegex, "parent_class must be a wikilink like [[rogue]]"),
  edition: editionEnum,
  source: z.string().min(1),
  description: z.string(),
  spellcasting: spellcastingSchema.nullable().optional(),
  table: z.record(z.string(), subclassTableRowSchema).optional(),
  features_by_level: z.record(z.string(), z.array(featureSchema)),
  resources: z.array(resourceSchema),
  selection_pools: z.array(selectionPoolSchema).optional(),
  pool_grants: z.array(poolGrantSchema).optional(),
  tabs: z.array(tabDeclSchema).optional(),
  rendering_hint: z.string().optional(),                                 // 346
  short_name: z.string().min(1).optional(),                              // 346
  has_fluff: z.boolean().optional(),                                     // 50
  has_fluff_images: z.boolean().optional(),                              // 346
  fluff: z.unknown().optional(),           // 62 docs, single key-set {_subclassFluff:{...}} — 5etools-internal
  table_col_labels: z.array(z.string().min(1)).optional(),               // 8
  cantrip_progression: z.array(z.number()).optional(),                   // 6
  prepared_spells_change: z.string().min(1).optional(),                  // 2
  prepared_spells_progression: z.array(z.number()).optional(),           // 2
  spells_known_progression: z.array(z.number()).optional(),              // 4
  feat_progression: z.array(progressionSchema).optional(),               // 1
  optionalfeature_progression: z.array(progressionSchema).optional(),    // 13 (featureType + required)
  additional_spells: z.array(additionalSpellsEntrySchema).optional(),    // 212
  image: imageField,
});
