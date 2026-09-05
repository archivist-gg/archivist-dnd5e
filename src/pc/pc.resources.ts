import type { FeatureSource, ResolvedCharacter } from "./pc.types";

/** The level a resource granted via `source` scales against (R4-G4 §6.2.4, ONE derivation): the
 *  character's level in the granting class; for a `subclass` source the level in the class that OWNS
 *  that subclass; the total level for race / background / feat sources, or when the class is not found.
 *  `resourceBindings` (pc.resource-seed.ts) binds `class_level` through this same function, and the
 *  plugin's seed and die-label sites call it, so `class_level`, `scales_at` and the die can never disagree
 *  (before G4 the plugin resolved `scales_at` and the die against the TOTAL level: a Barbarian 5 / Fighter 5
 *  read the level-10 Rage count). */
export function resourceLevelFor(source: FeatureSource, resolved: ResolvedCharacter): number {
  if (source.kind === "class") {
    return resolved.classes.find((c) => c.entity?.slug === source.slug)?.level ?? resolved.totalLevel;
  }
  if (source.kind === "subclass") {
    return resolved.classes.find((c) => c.subclass?.slug === source.slug)?.level ?? resolved.totalLevel;
  }
  return resolved.totalLevel;
}
