import { z } from "zod";
import { choiceSchema } from "./choice-schema";
import { actionCostEnum, resourceConsumptionSchema, resourceSchema } from "./resource-schema";
import { attackSchema } from "./attack-schema";
import { featureEffectSchema } from "./feature-effect-schema";
import { durationSchema } from "./duration-schema";
import type { Feature } from "../types/feature";

/** LOCAL MIRROR of the converter's 14-key `companionSchema` (R4-G5 §7.2; ruling G5-UR2). It is deliberately
 *  LOOSER than the emitter on TWO axes, and both are the same safety rule:
 *    (1) every one of the NINE closed-vocabulary leaves is `z.string()`, never an enum (`turn_order`,
 *        `lifecycle.created_by`, `lifecycle.recreate_on`, `autonomy.when`, `autonomy.behaviour`,
 *        `variants[].axis`, `variants[].chosen_at`, `overrides[].field`, `proficiency_bonus_scaled[].stat`);
 *    (2) every one of the NINE positions the converter can emit as null is `.nullable()` here
 *        (`statblock_wikilink`, `turn_order_source_quote`, the `lifecycle` node, `lifecycle.recreate_on`,
 *        `lifecycle.previous_instance_perishes`, `lifecycle.vanishes_if_owner_dies`,
 *        `lifecycle.vanishes_after`, the `autonomy` node, `base_statblock`), because `z.string().optional()`
 *        alone REJECTS `null` (measured).
 *  No `.min(1)`, no `.strict()` and no `.refine()` at any node either. THE REASON: `parseClass` and its siblings
 *  refuse a WHOLE document on one nested leaf failure, so a value the converter emits and this mirror rejects
 *  would lose an entire class, subclass or race note. The converter's own schema is `.strict()` with nine enums
 *  and a turn-order refine; mirroring that strictness here would make every future vocabulary addition a
 *  total-loss event. EXECUTED 2026-09-07: this exact shape parses 47 / 47 cache blocks and round-trips each
 *  byte-identically, while dropping `.nullable()` from `lifecycle.recreate_on` alone drops it to 36 / 47.
 *  KEY ORDER IS LOAD-BEARING at the top level and at every nested node: it is the converter's declaration
 *  order, and that 47-block instrument compares `JSON.stringify` output, so a key added out of that order
 *  reds the round trip for a non-reason. Add a key where the converter declares it. */
const companionSchema = z.object({
  statblock: z.string().optional(),
  statblock_wikilink: z.string().nullable().optional(),
  count: z.string().optional(),
  count_scaling: z.array(z.object({
    level: z.number().optional(), count: z.string().optional(), source_quote: z.string().optional(),
  })).optional(),
  shares_action_economy: z.boolean().optional(),
  turn_order: z.string().optional(),
  turn_order_source_quote: z.string().nullable().optional(),
  proficiency_bonus_scaled: z.array(z.object({
    stat: z.string().optional(), formula: z.string().optional(), source_quote: z.string().optional(),
  })).optional(),
  lifecycle: z.object({
    created_by: z.string().optional(),
    recreate_on: z.string().nullable().optional(),
    previous_instance_perishes: z.boolean().nullable().optional(),
    vanishes_if_owner_dies: z.boolean().nullable().optional(),
    vanishes_after: z.string().nullable().optional(),
    source_quote: z.string().optional(),
  }).nullable().optional(),
  autonomy: z.object({
    when: z.string().optional(), behaviour: z.string().optional(), source_quote: z.string().optional(),
  }).nullable().optional(),
  variants: z.array(z.object({
    axis: z.string().optional(), choices: z.array(z.string()).optional(),
    chosen_at: z.string().optional(), source_quote: z.string().optional(),
  })).optional(),
  base_statblock: z.string().nullable().optional(),
  overrides: z.array(z.object({
    field: z.string().optional(), value: z.string().optional(), source_quote: z.string().optional(),
  })).optional(),
  source_quote: z.string().optional(),
});

/**
 * The feature OBJECT, declared once (R4-G6 §4.2). Typed against the `Feature` interface so a wrong leaf fails
 * `tsc`; exported UN-REFINED for the monster schema, whose name-only authored traits the hand parser accepted.
 * The recursion runs through the REFINED schema so a nested class sub_feature keeps the description-or-entries
 * rule; the refined `featureSchema` below keeps its exported `z.ZodType<unknown>` for every other root.
 */
export const featureObjectSchema: z.ZodType<Feature> = z.lazy(() =>
  z.object({
    id: z.string().min(1).optional(),
    name: z.string().min(1),
    description: z.string().optional(),
    entries: z.array(z.string()).optional(),
    choices: z.array(choiceSchema).optional(),
    grants_resource: z.string().optional(),
    consumes: resourceConsumptionSchema.optional(),
    attacks: z.array(attackSchema).optional(),
    action: z.enum(["action", "bonus-action", "reaction", "free", "special"]).optional(),
    trigger: z.string().optional(),
    dc_formula: z.string().optional(),
    effects: z.array(featureEffectSchema).optional(),
    sub_features: z.array(featureSchemaTyped).optional(),
    resources: z.array(resourceSchema).optional(),
    // Phase 3 activatable buffs: a feature flagged `activatable` folds its effects
    // only while its id is present in state.active_buffs. `passive` renders a tag;
    // `duration` is a static label (no live countdown this phase).
    activatable: z.boolean().optional(),
    passive: z.boolean().optional(),
    duration: durationSchema.optional(),
    // Converter feature-level keys (164 census strip rows, class 80 + subclass 84; counts per finding 2):
    class_source: z.string().min(1).optional(),          // class 646 + subclass 1616 leaves
    rendering_hint: z.string().optional(),               // always "" — NEVER .min(1)
    subclass_short_name: z.string().min(1).optional(),   // 1616
    subclass_source: z.string().min(1).optional(),       // 1616
    header: z.number().optional(),                       // 1,237 carriers, ALL numbers
    is_class_feature_variant: z.boolean().optional(),
    gain_subclass_feature: z.boolean().optional(),
    gain_subclass_feature_has_content: z.boolean().optional(),
    type: z.string().min(1).optional(),                  // values {"inset","item"}
    recharge: z.object({                                 // ONE class doc (UA Mystic), FOUR features, ALL
      type: z.enum(["recharge_on_roll", "per_day", "per_short_rest", "per_long_rest"]),   // {type:"per_day",param:1..4}
      param: z.number(),                                 // tree-wide nested-recharge type census: exactly these
    }).optional(),                                       // four members (gate1-r1 f9) = the EXISTING FeatureRecharge type
    // SRD-BUNDLE-side keys (the converter emits NEITHER at feature level; finding 14 — our own
    // generator emits them and featureSchema strips them, losing the SRD Dragonborn Breath Weapon's
    // action cost and save DC). MAPPED since R4-G3a §10: `action_cost` is aliased onto `action` by
    // the race / class / subclass parsers, and `save` renders as the feature card's Save line
    // (`dc_formula` is echoed as TEXT, never evaluated).
    action_cost: actionCostEnum.optional(),  // ONE vocabulary, imported from schemas/resource-schema
        // (no cycle: resource-schema imports neither; two spellings of a closed enum is the G1a
        // "fifth enum consumer" drift — gate1-r2 NEW-12)
    save: z.object({ ability: z.string().min(1), dc_formula: z.string().min(1) }).optional(),
    // R4-G5 §7 (ruling G5-UR2): DECLARED so the class / subclass / race parsers stop stripping it on the day the
    // G7 re-emit lands. The converter withholds it today (`P9_NOT_EMITTED_FIELDS`), so 0 converted and 0 bundle
    // documents carry it and the census cannot see this key in either state (§12.1); the 47-block cache
    // round-trip in `tests/feature-schema-widening.test.ts` is its instrument.
    companion: companionSchema.optional(),
  }),
);

const featureSchemaTyped: z.ZodType<Feature> = featureObjectSchema.refine(
  (f) => f.description !== undefined || (f.entries !== undefined && f.entries.length > 0),
  { message: "feature requires either description or non-empty entries" },
);

export const featureSchema: z.ZodType<unknown> = featureSchemaTyped;
