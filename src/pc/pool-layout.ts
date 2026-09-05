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
 *  vote; no votes → undefined; a tie between two mapped values → undefined (Gate 0 Q8). */
export function derivePoolLayout(entries: ReadonlyArray<ResolvedPoolEntry>): PoolLayout | undefined {
  const votes = new Map<PoolLayout, number>();
  for (const e of entries) {
    const hint = (e.entity as { rendering_hint?: string }).rendering_hint ?? "";
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
