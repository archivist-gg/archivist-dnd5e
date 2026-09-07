import type { ResolveContext } from "@archivist-gg/core";
import type { MonsterRaw } from "./monster.codec";
import { getProficiencyBonus, getChallengeRatingXP } from "./monster.enrichment";
import { crString } from "./monster.format";
import type { MonsterCRStructured } from "./monster.types";

/**
 * Light, non-mutating derivation: computes proficiency bonus and XP from the
 * monster's challenge rating. Returns a new object; the input `raw` is untouched.
 */
export function resolveMonster(
  raw: MonsterRaw,
  _ctx: ResolveContext,
): MonsterRaw & { proficiency_bonus: number; xp: number } {
  // the two lookups take the bare CR text; the authored cr (string or object) passes through the spread untouched
  const cr = crString(raw.cr as string | MonsterCRStructured | undefined) ?? "0";
  return {
    ...raw,
    proficiency_bonus: getProficiencyBonus(cr),
    xp: getChallengeRatingXP(cr),
  };
}
