import type { RegisteredEntity } from "@archivist-gg/core";
import type { ResolvedCharacter, ResolvedClass, ResolvedPool, ResolvedPoolEntry } from "./pc.types";
import type { SelectionPool } from "@archivist-gg/dnd5e/types/selection-pool";
import type { OptionalFeatureEntity } from "@archivist-gg/dnd5e/types/optional-feature.types";
import type { ResourceIndex } from "./pc.resources";
import { derivePoolLayout } from "./pool-layout";
import { readTableColumn } from "./pc.table-column";
import { wikilinkTailSlug } from "./pc.decision-engine";
import { bareEntitySlug } from "../entities/slug";

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
  const col = pool.count.column;

  const count = readTableColumn(entity.table, level, [col]) ?? 0;

  let anchorLevel = 1;
  for (let l = 1; l <= 20; l++) {
    const c = readTableColumn(entity.table, l, [col]);
    if (c != null && c >= 1) { anchorLevel = l; break; }
  }

  // One scan of all optional-features: build the prereq-filtered `available` list
  // AND a bare-slug → entry map for O(1) pick/grant resolution (mirrors
  // enumerateOptions' single-scan pattern). The map is built from the FULL scan
  // (not the prereq-filtered list) so a stored pick or explicit subclass grant
  // still resolves to its entity even when prereqs would hide it from `available`.
  const ft = pool.source.where.feature_type;
  const all = registry.search("", "optional-feature", Number.POSITIVE_INFINITY);
  const byBare = new Map<string, ResolvedPoolEntry>();
  const available: ResolvedPoolEntry[] = [];
  for (const e of all) {
    const d = e.data as unknown as OptionalFeatureEntity;
    const entry: ResolvedPoolEntry = { slug: e.slug, entity: d };
    byBare.set(bareEntitySlug(e.slug), entry);
    if (d.feature_type !== ft) continue;
    if (!(d.available_to ?? []).some((l) => wikilinkTailSlug(l) === ownerBare)) continue;
    if (levelPrereqMax(d) > level) continue;
    available.push(entry);
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

  const raw = (rc.choices[anchorLevel] as Record<string, unknown> | undefined)?.[pool.id];
  const selectedSlugs = Array.isArray(raw) ? (raw as string[]) : typeof raw === "string" ? [raw] : [];
  const selected = selectedSlugs
    .map((s) => byBare.get(bareEntitySlug(s)))
    .filter((e): e is ResolvedPoolEntry => e != null)
    .filter((e) => !grantedBare.has(bareEntitySlug(e.slug)));

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
