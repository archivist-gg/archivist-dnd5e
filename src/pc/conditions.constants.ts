export type ConditionSlug =
  | "blinded" | "charmed" | "deafened" | "frightened" | "grappled"
  | "incapacitated" | "invisible" | "paralyzed" | "petrified" | "poisoned"
  | "prone" | "restrained" | "stunned" | "unconscious";

export const CONDITION_SLUGS = [
  "blinded", "charmed", "deafened", "frightened", "grappled",
  "incapacitated", "invisible", "paralyzed", "petrified", "poisoned",
  "prone", "restrained", "stunned", "unconscious",
] as const satisfies readonly ConditionSlug[];
