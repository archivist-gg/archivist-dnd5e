// src/modules/pc/pc.proficiency-query.ts

import type { ArmorEntity } from "@archivist-gg/dnd5e/armor/armor.types";
import type { WeaponEntity } from "@archivist-gg/dnd5e/weapon/weapon.types";
import type { ProficiencySet } from "./pc.types";
import { normKey } from "./pc.proficiency-normalize";

// ─────────────────────────────────────────────────────────────────────────────
// NEITHER function below is a live gate. Both have zero production callers in
// this repo and in the archivist-obsidian plugin (verified R4-P3c, 2026-08);
// only tests reach them. They stay because they are the readable statement of
// the two matching rules, and because both are public API of the published
// package (`@archivist-gg/dnd5e/pc/pc.proficiency-query`) · "no caller" is a
// fact about these two repos, not a licence to trim branches an outside
// consumer may rely on.
//
// Deleting the pair is a 4-file change (this module plus the three tests that
// import it) and would strand three prose references: the
// `isWeaponSlugProficient` docblock in `pc.equipment.ts`, and comments in
// `tests/pc-recalc-proficiency-characterization.test.ts` and
// `tests/srd-canonical/overlay-effect-slugs.test.ts`. Deliberately out of scope.
// ─────────────────────────────────────────────────────────────────────────────

interface ProficienciesForQuery {
  armor: ProficiencySet;
  weapons: ProficiencySet;
  tools: ProficiencySet;
}

/** NOT the live weapon gate · that is `isWeaponSlugProficient` in
 *  `pc.equipment.ts`, reached from `computeAttacks`. The two are near-twins,
 *  NOT aliases: that function's docblock records where their matching diverges,
 *  so anything asserting runtime behaviour must call it, not this one. */
export function isProficientWithWeapon(
  weapon: WeaponEntity,
  profs: ProficienciesForQuery,
): boolean {
  if (profs.weapons.specific.some((e) => e === weapon.slug || normKey(e) === normKey(weapon.name))) return true;
  // weapon.category is "simple-melee" / "martial-ranged" / etc.;
  // class data uses "simple" / "martial" without melee/ranged split.
  const baseCategory = weapon.category.split("-")[0];
  return profs.weapons.categories.includes(baseCategory);
}

/** No live armor gate exists at all · nothing in the product gates on armor
 *  proficiency today, so this has no production caller either. Do NOT read that
 *  as "the `.specific` branch is dead": `normalizeArmorProf` in `pc.recalc.ts`
 *  routes an authored `armor: { specific: [...] }` block straight into it (no
 *  SRD entity uses that object form yet), and the function is published API
 *  besides, so trimming that branch could silently regress either. */
export function isProficientWithArmor(
  armor: ArmorEntity,
  profs: ProficienciesForQuery,
): boolean {
  if (profs.armor.specific.includes(armor.slug)) return true;
  if (profs.armor.categories.includes(armor.category)) return true;

  // Heavy implies medium and light; medium implies light.
  if (armor.category === "light" &&
      (profs.armor.categories.includes("medium") || profs.armor.categories.includes("heavy"))) return true;
  if (armor.category === "medium" && profs.armor.categories.includes("heavy")) return true;

  return false;
}
