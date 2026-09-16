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
   *  the sheet reads RAW entities. The CARRIERS, re-measured 2026-09-05 after R4-G4
   *  T2b's regen shipped the bundle (this sentence was authored at T2, BEFORE that
   *  regen, and said ZERO, which it no longer is): `grep -rl "restores:" --include='*.md'`
   *  returns the TWO bundle Wizard notes (`SRD 2024/Classes/Wizard.md` and
   *  `SRD 5e/Classes/Wizard.md`), whose Arcane Recovery rows T2b's overlay stamps
   *  `spell-slots` and which §7.1 measured as the only spell-slot recoveries in shipped
   *  data; the embedded `.compendium-bundle/index.json` carries the key on one line for
   *  the same two rows; the converter corpus carries it on NO note. Kept in step with
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
  /** Presentation, carried and never interpreted by the engine: which control draws this resource.
   *  The renderer owns the hint → component table. */
  rendering_hint?: string;
  /** `band` = also drawn in the header strip; absent = the Resources tab alone. */
  surface?: "band" | "tab";
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
