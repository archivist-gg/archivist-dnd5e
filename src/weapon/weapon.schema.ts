import { z } from "zod";
import { imageField } from "@archivist-gg/dnd5e/schemas/entity-extras-schema";

const conditionalPropertySchema = z.object({
  kind: z.literal("conditional"),
  uid: z.string(),
  note: z.string(),
});

const propertySchema = z.union([z.string(), conditionalPropertySchema]);

const editionEnum = z.enum(["2014", "2024"]);

export const weaponEntitySchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  category: z.string(),
  damage: z.object({
    dice: z.string(),
    type: z.string(),
    versatile_dice: z.string().optional(),
  }),
  properties: z.array(propertySchema).default([]),
  range: z.object({
    normal: z.number().int().nonnegative(),
    long: z.number().int().nonnegative(),
  }).optional(),
  reload: z.number().int().nonnegative().optional(),
  mastery: z.array(z.string()).optional(),
  type_tags: z.array(z.string()).optional(),
  ammo_type: z.string().optional(),
  weight: z.union([z.number(), z.string()]).optional(),
  cost: z.string().optional(),
  source: z.string().optional(),
  page: z.number().int().optional(),
  edition: editionEnum,
  entries: z.array(z.unknown()).optional(),
  // Root extras the converter and the SRD bundle emit on more than one root (spec §5).
  // Carrier counts measured on the G1b close census. `rendering_hint` is ALWAYS the empty
  // string today, so `.min(1)` is forbidden here.
  rendering_hint: z.string().optional(),                          // 98
  has_fluff: z.boolean().optional(),                              // 1
  has_fluff_images: z.boolean().optional(),                       // 39
  // Already `.optional()` at its source — never append a second one.
  image: imageField,                                              // 0 today (images-OFF tree)
  raw: z.record(z.string(), z.unknown()).optional(),
  // `weapon :: value_rarity :: duplicated` (8) is deliberately NOT declared: it is
  // converter-owned and stays a named expected residual (spec §10.3).
}).loose();
