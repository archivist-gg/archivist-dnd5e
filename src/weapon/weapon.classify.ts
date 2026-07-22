import type { WeaponEntity } from "./weapon.types";
import { bareEntitySlug } from "../entities/slug";

/** The two attack modes a weapon supports, derived from data the SRD pipeline
 *  actually preserves. The SRD runtime data miscategorizes throwable MELEE
 *  weapons (dagger/spear/handaxe/javelin/light hammer/trident) as `*-ranged`,
 *  so the melee/ranged split is reconstructed here instead of trusted:
 *  a category-ranged weapon is PURE ranged only when it needs ammunition or
 *  loading, or is one of the two genuinely-ranged thrown weapons (dart, net —
 *  a closed SRD set; a homebrew weapon whose bare slug is exactly "dart"/"net"
 *  is force-classified pure ranged). Everything else category-ranged is a
 *  throwable melee weapon. `reach` is 5 ft, +5 with the reach property. */
export interface WeaponRangeModes {
  melee: { reach: number } | null;
  ranged: { normal: number; long: number; thrown: boolean } | null;
}

const PURE_RANGED_THROWN_SLUGS = new Set(["dart", "net"]);

export function classifyWeaponRange(
  weapon: Pick<WeaponEntity, "category" | "properties" | "range" | "slug">,
): WeaponRangeModes {
  const has = (p: string) => weapon.properties.some((x) => x === p);
  const isCatRanged = /ranged/.test(weapon.category);
  const pureRanged =
    isCatRanged &&
    (has("ammunition") || has("loading") || PURE_RANGED_THROWN_SLUGS.has(bareEntitySlug(weapon.slug)));
  if (pureRanged) {
    return {
      melee: null,
      ranged: weapon.range ? { normal: weapon.range.normal, long: weapon.range.long, thrown: false } : null,
    };
  }
  return {
    melee: { reach: 5 + (has("reach") ? 5 : 0) },
    ranged: weapon.range ? { normal: weapon.range.normal, long: weapon.range.long, thrown: true } : null,
  };
}
