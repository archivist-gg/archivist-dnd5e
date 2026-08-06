/**
 * Canonical key for a defense value (damage type or condition).
 *
 * Deliberately SIMPLER than `toProfSlug` (pc.proficiency-normalize.ts): damage types and conditions carry
 * no apostrophes and no hyphens, so there is no U+2019 fold and no space-to-hyphen step. Do NOT reuse
 * `normKey` · it token-sorts and singularizes for weapon display names and is actively wrong here.
 *
 * The whole point of this function is that ONE normalizer serves every reader and writer on the defenses
 * path. Adding a second is the bug R4-P5 exists to remove.
 */
export function toDefenseSlug(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}
