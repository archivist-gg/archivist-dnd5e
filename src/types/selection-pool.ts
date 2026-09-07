/** A (sub)class-declared selectable pool (e.g. Interdict Boons). The engine is
 *  generic: every game-specific string lives here in data, never in code. */
export interface SelectionPool {
  id: string;
  label: string;
  source: {
    entity_type: "optional-feature";
    where: { feature_type: string; available_to: "self" };
  };
  /** Pick count read from the owning class table column at the current level. */
  count: { column: string };
  replaceable?: boolean;
}

/** Subclass auto-grants that extend a named pool and do NOT count toward picks. */
export interface PoolGrant {
  pool: string;
  grants: Array<{ feature: string; at_level: number }>;
}

/** Presentation hint for a data-declared tab. `dice-pool` / `point-pool` are DERIVED from the
 *  members' `rendering_hint` at resolve time onto `ResolvedPool.layout` (pc/pool-layout.ts), and that
 *  derivation is UNCONDITIONAL: it runs whether or not the declaration carries a `layout`. R4-G4 T5
 *  LANDED the precedence in the plugin: `TabsContainer`'s dynamic-pool-tab loop reads the AUTHORED
 *  value first, then `ResolvedPool.layout`, then the `spell-like` default, and `PoolTab`'s `LAYOUTS`
 *  registry routes all four members (an unknown string degrades to `spell-like` and never throws).
 *  R4-G5 CLOSED that list, and NOT by adding values: `pool-selection` and `stance` never get a layout value
 *  (measured, spec §10: the three `stance`-hinted documents are field-identical to three unhinted siblings, and
 *  `pool-selection`'s meaning is delivered by `spell-like` plus the §5 head), and `granted-die-to-ally` is a
 *  PER-ROW affordance (`EntryAffordance` below), never a pool layout: mapping it here would bury four maneuvers
 *  under 39 on one vote of 43. This union keeps its four members and `RENDERING_HINT_LAYOUT` its two keys. */
export type PoolLayout = "spell-like" | "blocks" | "dice-pool" | "point-pool";

/** A PER-ENTRY affordance derived from ONE optional feature's own `rendering_hint` (R4-G5 §4.2.1). The sibling of
 *  `PoolLayout`, and deliberately not part of it: a layout is a POOL-level MAJORITY vote, so a hint carried by
 *  four of 43 maneuvers could never win one, and mapping it would be a monotone loss for the other 39. The table,
 *  the derivation and the caption live in `pc/pool-layout.ts`. ONE member today. */
export type EntryAffordance = "granted-die";

/** A data-declared tab that renders a pool (one generic pool-tab per declaration). */
export interface TabDecl {
  id: string;
  label: string;
  renders: { pool: string; layout?: PoolLayout };
}
