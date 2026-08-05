import { z } from "zod";
import { resourceSchema } from "@archivist-gg/dnd5e/schemas/resource-schema";
import { choiceSchema } from "@archivist-gg/dnd5e/schemas/choice-schema";
import { featureEffectSchema } from "@archivist-gg/dnd5e/schemas/feature-effect-schema";
import { startingEquipmentEntrySchema, startingGoldSchema } from "@archivist-gg/dnd5e/schemas/equipment-grant-schema";
import { langProfSchema } from "@archivist-gg/dnd5e/background/background.schema";
import { fixedAsiSchema } from "@archivist-gg/dnd5e/race/race.schema";

const actionCost = z.enum(["action", "bonus-action", "reaction", "free", "special"]);
const recharge = z.enum(["short-rest", "long-rest", "dawn", "dusk", "turn", "round", "custom"]);

const featureOverrideSchema = z.object({
  action_cost: actionCost.optional(),
  resources: z.array(resourceSchema).optional(),
  save: z.object({
    ability: z.enum(["str", "dex", "con", "int", "wis", "cha"]),
    dc_formula: z.string(),
  }).optional(),
  damage: z.object({
    dice: z.string(),
    type: z.string(),
  }).optional(),
  recharge: recharge.optional(),
  trigger: z.string().optional(),
  spell: z.string().optional(),
  healing: z.object({ dice: z.string(), bonus: z.string().optional() }).optional(),
  choices: z.array(choiceSchema).optional(),
  noChoices: z.literal(true).optional(),
});

/** Race traits get their OWN schema, and it is STRICT.
 *
 *  Own, because featureOverrideSchema is shared with class_features,
 *  feat_features and background_features · and feat_features is NOT inert:
 *  feat-merge already reads `overlaid?.effects`, so widening the shared schema
 *  would silently open a second, undocumented authoring route for feat effects.
 *
 *  Strict, because the non-strict parent is exactly why an authored `effects:`
 *  key used to vanish with exit 0 and no warning. Every field race traits
 *  discard is declared, so strictness is free here. */
const raceTraitOverrideSchema = featureOverrideSchema
  .extend({ effects: z.array(featureEffectSchema).nonempty().optional() })
  .strict();

const skillEnum = z.enum([
  "acrobatics", "animal-handling", "arcana", "athletics", "deception",
  "history", "insight", "intimidation", "investigation", "medicine",
  "nature", "perception", "performance", "persuasion", "religion",
  "sleight-of-hand", "stealth", "survival",
]);

const classOverrideSchema = z.object({
  skill_choices: z.object({ count: z.number().int().positive(), from: z.array(skillEnum).nonempty() }).optional(),
  starting_equipment: z.array(startingEquipmentEntrySchema).nonempty().optional(),
  starting_gold: startingGoldSchema.optional(),
  subclass_level: z.number().int().min(1).max(20).optional(),
  subclass_feature_name: z.string().min(1).optional(),
  spellcasting: z.object({
    caster_type: z.enum(["full", "half", "third", "pact"]),
    ability: z.enum(["str", "dex", "con", "int", "wis", "cha"]),
    preparation: z.enum(["known", "prepared"]),
    spell_list: z.string().min(1),
  }).optional(),
  choices: z.array(choiceSchema).optional(),
}).strict();

// Race entity-level override: keeps the entity-level `choices` array (BOTH
// `human:` and `half-elf:` already depend on it) and adds the fixed ability
// score increases the merger has never emitted. Validated with `fixedAsiSchema`,
// imported from race.schema.ts so authoring and canonical output share ONE
// definition of the fixed arm and cannot drift. That is narrower than canonical
// validation, deliberately: `raceEntitySchema` validates
// `ability_score_increases` with the `asiSchema` UNION, of which fixedAsiSchema
// is one arm, and the choice-shaped arm folds nothing at runtime
// (`flattenRaceAsi` reads only `"ability" in asi`), so rejecting it here is a
// guard, not a limitation.
const raceOverrideSchema = z.object({
  choices: z.array(choiceSchema).optional(),
  ability_score_increases: z.array(fixedAsiSchema).optional(),
}).strict();

// Background entity-level override: the entity-level `choices` array
// plus a structured starting `equipment` package (override beats prose-derived)
// and a fixed `language_proficiencies` grant (validated by the SAME langProfSchema
// that backgroundEntitySchema validates canonical output with, so input + output
// cannot drift).
const backgroundOverrideSchema = z.object({
  choices: z.array(choiceSchema).optional(),
  equipment: z.array(startingEquipmentEntrySchema).optional(),
  language_proficiencies: z.array(langProfSchema).optional(),
}).strict();

const entityEffectsSchema = z.object({
  effects: z.array(featureEffectSchema).nonempty(),
}).strict();

const optionalFeatureKind = z.enum(["invocation", "fighting_style", "metamagic", "maneuver", "infusion"]);

export const overlaySchema = z.object({
  class_features: z.record(z.string(), featureOverrideSchema).optional(),
  race_traits: z.record(z.string(), raceTraitOverrideSchema).optional(),
  feat_features: z.record(z.string(), featureOverrideSchema).optional(),
  background_features: z.record(z.string(), featureOverrideSchema).optional(),
  optional_feature_slugs: z.partialRecord(optionalFeatureKind, z.array(z.string())).optional(),
  classes: z.record(z.string(), classOverrideSchema).optional(),
  races: z.record(z.string(), raceOverrideSchema).optional(),
  backgrounds: z.record(z.string(), backgroundOverrideSchema).optional(),
  optional_features: z.record(z.string(), entityEffectsSchema).optional(),
  feats: z.record(z.string(), entityEffectsSchema).optional(),
});

export type Overlay = z.infer<typeof overlaySchema>;
