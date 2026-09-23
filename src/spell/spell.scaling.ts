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

/** The spell's base roll (`damage_roll`), or null when absent or empty. */
function baseRoll(spell: Spell): string | null {
  return typeof spell.damage_roll === "string" && spell.damage_roll.trim() !== "" ? spell.damage_roll : null;
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
 * With no option for the slot, the spell's BASE roll (`damage_roll`) answers when it is the roll
 * actually dealt there: at the spell's OWN level, and at any slot at or above it for a spell that
 * does not scale at all (a pact slot above a non-scaling spell's level). A SCALING spell missing
 * its option above base stays null: the base roll would be the wrong number there. This errs
 * toward showing nothing rather than a wrong number.
 */
export function spellEffectPartsAtSlot(spell: Spell, slotLevel: number): SpellEffectParts | null {
  const opt = (spell.casting_options ?? []).find((o) => o.type === `slot_level_${slotLevel}`);
  if (!opt) {
    const base = spell.level ?? 0;
    const roll = baseRoll(spell);
    if (roll === null || slotLevel < base) return null;
    return slotLevel === base || !spellScales(spell) ? { field: "damage_roll", value: roll } : null;
  }
  if (opt.damage_roll) return { field: "damage_roll", value: opt.damage_roll };
  if (typeof opt.target_count === "number") {
    if (opt.target_count === slotLevel) return null; // 2014 bad-encoding guard
    return { field: "target_count", value: `${opt.target_count} targets` };
  }
  if (opt.duration) return { field: "duration", value: opt.duration };
  return opt.desc != null ? { field: "desc", value: opt.desc } : null;
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
  return best ? best.roll : baseRoll(spell);
}

/** Owned slot levels strictly above the spell's base level (scaling spells only). */
export function upcastLevelsFor(spell: Spell, ownedSlotLevels: number[]): number[] {
  const base = spell.level ?? 0;
  if (base < 1 || !spellScales(spell)) return [];
  return ownedSlotLevels.filter((l) => l > base).sort((a, b) => a - b);
}
