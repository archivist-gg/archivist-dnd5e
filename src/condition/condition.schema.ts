import { z } from "zod";
import { imageField } from "../schemas/entity-extras-schema";

/**
 * The `condition` entity (spec §6). Measured corpus at design time: 89 documents
 * (59 converter over 4 books + 30 bundle) in exactly TWO key-sets — with
 * `has_fluff_images` (39) and without (50) — over 15 distinct names that are
 * BYTE-IDENTICAL across every book that ships them. Editions: converter 44/15,
 * bundle 15/15, so the closed enum is safe. NOT every book ships all 15
 * (`Hunt for the Thessalhydra` has no Exhaustion): completeness is never assumed.
 *
 * Plain `z.object` on purpose — no `.loose()`, no raw bag, no KNOWN_KEYS list: the
 * corpus has no keys beyond these, and the parser returns the validated object
 * directly (see `condition.parser.ts`), so nothing is relocated or duplicated.
 *
 * `edition` is REQUIRED here; the parser seeds `"2014"` BEFORE validation, so an
 * authored note without the key still parses (all 89 corpus docs carry it).
 * `image` is already `.optional()` at its source — never append a second one.
 */
export const conditionEntitySchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1),
  edition: z.enum(["2014", "2024"]),
  source: z.string().min(1),
  description: z.string(),
  has_fluff_images: z.boolean().optional(),
  image: imageField,
});
