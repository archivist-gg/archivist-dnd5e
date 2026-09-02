import { z } from "zod";
import type { FeatureEffect } from "../types/feature-effect";

/**
 * The feature-effect union. TWO declarations exist on purpose and are cross-checked: this zod union (what parses)
 * and the hand-written `FeatureEffect` type in `types/feature-effect.ts` (what the engine reads). The four
 * entity parsers return zod output typed as the hand-written type, so widening one without the other is a
 * compile error there, and `_kindPin` below makes the discriminator sets equal by construction. Add an arm HERE
 * and THERE, in the same commit, and move the runtime list in the plugin's `feature-effect-schema.test.ts`.
 *
 * Placement rules (spec R4-G1a D1): `subject` on EVERY arm (absent === "self"; the engine drops non-self effects
 * before folding, see `foldsOnSelf`); the `condition` QUALIFIER on every arm except `apply-condition` and
 * `immune-condition`, where `condition` is the condition NAME; both are carried, never evaluated here.
 */
const abilityEnum = z.enum(["str", "dex", "con", "int", "wis", "cha"]);
/** Whose numbers the effect changes. Open string: the non-self vocabulary is unattested by any emitted corpus. */
const subjectField = z.string().min(1).optional();
/** A prose qualifier ("While raging"), carried for display; evaluated by nothing in this phase. */
const conditionField = z.string().optional();

export const featureEffectSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("initiative-bonus"), value: z.number().int(), condition: conditionField, subject: subjectField }),
  // `condition` here is the condition NAME (frightened, poisoned); the qualifier is `while`.
  z.object({ kind: z.literal("immune-condition"), condition: z.string().min(1), while: z.string().optional(), subject: subjectField }),
  z.object({ kind: z.literal("resistance"), damage_type: z.string().min(1), condition: conditionField, subject: subjectField }),
  z.object({ kind: z.literal("hp-per-level-bonus"), value: z.number().int(), condition: conditionField, subject: subjectField }),
  z.object({
    kind: z.literal("speed-bonus"),
    mode: z.enum(["walk", "fly", "swim", "climb", "burrow"]),
    value: z.number().int(),
    // when true, value is an absolute floor (Math.max), not additive; currently
    // only surfaced for mode:"walk" · other modes have no derived speed yet.
    set: z.boolean().optional(),
    condition: conditionField, subject: subjectField,
  }),
  z.object({
    kind: z.literal("sense"),
    type: z.enum(["darkvision", "blindsight", "tremorsense", "truesight"]),
    range: z.number().int().nonnegative(),
    condition: conditionField, subject: subjectField,
  }),
  // `condition` here is the condition NAME being applied.
  z.object({
    kind: z.literal("apply-condition"),
    condition: z.string().min(1),
    duration: z.string().optional(),
    ends_on: z.array(z.string()).optional(),
    save_repeat: z.object({ ability: z.string().min(1), timing: z.string().min(1) }).optional(),
    subject: subjectField,
  }),
  z.object({
    kind: z.literal("damage-bonus"),
    // intentionally an open string, NOT a damage-type enum: must accept the
    // literal "chosen" (player-selected damage type at action time) alongside
    // canonical damage types. Do not tighten to an enum.
    damage_type: z.string().min(1),
    amount: z.string().min(1),
    applies_to: z.enum(["weapon", "spell", "all"]).optional(),
    condition: conditionField, subject: subjectField,
  }),
  z.object({
    kind: z.literal("proficiency"),
    proficiency_type: z.enum(["skill", "tool", "language", "saving-throw", "armor", "weapon"]),
    value: z.string().min(1),
    expertise: z.boolean().optional(),
    condition: conditionField, subject: subjectField,
  }),
  z.object({ kind: z.literal("ac-bonus"), value: z.number().int(), requires_armor: z.boolean().optional(), condition: conditionField, subject: subjectField }),
  z.object({
    kind: z.literal("unarmored-ac"),
    abilities: z.array(abilityEnum),
    base: z.number().int().optional(),
    allow_shield: z.boolean().optional(),
    condition: conditionField, subject: subjectField,
  }),
  z.object({
    kind: z.literal("weapon-ability"),
    ability: z.union([abilityEnum, z.literal("spellcasting")]),
    weapons: z.union([z.literal("chosen"), z.string(), z.array(z.string())]).optional(),
    condition: conditionField, subject: subjectField,
  }),
  z.object({
    kind: z.literal("roll-modifier"),
    mode: z.enum(["advantage", "disadvantage", "reroll", "add-d4"]),
    roll: z.enum(["ability-check", "saving-throw", "attack", "any"]),
    scope: z.string().optional(),
    condition: conditionField, subject: subjectField,
  }),
  z.object({ kind: z.literal("extra-attack"), count: z.number().int().positive(), condition: conditionField, subject: subjectField }),
  z.object({
    kind: z.literal("crit-range"),
    min_roll: z.number().int().min(2).max(20),
    applies_to: z.enum(["weapon", "spell", "all"]).optional(),
    condition: conditionField, subject: subjectField,
  }),
  z.object({
    kind: z.literal("reroll-damage"),
    max_reroll: z.number().int().positive(),
    applies_to: z.enum(["weapon", "spell", "all"]).optional(),
    once_per_die: z.boolean().optional(),
    condition: conditionField, subject: subjectField,
  }),
  z.object({ kind: z.literal("attack-rule"), flag: z.enum(["no-ranged-in-melee-disadvantage"]), condition: conditionField, subject: subjectField }),
  // R4-G1a declared these seven converter-emitted arms with the engine folding NOTHING for them
  // (spec D3). R4-G3a §3-§7 gives SIX of them semantics: immunity / vulnerability FOLD (defenses
  // pane); temp-hp / heal / extra-action are still NOT folded, the plugin reads them raw as
  // row-local captions; save-outcome FOLDS (save-chip tag rail).
  // `ability-score-increase` is still DROPPED at the fold: it is G3b's (invariant 8).
  // Damage immunity / vulnerability. NOT `immune-condition`, which is condition immunity.
  z.object({ kind: z.literal("immunity"), damage_type: z.string().min(1), condition: conditionField, subject: subjectField }),
  z.object({ kind: z.literal("vulnerability"), damage_type: z.string().min(1), condition: conditionField, subject: subjectField }),
  // `amount` is the open non-empty STRING `damage-bonus.amount` already uses: "2d6", "5", "your Artificer level".
  z.object({ kind: z.literal("temp-hp"), amount: z.string().min(1), condition: conditionField, subject: subjectField }),
  z.object({ kind: z.literal("heal"), amount: z.string().min(1), condition: conditionField, subject: subjectField }),
  z.object({
    kind: z.literal("ability-score-increase"),
    // "chosen" follows `weapon-ability.weapons`; the list follows `unarmored-ac.abilities`.
    abilities: z.union([z.literal("chosen"), z.array(abilityEnum).min(1)]),
    amount: z.number().int().positive(),
    // Required-WITH-NULL, never optional: "the prose stated no cap" and "the extractor forgot" must not look alike.
    choose: z.number().int().positive().nullable(),
    max: z.number().int().positive().nullable(),
    condition: conditionField, subject: subjectField,
  }).refine((e) => (e.abilities === "chosen") === (e.choose !== null), {
    path: ["choose"], message: 'choose is required IFF abilities is "chosen": a fixed LIST is its own count',
  }),
  // `extra-action` is an additional ACTION on your turn; `extra-attack` is attacks WITHIN the Attack action.
  z.object({
    kind: z.literal("extra-action"),
    count: z.number().int().positive(),
    action_type: z.enum(["action", "bonus-action", "reaction"]),
    condition: conditionField, subject: subjectField,
  }),
  // `save-outcome` remaps the OUTCOME; `roll-modifier` modifies the ROLL.
  z.object({
    kind: z.literal("save-outcome"),
    ability: z.union([abilityEnum, z.literal("any")]),
    on_success: z.enum(["none", "half", "full"]),
    on_failure: z.enum(["none", "half", "full"]),
    applies_to: z.string().nullable(),
    condition: conditionField, subject: subjectField,
  }),
]);

// Spec D8: the two declarations cannot drift. `tsc -b` enforces this on every build (no tsconfig type-checks tests).
type Equals<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type ZodKinds = z.infer<typeof featureEffectSchema>["kind"];
type TsKinds = FeatureEffect["kind"];
const _kindPin: Equals<ZodKinds, TsKinds> = true;
void _kindPin;
