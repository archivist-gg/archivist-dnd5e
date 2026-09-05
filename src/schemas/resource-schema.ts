import { z } from "zod";

const resetTriggerEnum = z.enum(["short-rest", "long-rest", "either", "dawn", "dusk", "turn", "round", "custom"]);
const actionCostEnum = z.enum(["action", "bonus-action", "reaction", "free", "special"]);

export const resourceSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  max_formula: z.string().min(1),
  scales_at: z.array(z.object({
    level: z.number().int().positive(),
    max: z.string().min(1),
  }).strict()).optional(),
  die: z.object({
    base: z.string().min(1),
    scaling: z.record(z.string(), z.string()).optional(),
  }).optional(),
  reset: resetTriggerEnum,
  consumes: z.object({
    resource: z.string().min(1),
    amount: z.number().int().positive(),
  }).optional(),
  recovery: z.array(z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    amount: z.union([z.number(), z.string()]),
    action: actionCostEnum.optional(),
    uses: z.number().int().nonnegative().optional(),
    reset: resetTriggerEnum,
    restores: z.enum(["uses", "spell-slots"]).optional(),
  })).optional(),
});

/** A feature's / optional feature's resource spend.
 *
 *  `amount` is the MINIMUM spend. When `amount_max` is present the spend is a
 *  RANGE (`amount` .. `amount_max`). Readers of `consumes.resource`, measured
 *  2026-09-05 across both repos' `src`: the ENGINE has exactly one, `pc/pc.pools.ts`'s
 *  owner-aware pool vote (R4-G4 §4.2.3, shipped by T2 with this key), which reads the
 *  id to pick `ResolvedPool.resource` and never spends it; the PLUGIN has exactly two,
 *  the pool-tab Cost labels (`components/pool-tab.ts:209` / `:251`), which print the
 *  raw id as a word. Nothing SPENDS the field yet: R4-G4 §3's spend control on the
 *  pool, boon and feature rows, which spends `amount` exactly through the clamped
 *  quantity-taking primitive the plugin already had, is plugin task T4 and is PENDING
 *  as of this commit. What R4-G4 does NOT do (§15): the HOW-MUCH UI for a range spend
 *  and its validation rule stay G8, and the converter un-withhold that would emit
 *  `amount_max` at all is a G7 handoff. So `amount_max` stays DECLARED here only, with
 *  zero emitted carriers, and the refine is undefined-safe by construction so the
 *  corpus that ships without the key keeps parsing: 294 `Feature.consumes` carriers
 *  over 161 documents, plus 70 `OptionalFeature.consumes` documents (R4-G3a §9; an
 *  unguarded refine refuses all 231, measured). */
export const resourceConsumptionSchema = z.object({
  source: z.enum(["resource", "class-column", "attack-dice"]).optional(),
  resource: z.string().optional(),
  column: z.string().optional(),
  amount: z.number().int().positive(),
  amount_max: z.number().int().positive().optional(),
  expend_condition: z.enum(["roll_succeeds", "roll_fails", "target_takes_damage", "always"]).optional(),
  free_uses: z.object({
    amount: z.number().int().positive(),
    reset: resetTriggerEnum,
    state_key: z.string().optional(),
  }).optional(),
}).refine((c) => c.amount_max === undefined || c.amount_max >= c.amount, {
  path: ["amount_max"],
  message: "amount_max must be >= amount",
});

export { resetTriggerEnum, actionCostEnum };
