/** `either` = recovered by a short OR a long rest (R4-G3a §8.2; the 43 "short or
 *  long rest" rows). Kept in step with `resetTriggerEnum` in schemas/resource-schema.ts. */
export type ResetTrigger = "short-rest" | "long-rest" | "either" | "dawn" | "dusk" | "turn" | "round" | "custom";
export type ActionCost = "action" | "bonus-action" | "reaction" | "free" | "special";

export interface ResourceDie {
  base: string;
  scaling?: Record<string, string>;
}

export interface ResourceRecovery {
  id: string;
  name: string;
  amount: number | string;
  action?: ActionCost;
  uses?: number;
  reset: ResetTrigger;
  /** The recovery KIND; absent = `uses` (R4-G4 §7, UR2), applied by the RESOLVER
   *  (pc/pc.resources.ts `resolveRecovery`) and never by a schema default, because
   *  the sheet reads RAW entities. ZERO shipped documents carry the key at this
   *  commit (measured 2026-09-05: `grep -rl "restores:"` over the converter corpus
   *  and `.compendium-bundle` returns 0 files); R4-G4 T2b's overlay stamps
   *  `spell-slots` on the bundle Wizard's two Arcane Recovery rows, which §7.1
   *  measured as the only spell-slot recoveries in shipped data. Kept in step with
   *  `resourceSchema.recovery` in schemas/resource-schema.ts. */
  restores?: "uses" | "spell-slots";
}

export interface ResourceScaleStep {
  level: number;
  max: string;
}

export interface ResourceConsumesLink {
  resource: string;
  amount: number;
}

export interface Resource {
  id: string;
  name: string;
  max_formula: string;
  scales_at?: ResourceScaleStep[];
  die?: ResourceDie;
  reset: ResetTrigger;
  consumes?: ResourceConsumesLink;
  recovery?: ResourceRecovery[];
}

export interface ResourceConsumption {
  source?: "resource" | "class-column" | "attack-dice";
  resource?: string;
  column?: string;
  /** The MINIMUM spend when `amount_max` is present, otherwise the exact spend. */
  amount: number;
  /** Upper bound of a RANGE spend (`amount` .. `amount_max`), int and positive.
   *  DECLARED only in R4-G3a §9: zero emitted carriers, zero readers; spending a
   *  range is G4's. Kept in step with `resourceConsumptionSchema` in
   *  schemas/resource-schema.ts, whose refine is undefined-safe. */
  amount_max?: number;
  expend_condition?: "roll_succeeds" | "roll_fails" | "target_takes_damage" | "always";
  free_uses?: {
    amount: number;
    reset: ResetTrigger;
    state_key?: string;
  };
}
