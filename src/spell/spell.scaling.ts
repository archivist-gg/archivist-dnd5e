import type { Spell } from "./spell.types";

/** A spell repeats under higher levels only if it has a real upcast benefit. */
export function spellScales(spell: Spell): boolean {
  return (spell.casting_options?.length ?? 0) > 0 || (spell.at_higher_levels?.length ?? 0) > 0;
}

/** The `casting_options` field a scaled value was read from (R4-G7 T8 RIDER-16). */
export type SpellEffectField = "damage_roll" | "target_count" | "duration" | "desc";

/** A scaled value and the FIELD it came from, so a renderer decides where it prints from the field. */
export interface SpellEffectParts {
  field: SpellEffectField;
  /** As printed: the roll, `"<N> targets"`, the duration, or the authored sentence verbatim. */
  value: string;
}

/** The spell's base roll (`damage_roll`), trimmed, or null when absent, empty or whitespace-only. The ONE base-roll
 *  check: every reader of `damage_roll` (the scaling readers here, the spell card) goes through it. */
export function spellBaseRoll(spell: Spell): string | null {
  const roll = typeof spell.damage_roll === "string" ? spell.damage_roll.trim() : "";
  return roll !== "" ? roll : null;
}

/**
 * At-a-glance effect for casting a LEVELLED `spell` with a slot of `slotLevel`, WITH the field
 * it came from. Returns null when absent or untrustworthy.
 *
 * A structured `casting_options` entry for that slot (`type: "slot_level_<N>"`) wins: the FIRST
 * present field, in this order: `damage_roll`, `target_count`, `duration`, `desc` (so an option
 * carrying a roll AND a sentence yields the roll). A `target_count` that equals the slot level is
 * the known SRD-2014 bad encoding (e.g. Magic Missile 2nd->2 instead of 4) and is suppressed.
 *
 * With no option for the slot, the spell's BASE roll (`damage_roll`) answers at the spell's OWN
 * level only. Above it, whether the base roll is still the roll dealt is `spellBaseRollAtSlot`'s
 * question (it is when the damage does not scale); a SCALING spell missing its option above base
 * stays null here. A CANTRIP is never read by slot (null): its roll follows the character's level,
 * `spellEffectAtCharacterLevel`, even when it is cast from a scroll. This errs toward showing
 * nothing rather than a wrong number.
 */
export function spellEffectPartsAtSlot(spell: Spell, slotLevel: number): SpellEffectParts | null {
  const base = spell.level ?? 0;
  if (base === 0) return null;
  const opt = (spell.casting_options ?? []).find((o) => o.type === `slot_level_${slotLevel}`);
  if (!opt) {
    const roll = spellBaseRoll(spell);
    return roll !== null && slotLevel === base ? { field: "damage_roll", value: roll } : null;
  }
  if (opt.damage_roll) return { field: "damage_roll", value: opt.damage_roll };
  if (typeof opt.target_count === "number") {
    if (opt.target_count === slotLevel) return null; // 2014 bad-encoding guard
    return { field: "target_count", value: `${opt.target_count} targets` };
  }
  if (opt.duration) return { field: "duration", value: opt.duration };
  return opt.desc != null ? { field: "desc", value: opt.desc } : null;
}

/** What a slot option may scale while its roll stays the base: a `duration` or a `target_count` (at least one), with
 *  the `concentration` flag that rides with a duration (the shipped SRD 2024 Hex / Hunter's Mark rows). */
const NON_ROLL_SCALES = new Set(["duration", "target_count"]);
const NON_ROLL_OPTION_FIELDS = new Set([...NON_ROLL_SCALES, "concentration"]);

/**
 * The spell's BASE roll at a slot of `slotLevel` when the data PROVES its damage does not scale, so every slot at or
 * above the spell's level deals the base roll. Two proofs, and only these:
 *   (a) it has `slot_level_<N>` options and every one carries only a `duration` and / or a `target_count` (plus the
 *       `concentration` flag a duration carries): 2024 Hex and Hunter's Mark scale their duration, Magic Missile and
 *       Scorching Ray their target count;
 *   (b) it has no slot options AND no `at_higher_levels` text (Finger of Death).
 * Anything else is NOT proof: prose-only scaling (2014 Cure Wounds' "increases by 1d8 for each slot level above
 * 1st", with no options) would print the unscaled base on every upcast row, so it stays null there. The companion of
 * `spellEffectPartsAtSlot`: a row prints this roll beside a target count, and the duration a slot option carries
 * prints in its own cell. Null for a cantrip, below the spell's level, and when the spell has no base roll.
 */
export function spellBaseRollAtSlot(spell: Spell, slotLevel: number): string | null {
  const base = spell.level ?? 0;
  if (base === 0 || slotLevel < base) return null;
  const roll = spellBaseRoll(spell);
  if (roll === null) return null;
  const slotOptions = (spell.casting_options ?? []).filter((o) => /^slot_level_\d+$/.test(String(o.type ?? "")));
  if (slotOptions.length > 0) {
    const onlyNonRoll = slotOptions.every((o) => {
      const fields = Object.entries(o).filter(([k, v]) => k !== "type" && v != null).map(([k]) => k);
      return fields.some((k) => NON_ROLL_SCALES.has(k)) && fields.every((k) => NON_ROLL_OPTION_FIELDS.has(k));
    });
    return onlyNonRoll ? roll : null;
  }
  return (spell.at_higher_levels ?? []).some((t) => typeof t === "string" && t.trim() !== "") ? null : roll;
}

/** The value of `spellEffectPartsAtSlot`, without its field. */
export function spellEffectAtSlot(spell: Spell, slotLevel: number): string | null {
  return spellEffectPartsAtSlot(spell, slotLevel)?.value ?? null;
}

const PLAYER_LEVEL_TYPE = /^player_level_(\d+)$/;

/**
 * R4-G7 T8 RIDER-15 (F-NODICE (a)): a CANTRIP's damage roll at the character's total level, read from structured
 * `casting_options` (`type: "player_level_<N>"`). The roll of the HIGHEST `N <= characterLevel` wins: SRD 5e authors
 * one option per level from 5 to 20, SRD 2024 and the converter author only 5 / 11 / 17. An option with no roll or an
 * EMPTY one never qualifies (SRD 5e Acid Splash and Poison Spray open with `player_level_2..4` carrying
 * `damage_roll: ''`; Eldritch Blast 2024 authors `target_count` only). When no tier qualifies (below the first tier,
 * or tiers that carry no roll) the spell's BASE roll `damage_roll` answers: the tier-1 roll (Fire Bolt `1d10` at 4,
 * Eldritch Blast's per-beam `1d10` at any level). Null for a levelled spell, for a level that is not a finite number
 * (a fixture-built `derived` omits `totalLevel`), and when neither a tier nor a non-empty base roll exists.
 */
export function spellEffectAtCharacterLevel(spell: Spell, characterLevel: number): string | null {
  if ((spell.level ?? 0) !== 0 || !Number.isFinite(characterLevel)) return null;
  let best: { n: number; roll: string } | null = null;
  for (const opt of spell.casting_options ?? []) {
    const m = PLAYER_LEVEL_TYPE.exec(String(opt.type ?? ""));
    if (!m || typeof opt.damage_roll !== "string" || opt.damage_roll.trim() === "") continue;
    const n = Number(m[1]);
    if (n <= characterLevel && (best === null || n > best.n)) best = { n, roll: opt.damage_roll };
  }
  return best ? best.roll : spellBaseRoll(spell);
}

/** Owned slot levels strictly above the spell's base level (scaling spells only). */
export function upcastLevelsFor(spell: Spell, ownedSlotLevels: number[]): number[] {
  const base = spell.level ?? 0;
  if (base < 1 || !spellScales(spell)) return [];
  return ownedSlotLevels.filter((l) => l > base).sort((a, b) => a - b);
}
