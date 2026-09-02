import { z } from "zod";
import { choiceSchema } from "@archivist-gg/dnd5e/schemas/choice-schema";
import { featureEffectSchema } from "@archivist-gg/dnd5e/schemas/feature-effect-schema";
import { resourceSchema, actionCostEnum } from "@archivist-gg/dnd5e/schemas/resource-schema";
import { imageField, additionalSpellsEntrySchema, progressionSchema }
  from "@archivist-gg/dnd5e/schemas/entity-extras-schema";

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
  rendering_hint: z.string().optional(),
  additional_spells: z.array(additionalSpellsEntrySchema).optional(),   // 71
  has_fluff: z.boolean().optional(),                                    // 0 carriers — symmetry, §9.4
  has_fluff_images: z.boolean().optional(),                             // 41
  trait_tags: z.unknown().optional(),                                   // 7, nullable measured — same passthrough family
  optionalfeature_progression: z.array(progressionSchema).optional(),   // 4
  resources: z.array(resourceSchema).optional(),  // closes the feat.types.ts:38 schema/type asymmetry (C);
      // ZERO converter/bundle carriers (no census row) — the only behaviour delta is AUTHORED feats,
      // where the type has promised the field all along. Import resourceSchema.
  action_cost: actionCostEnum.optional(),  // ruling R-G1b-5 (gate1-r1 f1): a TOP-LEVEL bundle key on ONE
      // feat (`SRD 2024/Feats/Boon of the Night Spirit.md`, `action_cost: bonus-action` at entity top
      // level) — the ninth SRD-control non-kept row: top-level on the ENTITY, not featureSchema-shaped
      // (finding 14's nine rows split 4 featureSchema / 4 §2.8-arity / this one, which needed its own
      // declaration — gate1-r4 R4-1). `actionCostEnum` is exported from
      // `schemas/resource-schema.ts` (optionalFeatureEntitySchema already imports it). MAPPED since
      // R4-G3a §10.2.3: the resolver aliases it onto the resolved feature's `action`, which is what
      // draws the feat note's Action line and files the row under that economy.
  image: imageField,
});
