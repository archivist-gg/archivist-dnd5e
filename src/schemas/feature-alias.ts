/** R4-G3a §10.2.1: the SRD bundle spells a race trait's action cost `action_cost`; the canonical key is
 *  `action`. Alias fills a hole, declared wins, never deleted (the `armor.parser.ts` strength_required
 *  precedent; the resolver's optional-feature grant alias is the in-repo precedent for the KEY).
 *
 *  No `package.json` exports entry, because the plugin never imports this module: the sheet's resolver
 *  applies the alias at resolve time through `withResolvedActionCost` (R4-G3a Task 12), and the ONE plugin
 *  site that reads a race trait's action cost off the RAW registry entity (the race block's tracker gate,
 *  R4-G3b §11) reads BOTH spellings with a nullish fallback rather than importing this helper. Not imported
 *  is NOT the same as parser-internal, and the module is not parser-internal: MEASURED 2026-09-04, every
 *  export here reaches the plugin's built `main.js`, `withResolvedActionCost` through `pc/pc.resolver.ts`
 *  and the raw-YAML aliasers through the race / class / subclass parsers, which the plugin pulls in with
 *  `dnd5ePack` (pack → entity types → codecs → parsers). What is parser-only is where the aliasers RUN:
 *  their three call sites are `race.parser.ts`, `class.parser.ts` and `subclass.parser.ts`, so they fire on
 *  the entity-note codec path and never on the sheet's, which reads RAW registry objects.
 *
 *  This one is applied on the RAW YAML object before `safeParse`, so the aliased value goes through the
 *  same enum validation as a declared one (an out-of-vocabulary `action_cost` refuses the document rather
 *  than smuggling a bad `action` past the schema). */
export function aliasFeatureActionCost(f: Record<string, unknown>): void {
  if (f.action === undefined && typeof f.action_cost === "string") f.action = f.action_cost;
}

/** The list form: race `traits[]`, and one level's `features_by_level[lvl]` array. Non-arrays and
 *  non-object members are left alone; a malformed document is the schema's business, not ours. */
export function aliasFeatureListActionCost(list: unknown): void {
  if (Array.isArray(list)) for (const f of list) if (f && typeof f === "object") aliasFeatureActionCost(f as Record<string, unknown>);
}

/** The `features_by_level` record form, shared by the class and subclass parsers. Zero bundle
 *  carriers live here today; it is aliased for symmetry so a future class-side `action_cost` is
 *  not a second silent routing bug. */
export function aliasFeaturesByLevelActionCost(byLevel: unknown): void {
  if (byLevel && typeof byLevel === "object")
    for (const list of Object.values(byLevel as Record<string, unknown>)) aliasFeatureListActionCost(list);
}

/** Resolve-time mirror of `aliasFeatureActionCost` (R4-G3a Task 12): the PC sheet resolves RAW registry entities
 *  (never parsed by dnd5e), so the parser-side alias is invisible to it. Returns the same object when nothing applies
 *  (registry entities are shared and must not be mutated), else a shallow copy with `action` filled from
 *  `action_cost`. Declared `action` wins. */
export function withResolvedActionCost<T extends { action?: unknown; action_cost?: unknown }>(f: T): T {
  return f.action === undefined && typeof f.action_cost === "string" ? { ...f, action: f.action_cost } : f;
}
