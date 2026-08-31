import { z } from "zod";
import { featureSchema } from "@archivist-gg/dnd5e/schemas/feature-schema";
import { choiceSchema } from "@archivist-gg/dnd5e/schemas/choice-schema";
import { imageField, additionalSpellsEntrySchema }
  from "@archivist-gg/dnd5e/schemas/entity-extras-schema";

const abilityEnum = z.enum(["str", "dex", "con", "int", "wis", "cha"]);
const editionEnum = z.enum(["2014", "2024"]);
const sizeEnum = z.enum(["tiny", "small", "medium", "large", "huge"]);
const wikilinkRegex = /^\[\[[^[\]]+\]\]$/;

const speedSchema = z.object({
  walk: z.number().int().nonnegative().optional(),
  fly: z.number().int().nonnegative().optional(),
  swim: z.number().int().nonnegative().optional(),
  climb: z.number().int().nonnegative().optional(),
  burrow: z.number().int().nonnegative().optional(),
  hover: z.boolean().optional(),
});

const visionSchema = z.object({
  darkvision: z.number().int().nonnegative().optional(),
  blindsight: z.number().int().nonnegative().optional(),
  tremorsense: z.number().int().nonnegative().optional(),
  truesight: z.number().int().nonnegative().optional(),
});

/** Exported so the SRD overlay validates AUTHORED fixed increases against the
 *  FIXED ARM canonical output is validated against, derived from this one
 *  definition so the two cannot drift. Note the precise relationship:
 *  `raceEntitySchema` below validates `ability_score_increases` with `asiSchema`,
 *  the UNION, of which this is one arm · `overlay.schema.ts` deliberately narrows
 *  to this arm alone, because the choice-shaped arm folds nothing at runtime
 *  (`flattenRaceAsi` reads only `"ability" in asi`), so rejecting it at authoring
 *  time is a guard, not a limitation. */
export const fixedAsiSchema = z.object({ ability: abilityEnum, amount: z.number().int() });
const choiceAsiSchema = z.object({
  choose: z.number().int().positive(),
  pool: z.array(abilityEnum).nonempty(),
  amount: z.number().int(),
});
const asiSchema = z.union([fixedAsiSchema, choiceAsiSchema]);

const languagesSchema = z.object({
  fixed: z.array(z.string()),
  choice: z.object({
    count: z.number().int().positive(),
    from: z.union([z.string(), z.array(z.string())]),
  }).optional(),
});

export const raceEntitySchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1),
  edition: editionEnum,
  source: z.string().min(1),
  description: z.string(),
  size: sizeEnum,
  speed: speedSchema,
  ability_score_increases: z.array(asiSchema),
  age: z.string(),
  alignment: z.string(),
  vision: visionSchema,
  languages: languagesSchema,
  variant_label: z.string().min(1),
  traits: z.array(featureSchema),
  choices: z.array(choiceSchema).optional(),
  subspecies_of: z.string().regex(wikilinkRegex).optional(),
  rendering_hint: z.string().optional(),
  has_fluff: z.boolean().optional(),
  has_fluff_images: z.boolean().optional(),
  creature_type: z.array(z.string().min(1)).optional(),       // guarded non-empty at the emitter (finding 24)
  creature_type_tags: z.array(z.string().min(1)).optional(),
  additional_spells: z.union([
    z.array(additionalSpellsEntrySchema),   // converter form, 109 docs
    additionalSpellsEntrySchema,            // SHIPPED-BUNDLE bare-object form, 3 docs (§2.8)
  ]).optional(),
  // The four RAW 5etools PASSTHROUGHS (race-mapper.ts D13 block copies them VERBATIM, no shape
  // guard — finding 24): today's variant set is a snapshot, not a contract (lineage is already
  // string|null|boolean), and NO G row ever reads them. Maximally loose by ruling; the guard
  // test §9.5 pins today's variant classes since the census goes blind under z.unknown().
  trait_tags: z.unknown().optional(),
  lineage: z.unknown().optional(),
  height_and_weight: z.unknown().optional(),
  sound_clip: z.unknown().optional(),
  image: imageField,
});
