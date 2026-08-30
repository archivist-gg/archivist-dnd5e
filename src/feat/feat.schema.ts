import { z } from "zod";
import { choiceSchema } from "@archivist-gg/dnd5e/schemas/choice-schema";
import { featureEffectSchema } from "@archivist-gg/dnd5e/schemas/feature-effect-schema";

const abilityEnum = z.enum(["str", "dex", "con", "int", "wis", "cha"]);
const editionEnum = z.enum(["2014", "2024"]);
const categoryEnum = z.enum(["origin", "general", "fighting-style", "epic-boon"]);

const prerequisiteSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("ability"), ability: abilityEnum, min: z.number().int().positive() }),
  z.object({ kind: z.literal("level"), min: z.number().int().positive() }),
  z.object({ kind: z.literal("spellcaster") }),
  z.object({
    kind: z.literal("proficiency"),
    proficiency_type: z.enum(["armor", "weapon", "tool", "skill", "saving-throw"]),
    value: z.string().min(1),
  }),
  z.object({ kind: z.literal("race"), slug: z.string().min(1) }),
  z.object({ kind: z.literal("class"), slug: z.string().min(1) }),
  // The exclusive-feat-category and feat-category arms carry a raw 5etools category code, not a
  // slug; featCategoryLabel names it. The rest carry slugs the renderer humanizes, except other,
  // which carries free prose that prereqText returns verbatim.
  z.object({ kind: z.literal("feat"), slug: z.string().min(1) }),
  z.object({ kind: z.literal("campaign"), slug: z.string().min(1) }),
  z.object({ kind: z.literal("exclusive-feat-category"), slug: z.string().min(1) }),
  z.object({ kind: z.literal("feature"), slug: z.string().min(1) }),
  z.object({ kind: z.literal("other"), detail: z.string().min(1) }),
  z.object({ kind: z.literal("feat-category"), slug: z.string().min(1) }),
  z.object({ kind: z.literal("background"), slug: z.string().min(1) }),
]);

export const featEntitySchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1),
  edition: editionEnum,
  source: z.string().min(1),
  category: categoryEnum,
  description: z.string(),
  prerequisites: z.array(prerequisiteSchema),
  benefits: z.array(z.string()),
  effects: z.array(featureEffectSchema),
  grants_asi: z.object({
    amount: z.number().int().positive(),
    pool: z.array(abilityEnum).optional(),
  }).nullable(),
  repeatable: z.boolean(),
  choices: z.array(choiceSchema),
});
