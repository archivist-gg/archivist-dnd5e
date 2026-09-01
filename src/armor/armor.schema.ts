import { z } from "zod";
import { imageField } from "@archivist-gg/dnd5e/schemas/entity-extras-schema";

const acSchema = z.object({
  base: z.number().int(),
  flat: z.number().int().default(0),
  add_dex: z.boolean().default(false),
  dex_max: z.number().int().nonnegative().optional(),
  add_con: z.boolean().default(false),
  add_wis: z.boolean().default(false),
  description: z.string().optional(),
});

export const armorEntitySchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  category: z.string(),
  ac: acSchema,
  strength_requirement: z.number().int().optional(),
  stealth_disadvantage: z.boolean().optional(),
  weight: z.union([z.number(), z.string()]).optional(),
  cost: z.string().optional(),
  rarity: z.string().optional(),
  source: z.string().optional(),
  page: z.number().int().optional(),
  edition: z.string().optional(),
  entries: z.array(z.unknown()).optional(),
  // Root extras the converter and the SRD bundle emit on more than one root (spec §5).
  // Carrier counts measured on the G1b close census. `rendering_hint` is ALWAYS the empty
  // string today, so `.min(1)` is forbidden here.
  rendering_hint: z.string().optional(),                          // 27
  has_fluff: z.boolean().optional(),                              // 0 carriers — symmetry with weapon
  has_fluff_images: z.boolean().optional(),                       // 13
  // Already `.optional()` at its source — never append a second one.
  image: imageField,                                              // 0 today (images-OFF tree)
  raw: z.record(z.string(), z.unknown()).optional(),
  // `.loose()` is load-bearing for the `strength_required` alias (armor.parser.ts): the alias
  // rides through onto the typed output as an inert extra, which is what keeps its census
  // disposal `kept` instead of minting a `stripped` row. See the parser's comment.
}).loose();
