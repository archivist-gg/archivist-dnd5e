import { z } from "zod";
import { imageField } from "../schemas/entity-extras-schema";

const castingOptionSchema = z.object({
  type: z.string(),
  damage_roll: z.string().optional(),
  target_count: z.number().optional(),
  duration: z.string().optional(),
  range: z.number().optional(),
  concentration: z.boolean().optional(),
  shape_size: z.number().optional(),
  desc: z.string().optional(),
});

/**
 * The converter's structured `components` / `duration` forms (spec §3.2). Both schemas are LOCAL
 * to this file and deliberately NOT exported from `schemas/index` — `src/schemas/duration-schema.ts`
 * already owns the effect-arm duration vocabulary and must never be shadowed by these.
 *
 * Measured over the frozen converter tree `744b2b85…` (Gate 1 A, 1,706 carriers accepted / 0
 * refused): `components` is an object on 186 docs (key-sets {m,s,v} 171 · {m,s} 10 · {r,s,v} 2 ·
 * {m,v} 2 · {m,r,s} 1; `m` values {text,cost} 97 · {consume,cost,text} 77 · {consume,text} 9 ·
 * string 1), `duration` an array on 35 (permanent+ends 30, timed 5; never more than one entry).
 * `r` is the Acquisitions-Incorporated royalty component.
 *
 * FAIL-LOUD POLICY (spec §3.2): the narrow enums, `strictObject`s and `.nonempty()`s are
 * DELIBERATE pins against that measurement — a NEW converter shape must refuse visibly rather than
 * normalise wrongly or strip silently. This is a recorded divergence from G1b's "a new declaration
 * must be INCAPABLE of refusing" rule, which protected keys whose value population was not
 * exhaustively measured; a wrong normalisation here is silent data corruption.
 */
const spellMaterialSchema = z.union([
  z.boolean(), z.string(),
  z.strictObject({ text: z.string(), cost: z.number().optional(),
                   consume: z.union([z.boolean(), z.string()]).optional() }),
]);
const spellComponentsObjectSchema = z.strictObject({
  v: z.boolean().optional(), s: z.boolean().optional(),
  m: spellMaterialSchema.optional(), r: z.boolean().optional(),
});
const spellDurationEntrySchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("permanent"),
                   ends: z.array(z.enum(["dispel", "trigger"])).nonempty() }),
  z.strictObject({ type: z.literal("timed"),
                   duration: z.strictObject({ type: z.enum(["minute", "hour"]),
                                              amount: z.number().int().positive(),
                                              up_to: z.boolean().optional() }) }),
]);

export const spellEntitySchema = z.object({
  name: z.string().min(1),
  level: z.number().int().min(0).optional(),
  school: z.string().optional(),
  casting_time: z.string().optional(),
  range: z.string().optional(),
  // Union arms per §3.2; `parseSpell` normalises the structured arms back to the corpus's own
  // string form, so `Spell.components` / `Spell.duration` stay `string` and no consumer changes.
  components: z.union([z.string(), spellComponentsObjectSchema]).optional(),
  duration: z.union([z.string(), z.array(spellDurationEntrySchema).nonempty()]).optional(),
  concentration: z.boolean().optional(),
  ritual: z.boolean().optional(),
  classes: z.array(z.string()).optional(),
  description: z.string().optional(),
  at_higher_levels: z.array(z.string()).optional(),
  damage: z.object({ types: z.array(z.string()) }).optional(),
  // The base roll at the spell's own level (a cantrip's tier-1 roll); see `Spell.damage_roll`.
  damage_roll: z.string().optional(),
  saving_throw: z.object({ ability: z.string() }).optional(),
  casting_options: z.array(castingOptionSchema).optional(),
  // §2 · the fourteen converter keys this root refused before R4-G2. Doc counts are MEASURED over
  // the frozen tree; the two zero-carrier keys are declared because the root is `.strict()` and an
  // images-ON run (`image`) or a non-images-gated fluff flag (`has_fluff_images`) would otherwise
  // refuse the whole document. Declared-only: NO rendering this phase (booked to G8 by name).
  rendering_hint: z.string().optional(),          // 1,048 docs — NEVER .min(1): every value is ''
  misc_tags: z.array(z.string()).optional(),      // 769
  area_tags: z.array(z.string()).optional(),      // 707
  condition_inflict: z.array(z.string()).optional(),      // 194
  affects_creature_type: z.array(z.string()).optional(),  // 87
  spell_attack: z.enum(["melee", "ranged"]).optional(),   // 77 (ranged 44 / melee 33)
  ability_check: z.array(z.string()).optional(),  // 61
  damage_resist: z.array(z.string()).optional(),  // 35
  damage_immune: z.array(z.string()).optional(),  // 21
  condition_immune: z.array(z.string()).optional(),   // 11
  damage_vulnerable: z.array(z.string()).optional(),  // 2
  has_fluff: z.boolean().optional(),              // 1
  image: imageField,                              // 0 today; `imageField` already ends .optional()
  has_fluff_images: z.boolean().optional(),       // 0 today
}).strict();
