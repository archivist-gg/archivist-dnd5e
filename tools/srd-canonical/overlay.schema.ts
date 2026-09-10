import { z } from "zod";
import { resourceSchema } from "@archivist-gg/dnd5e/schemas/resource-schema";
import { choiceSchema } from "@archivist-gg/dnd5e/schemas/choice-schema";
import { featureEffectSchema } from "@archivist-gg/dnd5e/schemas/feature-effect-schema";
import { startingEquipmentEntrySchema, startingGoldSchema } from "@archivist-gg/dnd5e/schemas/equipment-grant-schema";
import { langProfSchema } from "@archivist-gg/dnd5e/background/background.schema";
import { fixedAsiSchema } from "@archivist-gg/dnd5e/race/race.schema";
import { casterTypeEnum } from "@archivist-gg/dnd5e/schemas/caster-type-schema";

const actionCost = z.enum(["action", "bonus-action", "reaction", "free", "special"]);
const recharge = z.enum(["short-rest", "long-rest", "dawn", "dusk", "turn", "round", "custom"]);
const abilityEnum = z.enum(["str", "dex", "con", "int", "wis", "cha"]);

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
 *  Own, because featureOverrideSchema is shared with feat_features and
 *  background_features · and feat_features is NOT inert: feat-merge already
 *  reads `overlaid?.effects`, so widening the shared schema would silently open
 *  a second, undocumented authoring route for feat effects.
 *
 *  Strict, because the non-strict parent is exactly why an authored `effects:`
 *  key used to vanish with exit 0 and no warning. Every field race traits
 *  discard is declared, so strictness is free here. */
const raceTraitOverrideSchema = featureOverrideSchema
  .extend({ effects: z.array(featureEffectSchema).nonempty().optional() })
  .strict();

/** Class features get the SAME treatment, for the same two reasons, since R4-G7 T5
 *  (spec §8.1 item 1). The shared, non-strict `featureOverrideSchema` above stays
 *  exactly as it was and keeps `feat_features` / `background_features`: this phase
 *  authors typed mechanics on TEN SRD class documents (extra-attack, unarmed-strike,
 *  unarmored-ac, speed-bonus) and the authoring route must be ONE, declared, and
 *  loud when it is mis-spelled. Before this arm existed, an `effects:` key under
 *  `class_features` parsed clean, was stripped, and shipped nothing. */
const classFeatureOverrideSchema = featureOverrideSchema
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
  // R4-G7 T5 (spec §8.1 item 2): the ONE upstream saving-throw pair the SRD block gets wrong.
  // Open5e's 2024 Fighter carries [dex, str] where RAW is STR + CON, and `parseSavingThrows` has
  // no way to know. EXACTLY two, because `clampSavingThrows` pads or trims to two and a shorter
  // authored pair would be silently completed from its fallback list instead of failing here.
  saving_throws: z.array(abilityEnum).length(2).optional(),
  starting_equipment: z.array(startingEquipmentEntrySchema).nonempty().optional(),
  starting_gold: startingGoldSchema.optional(),
  subclass_level: z.number().int().min(1).max(20).optional(),
  subclass_feature_name: z.string().min(1).optional(),
  spellcasting: z.object({
    caster_type: casterTypeEnum,
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
  // R4-G4 spec 14: the four flattened SRD 5e subraces lost their parent's languages; the overlay says them.
  languages: z.object({ fixed: z.array(z.string().min(1)) }).strict().optional(),
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

/** The creature overlay (R4-G7 T5, spec §8.1 item 4b): the FIRST overlay route creature-merge has
 *  ever had, and deliberately the narrowest one that closes the measured gap. The Open5e cache
 *  supplies neither a speed nor a hit-dice expression for four SRD 5.1 creatures (MEASURED at
 *  0.3.3: `speed` empty on Donkey, Elf Drow, Gnome Deep and Shrieker; `hit_dice: null` on the first
 *  three), so those two fields are authored from the SRD 5.1 text and nothing else is.
 *
 *  Keyed by the VENDOR-FREE bare slug (`donkey`, `elf-drow`), like every other overlay section;
 *  `creature-merge`'s `pickOverlay` strips the Open5e document prefix with the shared `bareSlug`.
 *
 *  The mode list is an explicit STRICT object rather than a free record: a mis-spelled mode in a
 *  record (`wlak: 40`) would author nothing, leave the creature's speed empty, and look exactly
 *  like the defect this arm exists to close. `nonnegative`, not `positive`, because the Shrieker's
 *  RAW speed IS 0 ft. (it is a fungus): authoring `walk: 0` says "measured zero" where an absent
 *  entry says "no data", and `formatSpeed` renders both as the same empty string. */
const creatureOverrideSchema = z.object({
  speed: z.object({
    walk: z.number().int().nonnegative().optional(),
    fly: z.number().int().nonnegative().optional(),
    swim: z.number().int().nonnegative().optional(),
    climb: z.number().int().nonnegative().optional(),
    burrow: z.number().int().nonnegative().optional(),
  }).strict().optional(),
  hp: z.object({ formula: z.string().regex(/^\d+d\d+([+-]\d+)?$/) }).strict().optional(),
}).strict();

export const overlaySchema = z.object({
  class_features: z.record(z.string(), classFeatureOverrideSchema).optional(),
  race_traits: z.record(z.string(), raceTraitOverrideSchema).optional(),
  feat_features: z.record(z.string(), featureOverrideSchema).optional(),
  background_features: z.record(z.string(), featureOverrideSchema).optional(),
  optional_feature_slugs: z.partialRecord(optionalFeatureKind, z.array(z.string())).optional(),
  classes: z.record(z.string(), classOverrideSchema).optional(),
  races: z.record(z.string(), raceOverrideSchema).optional(),
  backgrounds: z.record(z.string(), backgroundOverrideSchema).optional(),
  optional_features: z.record(z.string(), entityEffectsSchema).optional(),
  feats: z.record(z.string(), entityEffectsSchema).optional(),
  creatures: z.record(z.string(), creatureOverrideSchema).optional(),
});

export type Overlay = z.infer<typeof overlaySchema>;
