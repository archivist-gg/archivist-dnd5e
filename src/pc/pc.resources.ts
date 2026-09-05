import type { FeatureSource, ResolvedCharacter, ResolvedFeature, ResolvedPool, DerivedStats } from "./pc.types";
import type { Resource, ResourceRecovery, ResourceDie, ResourceScaleStep, ResetTrigger } from "../types/resource";
import { resolveSpellcasting } from "./pc.spellcasting";
import { isValidMaxFormula } from "../dnd/resource-formula";
import { warnOnce } from "../dnd/warn-once";

/** The level a resource granted via `source` scales against (R4-G4 §6.2.4, ONE derivation): the
 *  character's level in the granting class; for a `subclass` source the level in the class that OWNS
 *  that subclass; the total level for race / background / feat sources, or when the class is not found.
 *  `resourceBindings` (pc.resource-seed.ts) binds `class_level` through this function, and R4-G4 T3
 *  (§6.2.4 / §6.2.5) routed the plugin's three former TOTAL-level reads through it too, so
 *  `class_level`, `scales_at` and the die can no longer disagree. T4 added a fourth read, the die label
 *  of `renderSpendControl`, and T5 a fifth, the die label of the pool tab's dice head.
 *
 *  The units, re-measured 2026-09-06 on the SHIPPED plugin tree with
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
 *  keeps the reset VOCABULARY of the rest arm deferred to G8.
 *
 *  BOTH arms it routes are LANDED as of R4-G4 T7, and its CALLERS are counted here rather than its
 *  grep hits, because a docblock that names the function moves its own grep count. Measured
 *  2026-09-05 on both trees: dnd5e has exactly ONE caller, `toResolvedResource` below, which STAMPS
 *  the kind and the flavour onto every entry of every indexed resource, so `pushPartialRecoveries`
 *  (pc.rest.ts) reads that stamp to emit the rest arm's partial category and never calls this
 *  function itself; the plugin has exactly ONE, `renderRecoveryAction` (blocks/feature-card.ts),
 *  which calls it directly and picks the card's arm from the KIND, then the FLAVOUR
 *  (`grep -rn "resolveRecovery" packages/obsidian/src` returns THREE lines there: the import, that
 *  call and one docblock mention). */
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

/** The full index: the feature resources (`resolveFeatureResources`) plus the pool picks' own
 *  `uses` (R4-G4 §12, LANDED at T7b). A pure function of `resolved.features` and `resolved.pools`,
 *  each guarded `?? []` because the cast fixtures behind the rest suites in both repos carry
 *  neither; `computeRestPlan` derives it per call and never reads `resolved.resources`, the
 *  resolver stores it on `resolved.resources` after pools resolve, and the resolver suite pins the
 *  stored index equal to a fresh derivation. */
export function resolveResourceIndex(resolved: ResolvedCharacter): ResourceIndex {
  const out = new Map<string, ResolvedResource>(resolveFeatureResources(resolved.features ?? []));
  // R4-G4 §12: a pool pick's own `uses` never enters `resolved.features` (`collectResolvedFeatures`
  // never walks `pools`), so the index walks the picks themselves. Measured 2026-09-05 over the
  // converter corpus: 35 carriers, all optional-feature documents (21 invocation, 6 infusion, 6 rune,
  // 1 pact boon, 1 renown), of which 31 carry a numeric `max` and 4 a prose one. The owner is the
  // POOL, scaling at the OWNING class's level: `resourceLevelFor` finds that class by slug, so
  // `level` on the source is decorative here and carries the pool's `anchorLevel`.
  for (const pool of resolved.pools ?? []) {
    const rc = resolved.classes[pool.classIndex];
    const classSlug = rc?.entity?.slug;
    if (!classSlug) continue;
    for (const entry of [...(pool.selected ?? []), ...(pool.grants ?? [])]) {
      const uses = entry.entity.uses;
      // A feature-declared resource of the same id keeps its owner: the feature half is walked first.
      if (!uses || out.has(entry.slug)) continue;
      const maxFormula = String(uses.max);
      if (!isValidMaxFormula(maxFormula)) {
        warnOnce(`pool-uses:${entry.slug}`, `optional feature "${entry.slug}" has a prose uses.max (${JSON.stringify(uses.max)}); no tracker`);
        continue;
      }
      out.set(entry.slug, {
        id: entry.slug, name: entry.entity.name, reset: uses.recharge, maxFormula,
        owner: { kind: "pool", poolId: pool.id, poolLabel: pool.label, source: { kind: "class", slug: classSlug, level: pool.anchorLevel } },
      });
    }
  }
  return out;
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
