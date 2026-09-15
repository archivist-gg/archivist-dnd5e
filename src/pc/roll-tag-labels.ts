/**
 * R4-G3a §5.2 · the tag mechanism's DATA tables: the single source of every roll/outcome tag
 * TEXT the plugin's three chip surfaces render.
 *
 * Invariant 3: captions and tag texts derive from the effect's own fields through ONE
 * data-shaped table per concern; a closed vocabulary `switch` on game data inside a component is
 * the smell this replaces (all three surfaces spelled `mode === "advantage" ? "ADV" : "DIS"`,
 * which renders "DIS" for a `reroll` the moment `mode` widens: a green tree with a false chip).
 *
 * `Record<RollModifierMode, …>` / `Record<RollKind, …>` are load-bearing: the aliases come from
 * `pc.types.ts`, so widening `RollModifierEntry.mode` without extending these tables is a COMPILE
 * error, not a silent misrender (§14 row 8i's control).
 *
 * `ROLL_MODE_WORD` and `ROLL_NOUN` are the PROSE halves (Task 3 consumes them for feature-card
 * captions); `ROLL_MODE_TAG` is the terse chip half.
 *
 * `ROLL_NOUN` is keyed `RollKind | "any"`, one member wider than the folded `RollModifierEntry`.
 * The fold FANS OUT `roll: "any"` into one entry per roll type (§6.2.1), so no chip surface ever
 * sees it; the RAW effect on a feature row still carries it, and Task 3 captions raw effects. Its
 * noun is "rolls" rather than a stand-in member: an `any` modifier covers checks, saves AND attacks
 * at once, so borrowing "ability checks" for it understates the scope in prose.
 *
 * Never an "EVA" literal for the outcome tag:
 * Evasion is only one of four bearers, and Spellfire Sorcery is not Evasion.
 */
import type { RollModifierMode, RollKind, SaveOutcome } from "./pc.types";

export const ROLL_MODE_TAG: Record<RollModifierMode, string> = { advantage: "ADV", disadvantage: "DIS", reroll: "RR", "add-d4": "+D4" };
export const ROLL_MODE_WORD: Record<RollModifierMode, string> = { advantage: "advantage", disadvantage: "disadvantage", reroll: "a reroll", "add-d4": "+1d4" };
export const ROLL_NOUN: Record<RollKind | "any", string> = { "ability-check": "ability checks", "saving-throw": "saving throws", attack: "attack rolls", any: "rolls" };
export const AUTO_FAIL_TAG = "AUTO-FAIL";

/** R4-G7 T8 RIDER-20 (F-ADV) · the ONE glyph a CONDITIONAL tag appends to its text: a `roll-modifier` entry that carries a
 *  `condition`, or a `scope` the normaliser could not map (the qualifier the converter left in `scope`), and a `save-outcome`
 *  entry that carries a `condition`. `ADV` alone reads "always"; `ADV*` says "only sometimes, hover for when". The chip
 *  carriers append it to the `ROLL_MODE_TAG` / `saveOutcomeTag` text, so the glyph is spelled here once. */
export const CONDITIONAL_TAG_MARK = "*";

/** The closed `save-outcome` result vocabulary as display glyphs: how much damage you still take.
 *  `Record<SaveOutcome, string>` (the alias from pc.types.ts) so the union is spelled once. */
export const OUTCOME: Record<SaveOutcome, string> = { none: "0", half: "½", full: "1" };

/** `{none, half}` → "0/½": success outcome over failure outcome. */
export const saveOutcomeTag = (onSuccess: SaveOutcome, onFailure: SaveOutcome): string =>
  `${OUTCOME[onSuccess]}/${OUTCOME[onFailure]}`;
