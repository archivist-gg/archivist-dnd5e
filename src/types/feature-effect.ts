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
  | ({ kind: "skill-bonus"; skills: string[]; ability: Ability; minimum?: number } & Qualified)
  // `skills` absent = every skill (Jack of All Trades); a list narrows it (Remarkable Athlete). Applies only
  // where the effective proficiency tri is "none"; `round` defaults to "down".
  | ({ kind: "half-proficiency"; skills?: string[]; round?: "down" | "up" } & Qualified)
  | ({ kind: "immune-condition"; condition: string; while?: string } & Subject)
  | ({ kind: "resistance"; damage_type: string } & Qualified)
  | ({ kind: "hp-per-level-bonus"; value: number } & Qualified)
  // R4-G7 §7.3: `scales_at` carries the whole progression INSIDE the effect (the overlay map has no level
  // component); the engine takes the highest entry at or below the effect's OWN source level.
  | ({ kind: "speed-bonus"; mode: "walk" | "fly" | "swim" | "climb" | "burrow"; value: number; set?: boolean; scales_at?: { level: number; value: number }[] } & Qualified)
  | ({ kind: "attunement-limit"; value: number; scales_at?: { level: number; value: number }[] } & Qualified)
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
  // R4-G6b §5.2: the always-present unarmed row's die and ability set. `dice` REPLACES the flat `1` ("roll the die in
  // place of the normal damage"); `{ column }` reads the GRANTING class's table column at the character's level in
  // that class; `abilities` lists the abilities allowed beside STR (the best modifier wins; a listed DEX beats STR on
  // a tie, the finesse idiom). Read in recalc's `resolveUnarmedStrike`, never in `computeAttacks`.
  | ({ kind: "unarmed-strike"; dice?: string | { column: string }; abilities?: Ability[] } & Qualified)
  // `weapons` recognises the sentinel "chosen" (the wielder's chosen weapon) as well as explicit weapon slug(s).
  | ({ kind: "weapon-ability"; ability: Ability | "spellcasting"; weapons?: string | string[] } & Qualified)
  | ({
      kind: "roll-modifier";
      mode: "advantage" | "disadvantage" | "reroll" | "add-d4";
      roll: "ability-check" | "saving-throw" | "attack" | "any";
      scope?: string;
    } & Qualified)
  | ({ kind: "crit-range"; min_roll: number; applies_to?: "weapon" | "spell" | "all" } & Qualified)
  // `count` and every `scales_at[].count` are EXTRA attacks, not total attacks: recalc renders `1 + count`.
  | ({ kind: "extra-attack"; count: number; scales_at?: { level: number; count: number }[] } & Qualified)
  | ({ kind: "reroll-damage"; max_reroll: number; applies_to?: "weapon" | "spell" | "all"; once_per_die?: boolean } & Qualified)
  | ({ kind: "attack-rule"; flag: "no-ranged-in-melee-disadvantage" } & Qualified)
  // R4-G1a declared these seven arms inert (spec D3). R4-G3a gives SIX of them semantics:
  // `immunity` / `vulnerability` FOLD into the defenses pane (§3); `temp-hp` / `heal` /
  // `extra-action` are never folded at all, the plugin reads them RAW off the feature as
  // row-local captions (§4, invariant 5); `save-outcome` FOLDS into the save-chip tag rail (§5).
  // `ability-score-increase` folds FLAT at the fold since R4-G3b §4 (fixed-list arms only; `chosen` arms
  // are the ASI slot's second encoding; `max` is unread by user ruling).
  | ({ kind: "immunity"; damage_type: string } & Qualified)
  | ({ kind: "vulnerability"; damage_type: string } & Qualified)
  | ({ kind: "temp-hp"; amount: string } & Qualified)
  | ({ kind: "heal"; amount: string } & Qualified)
  | ({ kind: "ability-score-increase"; abilities: "chosen" | Ability[]; amount: number; choose: number | null; max: number | null } & Qualified)
  | ({ kind: "extra-action"; count: number; action_type: "action" | "bonus-action" | "reaction" } & Qualified)
  | ({ kind: "save-outcome"; ability: Ability | "any"; on_success: "none" | "half" | "full"; on_failure: "none" | "half" | "full"; applies_to: string | null } & Qualified);
