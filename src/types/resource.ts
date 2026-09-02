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
  amount: number;
  expend_condition?: "roll_succeeds" | "roll_fails" | "target_takes_damage" | "always";
  free_uses?: {
    amount: number;
    reset: ResetTrigger;
    state_key?: string;
  };
}
