import type { FeatureSource, ResolvedCharacter, ResolvedFeature, ResolvedPool, DerivedStats } from "./pc.types";
import type { Resource, ResourceRecovery, ResourceDie, ResourceScaleStep, ResetTrigger } from "../types/resource";
import { resolveSpellcasting } from "./pc.spellcasting";

/** The level a resource granted via `source` scales against (R4-G4 §6.2.4, ONE derivation): the
 *  character's level in the granting class; for a `subclass` source the level in the class that OWNS
 *  that subclass; the total level for race / background / feat sources, or when the class is not found.
 *  `resourceBindings` (pc.resource-seed.ts) binds `class_level` through this function, and R4-G4 T3
 *  (§6.2.4 / §6.2.5) routed the plugin's three former TOTAL-level reads through it too, so
 *  `class_level`, `scales_at` and the die can no longer disagree. T4 added a fourth read, the die label
 *  of `renderSpendControl`, and T5 a fifth, the die label of the pool tab's dice head.
 *
 *  The units, measured 2026-09-05 on the plugin tree that carries T5 with
 *  `grep -rn "resourceLevelFor(" packages/obsidian/src`, which returns FOUR lines: FIVE READS reach
 *  this function through FOUR call EXPRESSIONS living in FOUR functions across FOUR files. The
 *  expressions are the plugin SEED (`seedFeatureUses` in `pc.resource-seed.ts`, for the level it hands
 *  `resolveMaxCountAt`), the module-private `resourceLevel(id, ctx)` helper of
 *  `components/actions/feature-rows.ts` (which resolves the owner from `resolved.resources` and falls
 *  back to the total level when there is none), `renderSpendControl`
 *  (`components/actions/spend-control.ts`) and `renderPoolHead` (`components/pool-tab.ts`). The count
 *  of READS is one higher than the count of expressions because `resourceLevel` serves TWO
 *  `resolveScalingDie` die labels, one in `renderCardResource` and one in `formatFeatureAttackNote`:
 *  so THREE of the five reads call this function directly (the seed, the spend control, the pool head)
 *  and TWO reach it through `resourceLevel`. Each render-time reader passes the owner its index entry
 *  already carries, so a die label and the tracker beside it read the same level. So a
 *  Barbarian 5 / Fighter 5 reads the level-5 Rage count, not the level-10 one. */
export function resourceLevelFor(source: FeatureSource, resolved: ResolvedCharacter): number {
  if (source.kind === "class") {
    return resolved.classes.find((c) => c.entity?.slug === source.slug)?.level ?? resolved.totalLevel;
  }
  if (source.kind === "subclass") {
    return resolved.classes.find((c) => c.subclass?.slug === source.slug)?.level ?? resolved.totalLevel;
  }
  return resolved.totalLevel;
}

export type ResourceOwner =
  | { kind: "feature"; featureId: string; featureName: string; source: FeatureSource }
  | { kind: "pool"; poolId: string; poolLabel: string; source: FeatureSource };
export type RecoveryKind = "uses" | "spell-slots";
export type RecoveryFlavour = "rest" | "manual";
export interface ResolvedRecovery { entry: ResourceRecovery; kind: RecoveryKind; flavour: RecoveryFlavour }
export interface ResolvedResource {
  id: string; name: string; reset: ResetTrigger; maxFormula: string;
  die?: ResourceDie; scalesAt?: ResourceScaleStep[];
  recovery?: ResolvedRecovery[];
  owner: ResourceOwner;
}
export type ResourceIndex = ReadonlyMap<string, ResolvedResource>;

/** KIND first (the schema key; absent = `uses`, UR2), FLAVOUR second (`action` / `reset`): a
 *  `spell-slots` entry is ALWAYS manual (the slot picker), whatever its action / reset say; a `uses`
 *  entry is a rest restore when its `reset` is `short-rest` or `long-rest` AND it carries no `action`,
 *  else manual (R4-G4 §7.2, invariant 12). The other rest-shaped triggers (`either`, `dawn`, `dusk`)
 *  read manual here: §7.1's partition of the 33 shipped entries has no carrier among them, and §15
 *  keeps the reset VOCABULARY of the rest arm deferred to G8. */
export function resolveRecovery(entry: ResourceRecovery): ResolvedRecovery {
  const kind: RecoveryKind = entry.restores ?? "uses";
  const restTriggered = (entry.reset === "short-rest" || entry.reset === "long-rest") && !entry.action;
  const flavour: RecoveryFlavour = kind === "spell-slots" ? "manual" : restTriggered ? "rest" : "manual";
  return { entry, kind, flavour };
}

function toResolvedResource(r: Resource, fallbackName: string, owner: ResourceOwner): ResolvedResource {
  return {
    id: r.id, name: r.name ?? fallbackName, reset: r.reset, maxFormula: r.max_formula,
    ...(r.die ? { die: r.die } : {}), ...(r.scales_at ? { scalesAt: r.scales_at } : {}),
    ...(r.recovery?.length ? { recovery: r.recovery.map(resolveRecovery) } : {}),
    owner,
  };
}

/** ONE walk over `features[].feature.resources` (the walk `findResourceById` used to do per call). The
 *  owner is the DECLARING feature; a duplicate id keeps the FIRST declaration (seeding keeps its own
 *  max-of-maxes merge). Reads the features array ONLY. `name` falls back to the owning feature's name,
 *  the rule `findResourceById` carried, for resources synthesised from older fixtures that omit it. */
export function resolveFeatureResources(features: ReadonlyArray<ResolvedFeature>): ResourceIndex {
  const out = new Map<string, ResolvedResource>();
  for (const rf of features) {
    for (const r of rf.feature.resources ?? []) {
      if (out.has(r.id)) continue;
      const owner: ResourceOwner = { kind: "feature", featureId: rf.feature.id ?? rf.feature.name, featureName: rf.feature.name, source: rf.source };
      out.set(r.id, toResolvedResource(r, rf.feature.name, owner));
    }
  }
  return out;
}

/** The full index: the feature resources (T2) plus, from T7b, the pool picks' own `uses`. A pure
 *  function of `resolved.features` (+ `resolved.pools` from T7b); `computeRestPlan` derives it, the
 *  resolver stores it on `resolved.resources`, and a test pins the two equal. */
export function resolveResourceIndex(resolved: ResolvedCharacter): ResourceIndex {
  return resolveFeatureResources(resolved.features ?? []);
}

/** 8 + prof + mod(ability) when the pool's owning class's subclass carries `spellcasting.ability` AND
 *  `resolveSpellcasting` returns null for that class (no caster profile: the Four Elements shape); null
 *  otherwise. Reads `subclass.spellcasting.ability` and NEVER `dc_formula` (R4-G4 §11.2). */
export function poolSaveDC(resolved: ResolvedCharacter, derived: DerivedStats, pool: ResolvedPool): number | null {
  const rc = resolved.classes[pool.classIndex];
  const ability = rc?.subclass?.spellcasting?.ability;
  if (!rc || !ability) return null;
  if (resolveSpellcasting(rc) !== null) return null;
  return 8 + derived.proficiencyBonus + derived.mods[ability];
}
