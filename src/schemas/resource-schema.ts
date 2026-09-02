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
  })).optional(),
});

/** A feature's / optional feature's resource spend.
 *
 *  `amount` is the MINIMUM spend. When `amount_max` is present the spend is a
 *  RANGE (`amount` .. `amount_max`); the range spend itself (a quantity-taking
 *  spend primitive, the how-much UI, a `Feature.consumes` reader, the validation
 *  rule and the converter un-withhold) is R4-G4's. `amount_max` is DECLARED here
 *  only, and the refine is undefined-safe by construction so the corpus that
 *  ships without the key keeps parsing: 294 `Feature.consumes` carriers over 161
 *  documents, plus 70 `OptionalFeature.consumes` documents (R4-G3a §9; an
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
