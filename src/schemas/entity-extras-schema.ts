import { z } from "zod";

/**
 * Shared leaf schemas for the entity "extras" the converter and the SRD bundle
 * emit on more than one root. Six root schemas will import from here (race,
 * feat, optional-feature, background, class, subclass; the wiring lands in T2/T3)
 * so a shape is declared ONCE.
 *
 * Everything here is additive and `.optional()` at the point of use: no
 * `.default()`, no tightening, no new required field. A raw-blob leaf is always
 * `z.unknown().optional()` — a bare `z.unknown()` inside `z.object` is NOT
 * optional under zod v4 (`safeParse({})` fails `expected nonoptional`).
 */

/** Images-ON emit (scripts/lib/image-format.ts): one wikilink string, or an array for ≥2 fluff
 *  images; `thumbnail` monster-only. ZERO carriers on the frozen images-OFF tree — see §9.4.
 *  NO .nonempty() on the array arm (gate1-r1 f13): the variant set is unestablished (Gate 0
 *  finding 25) and the phase's own rule — a new declaration must be INCAPABLE of refusing —
 *  outranks a speculative arity constraint on the one key a future convert:images run feeds. */
export const imageField = z.union([z.string().min(1), z.array(z.string().min(1))]).optional();

/** 5etools additionalSpells. Key-set measured COMPLETE over all 52 distinct sets on 5 roots:
 *  {ability, expanded, innate, known, name, prepared, resourceName} (Gate 0 finding 5).
 *  Loose leaves are deliberate: level keys are arbitrary strings ("1","s0","_","1e","pb","cha"…),
 *  the known.'1' string-keying is converter-owned (A §7.2) and passes through VERBATIM. */
export const additionalSpellsEntrySchema = z.object({
  name: z.string().min(1).optional(),
  ability: z.union([z.string().min(1), z.object({ choose: z.array(z.string().min(1)) })]).optional(),
  known: z.unknown().optional(), innate: z.unknown().optional(),
  prepared: z.unknown().optional(), expanded: z.unknown().optional(),
  resourceName: z.string().min(1).optional(),
});

/** optionalfeature_progression / feat_progression containers. Measured distribution (finding 4):
 *  `progression` is a record on 42 of 46 containers (keys numeric strings + "*", values number) and
 *  an ARRAY (number[], len 20) on class.optionalfeature_progression ONLY (4 docs: both PHB Warlocks,
 *  TCE + Eberron Artificer). `featureType` (camelCase) is the ONLY spelling on all 13 subclass
 *  optionalfeature_progression containers; `feature_type` (snake) on class/feat/optional-feature;
 *  `required` on 2 subclass docs ({"3": ["Elemental Attunement|PHB"]}). Union order is SAFE
 *  (executed: record.safeParse(array) fails invalid_type). Distribution recorded in T0's census
 *  baseline — NO test asserts it; §9.3 characterises the SHAPES only. */
export const progressionSchema = z.object({
  name: z.string().min(1),
  progression: z.union([z.record(z.string(), z.number()), z.array(z.number())]),
  feature_type: z.array(z.string().min(1)).optional(),
  featureType: z.array(z.string().min(1)).optional(),
  category: z.array(z.string().min(1)).optional(),
  required: z.record(z.string(), z.array(z.string())).optional(),
});

export type AdditionalSpellsEntry = z.infer<typeof additionalSpellsEntrySchema>;
export type ProgressionEntry = z.infer<typeof progressionSchema>;
