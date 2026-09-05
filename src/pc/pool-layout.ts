import type { PoolLayout } from "../types/selection-pool";
import type { ResolvedPoolEntry } from "./pc.types";

/** The ONE `rendering_hint` → `PoolLayout` table (R4-G4 §4.2.2, invariant 3): a DATA table in the
 *  RESET_LABELS shape. Absent keys (pool-selection, granted-die-to-ally, stance) route to the default
 *  until G5 adds them. */
export const RENDERING_HINT_LAYOUT: Readonly<Record<string, PoolLayout>> = {
  "dice-pool": "dice-pool",
  "point-pool": "point-pool",
};

/** The majority mapped hint over the pool's members; members with an empty or unmapped hint do not
 *  vote; no votes → undefined; a tie between two mapped values → undefined (Gate 0 Q8).
 *  UNMAPPED is decided by OWN-property lookup, never by truthiness of a plain index (review M-2):
 *  `rendering_hint` is a free `z.string().optional()` on converter data, so a member may carry any
 *  string, and an object-literal table answers the `Object.prototype` keys through the prototype
 *  chain. Measured 2026-09-05 on this table: `constructor`, `toString` and `hasOwnProperty` each index
 *  to a FUNCTION and each has `hasOwnProperty` false, while `dice-pool` is the only shape that is both
 *  a string and own. Without the guard a lone junk hint voted that function as the layout, and one
 *  junk member beside genuine `dice-pool` members collapsed a correct majority into a phantom tie. */
export function derivePoolLayout(entries: ReadonlyArray<ResolvedPoolEntry>): PoolLayout | undefined {
  const votes = new Map<PoolLayout, number>();
  for (const e of entries) {
    const hint = e.entity.rendering_hint ?? "";
    if (!Object.prototype.hasOwnProperty.call(RENDERING_HINT_LAYOUT, hint)) continue;
    const layout = RENDERING_HINT_LAYOUT[hint];
    if (!layout) continue;
    votes.set(layout, (votes.get(layout) ?? 0) + 1);
  }
  let best: PoolLayout | undefined;
  let bestN = 0;
  let tied = false;
  for (const [layout, n] of votes) {
    if (n > bestN) { best = layout; bestN = n; tied = false; }
    else if (n === bestN) tied = true;
  }
  return tied ? undefined : best;
}
