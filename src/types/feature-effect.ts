import type { Ability } from "./choice";

export type SenseType = "darkvision" | "blindsight" | "tremorsense" | "truesight";

/** Present on every arm: whose numbers the effect changes. Absent === "self". The engine's fold readers skip
 *  every effect whose subject is present and not "self" (`foldsOnSelf` in pc.feature-effects.ts). */
type Subject = { subject?: string };
/** A prose qualifier, carried for display; on `apply-condition` and `immune-condition` the `condition` key is the
 *  condition NAME instead, so those two arms do not carry this qualifier. */
type Qualified = { condition?: string } & Subject;

/**
 * Hand-written MIRROR of `featureEffectSchema` (schemas/feature-effect-schema.ts). The two are cross-checked at the
 * four parser returns and by `_kindPin` in the schema file; edit both in the same commit.
 */
export type FeatureEffect =
  | ({ kind: "initiative-bonus"; value: number } & Qualified)
  | ({ kind: "immune-condition"; condition: string; while?: string } & Subject)
  | ({ kind: "resistance"; damage_type: string } & Qualified)
  | ({ kind: "hp-per-level-bonus"; value: number } & Qualified)
  | ({ kind: "speed-bonus"; mode: "walk" | "fly" | "swim" | "climb" | "burrow"; value: number; set?: boolean } & Qualified)
  | ({ kind: "sense"; type: SenseType; range: number } & Qualified)
  | ({
      kind: "apply-condition";
      condition: string;
      duration?: string;
      ends_on?: string[];
      save_repeat?: { ability: string; timing: string };
    } & Subject)
  | ({ kind: "damage-bonus"; damage_type: string; amount: string; applies_to?: "weapon" | "spell" | "all" } & Qualified)
  | ({
      kind: "proficiency";
      proficiency_type: "skill" | "tool" | "language" | "saving-throw" | "armor" | "weapon";
      value: string;
      expertise?: boolean;
    } & Qualified)
  | ({ kind: "ac-bonus"; value: number; requires_armor?: boolean } & Qualified)
  | ({ kind: "unarmored-ac"; abilities: Ability[]; base?: number; allow_shield?: boolean } & Qualified)
  // `weapons` recognises the sentinel "chosen" (the wielder's chosen weapon) as well as explicit weapon slug(s).
  | ({ kind: "weapon-ability"; ability: Ability | "spellcasting"; weapons?: string | string[] } & Qualified)
  | ({
      kind: "roll-modifier";
      mode: "advantage" | "disadvantage" | "reroll" | "add-d4";
      roll: "ability-check" | "saving-throw" | "attack" | "any";
      scope?: string;
    } & Qualified)
  | ({ kind: "crit-range"; min_roll: number; applies_to?: "weapon" | "spell" | "all" } & Qualified)
  | ({ kind: "extra-attack"; count: number } & Qualified)
  | ({ kind: "reroll-damage"; max_reroll: number; applies_to?: "weapon" | "spell" | "all"; once_per_die?: boolean } & Qualified)
  | ({ kind: "attack-rule"; flag: "no-ranged-in-melee-disadvantage" } & Qualified)
  // R4-G1a: declared, inert (spec D3). Semantics are G3's.
  | ({ kind: "immunity"; damage_type: string } & Qualified)
  | ({ kind: "vulnerability"; damage_type: string } & Qualified)
  | ({ kind: "temp-hp"; amount: string } & Qualified)
  | ({ kind: "heal"; amount: string } & Qualified)
  | ({ kind: "ability-score-increase"; abilities: "chosen" | Ability[]; amount: number; choose: number | null; max: number | null } & Qualified)
  | ({ kind: "extra-action"; count: number; action_type: "action" | "bonus-action" | "reaction" } & Qualified)
  | ({ kind: "save-outcome"; ability: Ability | "any"; on_success: "none" | "half" | "full"; on_failure: "none" | "half" | "full"; applies_to: string | null } & Qualified);
