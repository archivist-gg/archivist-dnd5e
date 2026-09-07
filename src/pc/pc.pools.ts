import type { RegisteredEntity } from "@archivist-gg/core";
import type { ResolvedCharacter, ResolvedClass, ResolvedPool, ResolvedPoolEntry } from "./pc.types";
import type { SelectionPool } from "@archivist-gg/dnd5e/types/selection-pool";
import type { OptionalFeatureEntity } from "@archivist-gg/dnd5e/types/optional-feature.types";
import type { ResourceIndex } from "./pc.resources";
import { derivePoolLayout } from "./pool-layout";
import { readTableColumn } from "./pc.table-column";
import { bareEntitySlug, wikilinkTailSlug } from "../entities/slug";
import { warnOnce } from "../dnd/warn-once";

/** Structural subset of EntityRegistry used here (lets tests pass a fake). */
export interface PoolRegistry {
  search(query: string, entityType: string, limit: number): RegisteredEntity[];
  getByTypeAndSlug(entityType: string, slug: string): RegisteredEntity | undefined;
}

export function levelPrereqMax(d: OptionalFeatureEntity): number {
  return (d.prerequisites ?? [])
    .filter((p): p is { kind: "level"; min: number } => p.kind === "level")
    .reduce((m, p) => Math.max(m, p.min), 0);
}

export function resolvePool(
  rc: ResolvedClass,
  classIndex: number,
  pool: SelectionPool,
  registry: PoolRegistry,
  index: ResourceIndex,
): ResolvedPool {
  const entity = rc.entity!;
  const level = rc.level;
  const ownerBare = bareEntitySlug(entity.slug);
  // The ONLY identity an owner and its candidates share is the SLUG PREFIX (R4-G5 §9.1): a parsed ClassEntity
  // carries no `compendium` (0 of 50 measured) and its `source` is a different vocabulary ("XPHB" / "PHB" /
  // "SRD 5.1") from the candidates'. Every one of the 8,925 install + bundle entities has a 3-part
  // `<compendium-slug>_<entity_type>_<name>` slug, over 15 distinct prefixes.
  const ownerPrefix = entity.slug.split("_")[0];
  const col = pool.count.column;

  const count = readTableColumn(entity.table, level, [col]) ?? 0;

  // The count-0 PAIRING, warned ONCE per pool (R4-G5 §5.2): a DECLARED pool whose `count.column` name
  // appears in NO `table[<level>].columns` row of the OWNING class's table, at ANY level 1-20. That pool
  // resolves `count` 0 at `anchorLevel` 1, which is the cross-edition pairing degradation (a 2024
  // subclass's namespaced column under a 5e class table, or any converter subclass under an SRD class).
  // The ledger KEEPS the recognizer's synthetic in that case (§3.2.4 shape A), so the level is never left
  // with no control; this warn is what makes the degradation visible instead of silent.
  //
  // THE PREDICATE IS ABSENT-FROM-EVERY-LEVEL-ROW, and it is NEVER `count === 0` and NEVER
  // "`readTableColumn` returned null at the CURRENT level". MEASURED 2026-09-07: 18 of the 22 authored
  // pool pairings on the 13-book install (23 over the whole converter output) carry a null column at
  // their low levels and a numeric one later: 5 class-declared (PHB 2024 Sorcerer metamagic, PHB 2014
  // Paladin fighting-style, PHB 2014 Ranger fighting-style, PHB 2014 Sorcerer metamagic, PHB 2014
  // Warlock pact-boon) plus all 13 subclass-declared, whose namespaced columns first appear at level 3
  // or 10. So either wrong predicate would warn on the normal shape of levelling (Sorcerer 1-2, Paladin 1,
  // Ranger 1, Warlock 1-2 on the five class pools), which is worse than silence. On every SAME-EDITION
  // pairing this warn is silent (0 of the 22 authored pairings warn, 39 of 39 cross-edition ones do), so it
  // is reachable only by a CHARACTER whose class document is not the subclass's `parent_class`.
  // `columnSeen` records whether ANY level carried a NON-NULL cell, and it is set BEFORE the `break`, so an
  // early exit at the first level carrying a value >= 1 cannot lose it; the loop runs all twenty levels
  // whenever no level carries a value >= 1 (an all-below-1 column runs all twenty and still counts as
  // seen), and the warn fires only when no level carried a cell at all.
  let anchorLevel = 1;
  let columnSeen = false;
  for (let l = 1; l <= 20; l++) {
    const c = readTableColumn(entity.table, l, [col]);
    if (c != null) columnSeen = true;
    if (c != null && c >= 1) { anchorLevel = l; break; }
  }
  if (!columnSeen) {
    warnOnce(`pool-column:${pool.id}`,
      `Archivist: pool "${pool.id}" declares count column "${col}", which "${entity.slug}"'s class table carries at no level; the pool resolves count 0 at anchor level 1`);
  }

  // ONE scan of all optional-features, over a TOTALLY ORDERED pool. `.slice()` before `.sort()` is load-bearing:
  // a registry (and every test double in this repo) may hand back a SHARED array, and sorting it in place would
  // leak across callers. The scan builds two things:
  //   * `byBare`, the FULL-scan bare-slug map, LAST-WINS, used for `pool_grants` and for step (3) of the pick
  //     resolution below. It is built from the full scan, NOT from the prereq-filtered list, so a stored pick or
  //     an explicit subclass grant still resolves to its entity even when a prerequisite hides it from
  //     `available`. CONSEQUENCE of the new sort, stated: last-wins now means the alphabetically LAST twin
  //     rather than the registration-order last. Shipped delta nil: the install's two `pool_grants` (both
  //     Elemental Attunement) are bare-unambiguous.
  //   * `candidates`, the prereq-filtered members GROUPED by bare slug in first-appearance order, which the
  //     collapse below reduces to one survivor each (R4-G5 §9.2.2).
  // The hidden-compendium VISIBILITY filter is deliberately NOT here: it is the plugin's, applied AFTER this
  // collapse on both surfaces (§3.2.2), because `resolvePool` has no visibility input.
  const ft = pool.source.where.feature_type;
  const all = registry.search("", "optional-feature", Number.POSITIVE_INFINITY)
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name) || a.slug.localeCompare(b.slug));
  const byBare = new Map<string, ResolvedPoolEntry>();
  const candidates = new Map<string, ResolvedPoolEntry[]>();
  for (const e of all) {
    const d = e.data as unknown as OptionalFeatureEntity;
    const entry: ResolvedPoolEntry = { slug: e.slug, entity: d, ...(e.compendium ? { compendium: e.compendium } : {}) };
    const bare = bareEntitySlug(e.slug);
    byBare.set(bare, entry);
    if (d.feature_type !== ft) continue;
    if (!(d.available_to ?? []).some((l) => wikilinkTailSlug(l) === ownerBare)) continue;
    if (levelPrereqMax(d) > level) continue;
    const group = candidates.get(bare);
    if (group) group.push(entry); else candidates.set(bare, [entry]);
  }

  // COLLAPSE cross-edition twins to ONE survivor per bare slug (R4-G5 §9.2.2): prefer the member whose slug
  // PREFIX equals the owner's; ELSE-ARM, stated: when no member shares it (an SRD 2024 Fighter's maneuver pool,
  // where 16 PHB 2014 + 4 PHB 2024 + 3 TCE members survive by name-then-slug) the rule is first-wins in that
  // order, with ONE warning per bare slug. Measured before to after at L20 on the 13-book install + bundle:
  // maneuver 43 to 23, invocation 82 to 59, metamagic 20 to 10, fighting_style 17 to 11, rune 6 to 6. INERT on
  // the SRD-only install: no SRD class or subclass declares a pool at all.
  const available: ResolvedPoolEntry[] = [];
  for (const [bare, group] of candidates) {
    if (group.length === 1) { available.push(group[0]); continue; }
    const owned = group.find((e) => e.slug.split("_")[0] === ownerPrefix);
    if (!owned) {
      warnOnce(`pool-collapse:${bare}`,
        `Archivist: pool "${pool.id}" holds ${group.length} cross-edition entries for "${bare}" and none shares the owner's compendium prefix "${ownerPrefix}"; keeping "${group[0].slug}"`);
    }
    available.push(owned ?? group[0]);
  }

  // pool_grants authoring (class OR subclass frontmatter):
  //   pool_grants:
  //     - pool: <pool id from selection_pools>
  //       grants:
  //         - feature: "[[boon-slug]]"
  //           at_level: 3
  // Granted picks render in the pool tab's "Granted" section and do NOT count
  // toward the pool's pick budget. Class- and subclass-declared grants merge;
  // duplicates (same feature) collapse to one; a feature that is both granted
  // and manually selected shows only as granted (granted wins, no pick consumed).
  const grantDecls = [
    ...(rc.entity?.pool_grants ?? []),
    ...(rc.subclass?.pool_grants ?? []),
  ];
  const grantsRaw = grantDecls
    .filter((g) => g.pool === pool.id)
    .flatMap((g) => g.grants)
    .filter((g) => g.at_level <= level)
    .map((g) => byBare.get(wikilinkTailSlug(g.feature)))
    .filter((e): e is ResolvedPoolEntry => e != null);
  const grantedBare = new Set<string>();
  const grants = grantsRaw.filter((e) => {
    const key = bareEntitySlug(e.slug);
    if (grantedBare.has(key)) return false;
    grantedBare.add(key);
    return true;
  });

  // Pick resolution with the SURVIVAL GUARD, over TWO indexes (R4-G5 §9.2.3). A stored slug resolves
  //   (1) to the collapsed `available` entry with that FULL slug;
  //   (2) else to the collapsed `available` entry with that BARE slug, i.e. the SURVIVING twin, so a stored
  //       higher-prerequisite twin below its level still renders CHECKED on its survivor rather than vanishing;
  //   (3) else to the full-scan entity at that full slug, else at that bare slug: a genuine prerequisite-failing
  //       pick, which `strandedPicks` then reports and the UI dresses "prerequisite unmet".
  // The list is DEDUPED by bare slug, first wins, so two stored twins consume ONE pick here, in the ledger
  // (which reads THIS resolved list, §3.2.3) and in the fold. A stored slug answering to no entity at all is
  // dropped, exactly as before.
  const bySlugAvailable = new Map(available.map((e) => [e.slug, e] as const));
  const byBareAvailable = new Map(available.map((e) => [bareEntitySlug(e.slug), e] as const));
  const resolveStored = (s: string): ResolvedPoolEntry | undefined => {
    const exact = bySlugAvailable.get(s);
    if (exact) return exact;
    const survivor = byBareAvailable.get(bareEntitySlug(s));
    if (survivor) return survivor;
    const full = registry.getByTypeAndSlug("optional-feature", s);
    if (full) {
      const d = full.data as unknown as OptionalFeatureEntity;
      return { slug: full.slug, entity: d, ...(full.compendium ? { compendium: full.compendium } : {}) };
    }
    return byBare.get(bareEntitySlug(s));
  };

  const raw = (rc.choices[anchorLevel] as Record<string, unknown> | undefined)?.[pool.id];
  const selectedSlugs = Array.isArray(raw) ? (raw as string[]) : typeof raw === "string" ? [raw] : [];
  const selected: ResolvedPoolEntry[] = [];
  const seenBare = new Set<string>();
  for (const s of selectedSlugs) {
    const entry = resolveStored(s);
    if (!entry) continue;
    const bare = bareEntitySlug(entry.slug);
    if (grantedBare.has(bare) || seenBare.has(bare)) continue;
    seenBare.add(bare);
    selected.push(entry);
  }

  const members = [...available, ...grants];
  const layout = derivePoolLayout(members);
  // Owner-aware (Gate 0 B1): the majority of the members' `consumes.resource` AMONG the ids the character owns.
  // The plain majority is wrong on the 13-book install (43 cross-edition maneuvers vote 23 / 20 for the OTHER
  // edition's id); intersecting with the owned ids fixes both the Battle Master and the Metamagic tab.
  const votes = new Map<string, number>();
  for (const e of members) {
    const id = e.entity.consumes?.resource;
    if (!id || !index.has(id)) continue;
    votes.set(id, (votes.get(id) ?? 0) + 1);
  }
  let resource: string | undefined;
  let bestN = 0;
  // ASYMMETRIC with derivePoolLayout ON PURPOSE (review M-4): the layout resolves a tie to `undefined`
  // (§4.2.2, Gate 0 Q8), this vote resolves one by insertion order, because §4.2.3 says only "the
  // majority AMONG THOSE wins" and names no tie rule. Measured 2026-09-05: a 1/1 tie between two OWNED
  // ids returns the id the FIRST voting member of `[...available, ...grants]` carried, silently. Live
  // exposure is nil (a character owns one superiority-dice id, not two); a second owned id would need
  // §4.2.3 to gain a tie rule first.
  for (const [id, n] of votes) if (n > bestN) { resource = id; bestN = n; }
  return {
    id: pool.id, label: pool.label, classIndex, count, anchorLevel, selected, available, grants,
    ...(layout ? { layout } : {}), ...(resource ? { resource } : {}),
  };
}

export function resolveAllPools(resolved: ResolvedCharacter, registry: PoolRegistry, index: ResourceIndex): ResolvedPool[] {
  const out: ResolvedPool[] = [];
  resolved.classes.forEach((rc, classIndex) => {
    if (!rc.entity) return;
    const decls = [...(rc.entity.selection_pools ?? []), ...(rc.subclass?.selection_pools ?? [])];
    const seen = new Set<string>();
    for (const pool of decls) {
      if (seen.has(pool.id)) continue;
      seen.add(pool.id);
      out.push(resolvePool(rc, classIndex, pool, registry, index));
    }
  });
  return out;
}

/** The stored picks that survived resolution but are NOT in the collapsed `available` list, compared by FULL
 *  slug: exactly the rule the plugin's `strandedSelections` used before T3 retires it (R4-G5 §3.2.3). Because
 *  §9.2.3's resolution rewrites a collapsed twin to its survivor, only a GENUINE prerequisite-failing pick (the
 *  one resolved by step 3 from the full scan) can land here, and it keeps its entity so the builder strip and the
 *  sheet can both dress it "prerequisite unmet". A granted feature is already excluded from `selected`, so a
 *  grant never appears here. Pure over the resolved pool: it reads nothing the resolver did not compute. */
export function strandedPicks(pool: ResolvedPool): ResolvedPoolEntry[] {
  const inAvailable = new Set(pool.available.map((e) => e.slug));
  return pool.selected.filter((e) => !inAvailable.has(e.slug));
}
