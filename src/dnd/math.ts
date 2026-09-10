import { CR_PROFICIENCY, CR_XP, SIZE_HIT_DICE, ABILITY_KEYS, DAMAGE_TYPES } from "./constants";

export function abilityModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

export function formatModifier(mod: number): string {
  return mod >= 0 ? `+${mod}` : `${mod}`;
}

export function proficiencyBonusFromCR(cr: string): number {
  return CR_PROFICIENCY[cr] ?? 2;
}

/** Proficiency bonus by total character level (1-20) */
export function proficiencyFromLevel(level: number): number {
  if (level < 5) return 2;
  if (level < 9) return 3;
  if (level < 13) return 4;
  if (level < 17) return 5;
  return 6;
}

export function crToXP(cr: string): number {
  return CR_XP[cr] ?? 0;
}

export function hitDiceSizeFromCreatureSize(size: string): number {
  return SIZE_HIT_DICE[size.toLowerCase()] ?? 8;
}

export function hpFromHitDice(hitDiceCount: number, hitDiceSize: number, conMod: number): number {
  const avg = Math.floor(hitDiceCount * (hitDiceSize + 1) / 2 + hitDiceCount * conMod);
  return Math.max(1, avg);
}

export function parseHitDiceFormula(formula: string): { count: number; size: number } | null {
  const match = formula.match(/^(\d+)d(\d+)/i);
  if (!match) return null;
  return { count: parseInt(match[1], 10), size: parseInt(match[2], 10) };
}

export function savingThrow(abilityScore: number, isProficient: boolean, profBonus: number): number {
  return abilityModifier(abilityScore) + (isProficient ? profBonus : 0);
}

export function skillBonus(abilityScore: number, proficiency: "none" | "proficient" | "expertise", profBonus: number): number {
  const mod = abilityModifier(abilityScore);
  if (proficiency === "expertise") return mod + profBonus * 2;
  if (proficiency === "proficient") return mod + profBonus;
  return mod;
}

/**
 * Passive score for any skill: 10 + skill bonus. Generalizes `passivePerception`.
 * Use this for Passive Investigation (INT) and Passive Insight (WIS).
 */
export function passive(abilityScore: number, proficiency: "none" | "proficient" | "expertise", profBonus: number): number {
  return 10 + skillBonus(abilityScore, proficiency, profBonus);
}

export function passivePerception(wisScore: number, perceptionProf: "none" | "proficient" | "expertise", profBonus: number): number {
  return passive(wisScore, perceptionProf, profBonus);
}

export function attackBonus(abilityScore: number, profBonus: number): number {
  return abilityModifier(abilityScore) + profBonus;
}

export function saveDC(abilityScore: number, profBonus: number): number {
  return 8 + profBonus + abilityModifier(abilityScore);
}

export function abilityNameToKey(name: string): (typeof ABILITY_KEYS)[number] | null {
  const lower = name.toLowerCase();
  if ((ABILITY_KEYS as readonly string[]).includes(lower)) {
    return lower as (typeof ABILITY_KEYS)[number];
  }
  return null;
}

/** The canonical damage types as a lower-cased membership set. `DAMAGE_TYPES` is the vocabulary; this
 *  is the test the damage-rider rules read (R4-G7 T6a E-4). */
const CANONICAL_DAMAGE_TYPES = new Set(DAMAGE_TYPES.map((t) => t.toLowerCase()));

/** Is `type` one of the canonical damage types, whatever its casing? A rider whose declared type is
 *  anything else, a sentinel (`weapon`, `chosen`) or prose ("same as the weapon's type"), INHERITS the
 *  weapon row's own damage type; `pc.recalc.ts` resolves that where the rider is merged onto the row,
 *  never in a renderer, and never from a list of prose spellings. */
export function isCanonicalDamageType(type: string): boolean {
  return CANONICAL_DAMAGE_TYPES.has(type.trim().toLowerCase());
}

/** Can a damage rider be printed INSIDE the damage text, as a dice chip? Only when it reads as a dice
 *  expression or a (signed) number, optionally followed by ONE canonical damage type: `1d6`, `+2`,
 *  `1d6 fire`. Anything else is prose ("your Wisdom modifier necrotic", "half your fighter level
 *  slashing") and belongs in the row's caption instead (R4-G7 T6a E-4 (c)).
 *
 *  `text` is the rider's PRINTED form, its amount plus its resolved damage type, because a shipped
 *  rider may carry the type inside the amount itself (`{amount: "1d6 fire"}` with no `damage_type`, the
 *  migrated manual override of `pc.equipment.ts`). */
export function isRenderableDamageText(text: string): boolean {
  const m = /^(?:\d*d\d+(?:\s*[+-]\s*\d+)?|[+-]?\d+)(?:\s+(.*))?$/i.exec(text.trim());
  if (!m) return false;
  const type = (m[1] ?? "").trim();
  return type === "" || isCanonicalDamageType(type);
}
