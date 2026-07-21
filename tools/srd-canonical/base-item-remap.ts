// Pure helpers for authoritative base_item emission (P2 D3 + D5).
// The SRD-5e (2014) magic-item base_item links use long/2024-style names
// ("Plate Armor", "Hand Crossbow") but the registered 2014 base entities use
// short/comma Open5e names ("Plate", "Crossbow, hand"). normalizeBaseName
// bridges both forms symmetrically so a variant's base can be resolved to the
// actual registered entity and re-emitted under its real name.

const FOLDER_TO_TYPE: Record<string, "weapon" | "armor"> = { Weapons: "weapon", Armor: "armor" };

/** Normalize a base name/slug so long-link, short-registered, comma-inverted,
 *  and hyphenated-slug forms all collapse to one key. Applied symmetrically to
 *  index keys, link names, AND D5's hyphenated `structured.baseItem` slugs.
 *  Steps: lowercase; unify separators (space, comma, hyphen) to single spaces
 *  FIRST (so "plate-armor" and "Plate Armor" both reach "plate armor", and
 *  "hand-crossbow" reaches "hand crossbow"); strip a trailing " armor" token;
 *  sort remaining tokens so word-order/comma inversions collapse.
 *  Examples: "Plate Armor"/"plate-armor" -> "plate"; "Crossbow, hand" /
 *  "Hand Crossbow" / "hand-crossbow" -> "crossbow hand". */
export function normalizeBaseName(name: string): string {
  let s = name.trim().toLowerCase().replace(/[\s,\-]+/g, " ").trim();
  s = s.replace(/\s+armor$/, "");
  return s.split(/\s+/).filter(Boolean).sort().join(" ");
}

export type BaseEntity = { name: string; type: "weapon" | "armor"; edition: string };
export type BaseEntityIndex = Map<string, string>;

/** Build a per-(edition,type) normalized-name index. Throws if two distinct
 *  registered entities of the same (edition,type) normalize to the same key:
 *  that would be an ambiguous remap and must be resolved by tightening
 *  normalizeBaseName, not shipped. */
export function buildBaseEntityIndex(entities: BaseEntity[]): BaseEntityIndex {
  const index: BaseEntityIndex = new Map();
  const seen = new Map<string, string>(); // key -> first registered name (per edition+type)
  for (const e of entities) {
    const key = `${e.type}:${normalizeBaseName(e.name)}`;
    const guard = `${e.edition}:${key}`;
    const prior = seen.get(guard);
    if (prior !== undefined && prior !== e.name) {
      throw new Error(
        `base-entity normalized-key collision (${e.edition} ${e.type}): "${prior}" vs "${e.name}" both -> "${key}"`,
      );
    }
    seen.set(guard, e.name);
    index.set(key, e.name); // per-edition callers build one index per edition
  }
  return index;
}

/** Rewrite a `[[Compendium/Folder/Name]]` base_item link to the registered
 *  entity's real name. Falls back to the original link when the base is not in
 *  the index (behavior-stable; the D6 assertion is the backstop). */
export function remapVariantBaseItem(baseItemLink: string, index: BaseEntityIndex): string {
  const inner = baseItemLink.replace(/^\[\[/, "").replace(/\]\]$/, "");
  const segs = inner.split("/");
  if (segs.length < 3) return baseItemLink;
  const compendium = segs[0];
  const folder = segs[1];
  const name = segs.slice(2).join("/");
  const type = FOLDER_TO_TYPE[folder];
  if (!type) return baseItemLink;
  const match = index.get(`${type}:${normalizeBaseName(name)}`);
  if (!match) return baseItemLink;
  return `[[${compendium}/${folder}/${match}]]`;
}

/** D5: normalized-name set of the real weapon/armor/shield bases available
 *  before the ALL_KINDS loop (from baseItemsForExpansion + the Shield seed). */
export function buildBaseResolutionPredicate(baseNames: string[]): Set<string> {
  return new Set(baseNames.map(normalizeBaseName));
}

/** D5: does a 5etools `structured.baseItem` (e.g. "mace|phb") name a real base?
 *  Strip the `|source` suffix, normalize, and check membership. */
export function structuredBaseResolves(structuredBaseItem: string, predicate: Set<string>): boolean {
  const bare = structuredBaseItem.split("|")[0];
  return predicate.has(normalizeBaseName(bare));
}
