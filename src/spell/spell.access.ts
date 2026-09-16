import type { EntityRegistry, RegisteredEntity } from "@archivist-gg/core";
import type { Spell } from "./spell.types";
import { baseClassName } from "../class/class.slug";

export interface SpellCandidate {
  slug: string;
  name: string;
  level: number;
  entity: Spell;
}

const LISTED_CLASS_NAMES = new WeakMap<EntityRegistry, { count: number; names: ReadonlySet<string> }>();

/**
 * Every base class name ANY spell in the registry names in its `classes`, registry-wide. The scope is the whole
 * registry because `classSpellCandidates` enumerates the whole registry: the question this answers is only ever
 * "can this name select anything at all here".
 *
 * Cached per registry, keyed on `registry.count()`, the same idiom and the same known gap as
 * `pc.spellcasting.ts`'s per-compendium `listedSpellClassNames` (core exposes no change generation, so the count
 * is the only key; re-registering an existing slug in place with a different `classes` list is not seen until the
 * count next moves). Kept HERE rather than imported from `pc/` so the spell layer does not depend on the pc layer,
 * and RIDER-19's shipped per-compendium walk is left untouched.
 */
function listedClassNames(registry: EntityRegistry): ReadonlySet<string> {
  const count = registry.count();
  const cached = LISTED_CLASS_NAMES.get(registry);
  if (cached && cached.count === count) return cached.names;
  const names = new Set<string>();
  for (const e of registry.search("", "spell", Number.POSITIVE_INFINITY)) {
    const classes = (e.data as { classes?: unknown }).classes;
    if (!Array.isArray(classes)) continue;
    for (const c of classes) names.add(baseClassName(String(c)));
  }
  LISTED_CLASS_NAMES.set(registry, { count, names });
  return names;
}

/**
 * Pure spell-picker filter. Enumerates all `spell` entities from the registry
 * (an empty query returns every spell of the type), drops already-known slugs,
 * then applies the name search and — unless `showAll` is set — the class/level
 * gate. Results are sorted by level then name.
 */
export function classSpellCandidates(
  registry: EntityRegistry,
  classSlugs: string[],
  maxLevel: number,
  knownSlugs: Set<string>,
  showAll = false,
  query = "",
): SpellCandidate[] {
  // No cap: the docblock's "enumerates all spell entities" is now literally
  // true. A 1,000 limit silently truncated the pool BEFORE the known-slug drop,
  // the name search and the class/level gate below, so a large vault lost real
  // candidates with no diagnostic. The sole caller (the add-drawer) filters
  // visibility after this returns and pages the DOM, so filter-before-slice and
  // paged browse both still hold.
  const all: RegisteredEntity[] = registry.search(query, "spell", Number.POSITIVE_INFINITY);
  const q = query.toLowerCase();
  // Class slugs arrive compendium-qualified (e.g. `srd-5e_wizard`), but a spell's
  // `classes` list is bare (`wizard`) — normalize both sides to the bare name.
  const classSet = new Set(classSlugs.map((s) => baseClassName(s)));
  // R4-G7 T8 rider wave F (RIDER-46): a caster whose base class name NO spell in the registry lists cannot narrow
  // the pool. Narrowing by it can only ever yield the empty set, so the gate carries no information and is dropped;
  // the LEVEL gate stays, and so does everything else (the known-slug drop, the name search, the sort).
  // The live carrier is the SUBCLASS-granted caster: an Arcane Trickster or an Eldritch Knight casts on the ROGUE's
  // or the FIGHTER's class slug (the drawer's axis is `spellcastingClasses[].classSlug`) while its spells say
  // `wizard`, and no shipped subclass names a `spell_list` for the resolver to carry instead. Union semantics, as
  // the gate has always had: ONE such caster in a multiclass opens the pool for the whole character.
  // When the converter emits `spell_list` on those subclasses, the caller should pass `spellList ?? classSlug` and
  // this fallback stops firing for them on its own (every shipped `spell_list` today equals its own class name).
  // The walk is skipped entirely when there is nothing to check: an empty `classSet` (a non-caster) still selects
  // nothing without `showAll`, exactly as before, and `showAll` never reaches the gate at all.
  let unlistable = false;
  if (!showAll && classSet.size > 0) {
    const listed = listedClassNames(registry);
    unlistable = [...classSet].some((n) => !listed.has(n));
  }

  return all
    .filter((e) => !knownSlugs.has(e.slug))
    .map((e) => {
      const entity = e.data as unknown as Spell;
      return { slug: e.slug, name: e.name, entity, level: entity.level ?? 0 };
    })
    .filter((c) => {
      if (q && !c.name.toLowerCase().includes(q)) return false;
      if (showAll) return true;
      if (c.level > maxLevel) return false;
      if (unlistable) return true;
      const classes = (c.entity.classes ?? []).map((x) => baseClassName(x));
      return classes.some((x) => classSet.has(x));
    })
    .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
}
