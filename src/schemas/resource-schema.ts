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
 *  RANGE (`amount` .. `amount_max`). Readers of `consumes.resource`, re-measured
 *  2026-09-05 across both repos' `src` after plugin task T4 landed: the ENGINE still has
 *  exactly one, `pc/pc.pools.ts`'s
 *  owner-aware pool vote (R4-G4 §4.2.3, shipped by T2 with this key), which reads the
 *  id to pick `ResolvedPool.resource` and never spends it; the PLUGIN now has six, in four
 *  files: `renderSpendControl` (`components/actions/spend-control.ts`), which SPENDS it;
 *  the three row sites that gate that call, `PoolTab.row` and `PoolTab.blockCard`
 *  (`components/pool-tab.ts`) and `renderBoonRow` (`components/actions/boon-rows.ts`);
 *  `renderFeatureRow` (`components/actions/feature-rows.ts`), whose owner-and-spender rule
 *  decides between the row slot, the expand card and no control at all; and `consumeCost`
 *  (`components/pool-tab.ts`), the ONE Cost label the row sub-line and the block card now
 *  share, which prints the resource's NAME from the index and keeps the raw id only as the
 *  fallback for an id the character does not own (it no longer singularizes or capitalizes
 *  it). The field IS spent as of R4-G4 T4: §3's control spends `amount` exactly through
 *  `CharacterEditState.spendFeatureUse`, the clamped quantity-taking primitive the plugin
 *  already had. What R4-G4 does NOT do (§15): the HOW-MUCH UI for a range spend
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
