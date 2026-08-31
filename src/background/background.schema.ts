import { z } from "zod";
import { choiceSchema } from "@archivist-gg/dnd5e/schemas/choice-schema";
import { startingEquipmentEntrySchema } from "@archivist-gg/dnd5e/schemas/equipment-grant-schema";
import { imageField, additionalSpellsEntrySchema }
  from "@archivist-gg/dnd5e/schemas/entity-extras-schema";

const abilityEnum = z.enum(["str", "dex", "con", "int", "wis", "cha"]);
const editionEnum = z.enum(["2014", "2024"]);
const skillEnum = z.enum([
  "acrobatics", "animal-handling", "arcana", "athletics", "deception",
  "history", "insight", "intimidation", "investigation", "medicine",
  "nature", "perception", "performance", "persuasion", "religion",
  "sleight-of-hand", "stealth", "survival",
]);
const wikilinkRegex = /^\[\[[^[\]]+\]\]$/;

const toolProfSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("fixed"), items: z.array(z.string()).nonempty() }),
  z.object({
    kind: z.literal("choice"),
    count: z.number().int().positive(),
    from: z.array(z.string()).nonempty(),
  }),
]);

export const langProfSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("fixed"), languages: z.array(z.string()).nonempty() }),
  z.object({
    kind: z.literal("choice"),
    count: z.number().int().positive(),
    from: z.union([z.string(), z.array(z.string())]),
  }),
]);

const suggestedCharSchema = z.object({
  personality_traits: z.record(z.string(), z.string()).optional(),
  ideals: z.record(z.string(), z.object({
    name: z.string().optional(),
    desc: z.string(),
    alignment: z.string().optional(),
  })).optional(),
  bonds: z.record(z.string(), z.string()).optional(),
  flaws: z.record(z.string(), z.string()).optional(),
});

export const backgroundEntitySchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1),
  edition: editionEnum,
  source: z.string().min(1),
  description: z.string(),
  skill_proficiencies: z.array(skillEnum),
  tool_proficiencies: z.array(toolProfSchema),
  language_proficiencies: z.array(langProfSchema),
  equipment: z.array(startingEquipmentEntrySchema),
  feature: z.object({
    name: z.string().min(1),
    description: z.string().min(1),
  }),
  ability_score_increases: z.object({
    pool: z.array(abilityEnum).length(3),
  }).nullable(),
  origin_feat: z.string().regex(wikilinkRegex).nullable(),
  suggested_characteristics: suggestedCharSchema.nullable(),
  choices: z.array(choiceSchema).optional(),
  rendering_hint: z.string().optional(),                                 // 175
  has_fluff_images: z.boolean().optional(),                              // 87
  tables: z.array(z.object({                       // 88 tables / 67 docs; key-sets EXACT (finding 6)
    name: z.string().min(1), dice: z.string().min(1),
    rows: z.array(z.object({ roll: z.string(), text: z.string() })),
  })).optional(),
  additional_spells: z.array(additionalSpellsEntrySchema).optional(),   // 15
  prerequisites: z.array(z.object({                // 4 docs; kind CLOSED AT THE EMITTER
    kind: z.literal("campaign"), slug: z.string().min(1),               // (background-mapper.ts pushes
  })).optional(),                                  //  {kind:"campaign", slug} literally — finding 24)
      // The one-arm union STAYS (§2.6 adjudication): it is closed by CONSTRUCTION at the converter's
      // only push site, and a future kind turns into a visible census REFUSAL — the correct loud failure.
  image: imageField,
});
