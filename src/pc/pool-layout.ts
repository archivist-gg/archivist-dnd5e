import type { EntryAffordance, PoolLayout } from "../types/selection-pool";
import type { ResolvedPoolEntry } from "./pc.types";

/** The ONE `rendering_hint` → `PoolLayout` table (R4-G4 §4.2.2, invariant 3): a DATA table in the
 *  RESET_LABELS shape. Absent keys route to the default, and R4-G5 added NONE: `pool-selection` and
 *  `stance` are a measured empty delta (spec §10) and `granted-die-to-ally` became a per-ROW affordance
 *  in the table below, so this one still holds exactly the two G4 keys. */
export const RENDERING_HINT_LAYOUT: Readonly<Record<string, PoolLayout>> = {
  "dice-pool": "dice-pool",
  "point-pool": "point-pool",
};

/** The majority mapped hint over the pool's members; members with an empty or unmapped hint do not
 *  vote; no votes → undefined; a tie between two mapped values → undefined (Gate 0 Q8).
 *  UNMAPPED is decided by OWN-property lookup, never by truthiness of a plain index (review M-2):
 *  `rendering_hint` is a free `z.string().optional()` on converter data, so a member may carry any
 *  string, and an object-literal table answers the `Object.prototype` keys through the prototype
 *  chain. Measured 2026-09-06 on this table: `constructor`, `toString`, `hasOwnProperty` and
 *  `valueOf` each index to a FUNCTION and each has `hasOwnProperty` false, while the two mapped
 *  hints, `dice-pool` and `point-pool`, are the only keys that are both a string and own (review
 *  M-1: the earlier wording named `dice-pool` alone). Without the guard a lone junk hint voted that
 *  function as the layout, and one junk member beside genuine `dice-pool` members collapsed a
 *  correct majority into a phantom tie. */
export function derivePoolLayout(entries: ReadonlyArray<ResolvedPoolEntry>): PoolLayout | undefined {
  const votes = new Map<PoolLayout, number>();
  for (const e of entries) {
    const hint = e.entity.rendering_hint ?? "";
    if (!Object.prototype.hasOwnProperty.call(RENDERING_HINT_LAYOUT, hint)) continue;
    const layout = RENDERING_HINT_LAYOUT[hint];
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

/** The ONE `rendering_hint` to `EntryAffordance` table (R4-G5 §4.2.1, invariant 3): the PER-ENTRY sibling of
 *  `RENDERING_HINT_LAYOUT`. `granted-die-to-ally` is its only key, and the four documents carrying it
 *  (Commander's Strike x2, Rally x2) are field-identical to the other 39 maneuvers except that hint, so a
 *  per-row affordance is the only place their meaning can land. `stance` gets NO key (its three hinted documents
 *  are field-identical to three unhinted siblings: a measured empty delta) and `pool-selection` none. */
export const RENDERING_HINT_AFFORDANCE: Readonly<Record<string, EntryAffordance>> = {
  "granted-die-to-ally": "granted-die",
};

/** The entry's affordance, by OWN-property lookup (`derivePoolLayout`'s precedent, invariant 3): `rendering_hint`
 *  is a free `z.string().optional()` on converter data, so a member may carry ANY string, and an object-literal
 *  table answers `constructor` / `toString` / `hasOwnProperty` / `valueOf` through the prototype chain with a
 *  FUNCTION. Absent, empty and unmapped hints all return undefined. */
export function deriveEntryAffordance(entity: ResolvedPoolEntry["entity"]): EntryAffordance | undefined {
  const hint = entity.rendering_hint ?? "";
  if (!Object.prototype.hasOwnProperty.call(RENDERING_HINT_AFFORDANCE, hint)) return undefined;
  return RENDERING_HINT_AFFORDANCE[hint];
}

/** Caption TEMPLATES per affordance, in the `RESET_LABELS` shape: the game sentence lives in DATA here, never in
 *  a renderer (invariant 3). `{amount}` and `{die}` are filled by `formatAffordanceCaption`. */
export const AFFORDANCE_CAPTIONS: Readonly<Record<EntryAffordance, string>> = {
  "granted-die": "{amount} {die} to an ally",
};

/** Fill an affordance's caption template. PURE, and pure on purpose: the caller supplies values it has ALREADY
 *  resolved (the plugin resolves the die through `resolveScalingDie` at the owner's class level, exactly as the
 *  shipped spend control resolves its own "(d8)" label), so no renderer ever holds the sentence and no engine
 *  module ever needs the character. A placeholder with no value is left VERBATIM rather than printed as
 *  "undefined". */
export function formatAffordanceCaption(
  affordance: EntryAffordance,
  values: { amount: number; die: string },
): string {
  return AFFORDANCE_CAPTIONS[affordance].replace(/\{(\w+)\}/g, (whole, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key as keyof typeof values]) : whole);
}
