/**
 * R4-G3a §5.2 · the tag mechanism's DATA tables — the single source of every roll/outcome tag
 * TEXT the plugin's three chip surfaces render.
 *
 * Invariant 3: captions and tag texts derive from the effect's own fields through ONE
 * data-shaped table per concern; a closed vocabulary `switch` on game data inside a component is
 * the smell this replaces (all three surfaces spelled `mode === "advantage" ? "ADV" : "DIS"`,
 * which renders "DIS" for a `reroll` the moment `mode` widens — a green tree with a false chip).
 *
 * `Record<RollModifierMode, …>` / `Record<RollKind, …>` are load-bearing: the aliases come from
 * `pc.types.ts`, so widening `RollModifierEntry.mode` without extending these tables is a COMPILE
 * error, not a silent misrender (§14 row 8i's control).
 *
 * `ROLL_MODE_WORD` and `ROLL_NOUN` are the PROSE halves (Task 3 consumes them for feature-card
 * captions); `ROLL_MODE_TAG` is the terse chip half. Never an "EVA" literal for the outcome tag —
 * Evasion is only one of four bearers, and Spellfire Sorcery is not Evasion.
 */
import type { RollModifierMode, RollKind } from "./pc.types";

export const ROLL_MODE_TAG: Record<RollModifierMode, string> = { advantage: "ADV", disadvantage: "DIS", reroll: "RR", "add-d4": "+D4" };
export const ROLL_MODE_WORD: Record<RollModifierMode, string> = { advantage: "advantage", disadvantage: "disadvantage", reroll: "a reroll", "add-d4": "+1d4" };
export const ROLL_NOUN: Record<RollKind, string> = { "ability-check": "ability checks", "saving-throw": "saving throws", attack: "attack rolls" };
export const AUTO_FAIL_TAG = "AUTO-FAIL";

/** The two closed `save-outcome` enums as display glyphs: how much damage you still take. */
export const OUTCOME: Record<"none" | "half" | "full", string> = { none: "0", half: "½", full: "1" };

/** `{none, half}` → "0/½": success outcome over failure outcome. */
export const saveOutcomeTag = (onSuccess: keyof typeof OUTCOME, onFailure: keyof typeof OUTCOME): string =>
  `${OUTCOME[onSuccess]}/${OUTCOME[onFailure]}`;
