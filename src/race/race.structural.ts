/** R4-G3b §5.2.9 · the STRUCTURAL pseudo-choices of a race entry: Size / Speed / Darkvision are surfaced as glance tiles
 *  and are not content. Shared by the plugin's two trait-name folds (keyed on TRAIT NAMES, lowercased) and by the
 *  resolver's `additional_spells` race gate (keyed on select-inline CHOICE IDS; on the corpus only `size` occurs as an
 *  id, 18 carriers, 17 saved by this exemption). A measured v1 exception to the schema-not-renderer rule: it must never
 *  grow into an allowlist of lineage ids (the structural replacement is the NEXT-REGEN / G7 ask). NOT imported by any
 *  schema, parser, codec or srd module (the T6/T12 grep guard keeps it out of the generators graph). */
export const RACE_STRUCTURAL_PSEUDO: ReadonlySet<string> = new Set(["size", "speed", "darkvision"]);
