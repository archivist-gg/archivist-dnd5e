import { z } from "zod";
import { choiceSchema } from "./choice-schema";
import { actionCostEnum, resourceConsumptionSchema, resourceSchema } from "./resource-schema";
import { attackSchema } from "./attack-schema";
import { featureEffectSchema } from "./feature-effect-schema";
import { durationSchema } from "./duration-schema";

export const featureSchema: z.ZodType<unknown> = z.lazy(() =>
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
    sub_features: z.array(featureSchema).optional(),
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
    // action cost and save DC). DECLARED-ONLY: the alias MAPPING (action_cost→action, save→flat
    // dc_formula) is a pixel-changing repair owned by G3, named in §8.
    action_cost: actionCostEnum.optional(),  // ONE vocabulary, imported from schemas/resource-schema
        // (no cycle: resource-schema imports neither; two spellings of a closed enum is the G1a
        // "fifth enum consumer" drift — gate1-r2 NEW-12)
    save: z.object({ ability: z.string().min(1), dc_formula: z.string().min(1) }).optional(),
  }).refine(
    (f) => f.description !== undefined || (f.entries !== undefined && f.entries.length > 0),
    { message: "feature requires either description or non-empty entries" }
  ),
);
