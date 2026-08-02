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
// Deleting the pair is a FIVE-file change: this module, its `package.json`
// exports key (`./pc/pc.proficiency-query`), and the three tests that import
// it. Do not skip the key · `scripts/esbuild-dist.mjs` derives dist entry
// points from that hand-maintained map with no existence check, so a leftover
// key fails `prepare-publish` at RELEASE while `npm test` and `npm run
// typecheck` both stay green. That key is also what resolves the package
// subpath import in `tests/pc-recalc-feature-effects.test.ts` (vitest uses
// native self-reference · the alias fallback is commented out), so module and
// key have to go in the same commit, neither one first.
//
// Deleting would also strand three prose references: the
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
 *  proficiency today (`computeAppliedBonuses` takes `_profs` and ignores it),
 *  so this has no production caller either. Do NOT read that as "the
 *  `.specific` branch is dead": `normalizeArmorProf` in `pc.recalc.ts` routes
 *  an authored `armor: { specific: [...] }` block straight into it. No SRD
 *  entity uses that object form for armor yet, but `weapons:` and `tools:`
 *  already do in the same `proficiencies:` block, so it is one plausible
 *  keystroke away · and the function is published API besides. Trimming that
 *  branch could silently regress either. */
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
