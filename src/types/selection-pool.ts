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
 *  derivation is UNCONDITIONAL: it runs whether or not the declaration carries a `layout`. The plugin
 *  reads only the AUTHORED value today (`TabsContainer`'s dynamic-pool-tab loop,
 *  `decl.renders.layout ?? "spell-like"`);
 *  R4-G4 T5 is what makes an authored layout win over the derived one THERE. The G5 families
 *  (pool-selection, granted-die-to-ally, stance) get their values when they get UI. */
export type PoolLayout = "spell-like" | "blocks" | "dice-pool" | "point-pool";

/** A data-declared tab that renders a pool (one generic pool-tab per declaration). */
export interface TabDecl {
  id: string;
  label: string;
  renders: { pool: string; layout?: PoolLayout };
}
