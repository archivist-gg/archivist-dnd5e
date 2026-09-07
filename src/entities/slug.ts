// slugify
// ---------------------------------------------------------------------------
/**
 * Converts a display name to a URL/file-safe kebab-case slug.
 * "Ancient Red Dragon" -> "ancient-red-dragon"
 */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "") // strip non-alphanumeric (except spaces & hyphens)
    .replace(/[\s]+/g, "-")        // spaces to hyphens
    .replace(/-{2,}/g, "-")        // collapse multiple hyphens
    .replace(/^-+|-+$/g, "");      // trim leading/trailing hyphens
}

/** "srd-2024_fighter" → "fighter", "srd-2024_background_acolyte" → "acolyte".
 *  Arity-robust: strips a `<prefix>_<type>_<name>` (3-part) or legacy `<prefix>_<name>`
 *  (2-part) slug down to the bare NAME, and passes a bare slug through unchanged.
 *  Name-slugs never contain `_`, so for a 3-part-or-longer slug the name is
 *  `parts.slice(2).join("_")`. Tolerates a nullish slug (degrades to "") so a
 *  malformed entity can't hard-crash the builder; the resolver backfills real slugs. */
export function bareEntitySlug(slug: string | null | undefined): string {
  if (!slug) return "";
  const p = slug.split("_");
  return p.length >= 3 ? p.slice(2).join("_") : p[p.length - 1];
}

/** "[[SRD 2024/Classes/Fighter]]" to "fighter" (tail segment, slugified).
 *
 *  The tail goes through the SAME `slugify` that mints registry slugs, so an apostrophe is DELETED rather than
 *  hyphenated ("Mage's Bane" to "mages-bane", where the old hand-rolled regex minted "mage-s-bane" and missed
 *  every time). Only ever call this on a human NAME tail, never on a full `<prefix>_<name>` slug, which slugify
 *  would destroy: `pc.decision-engine.ts`'s `resolveEntityRef` is the function that strips a `[[wikilink]]`
 *  WITHOUT slugifying, and it is the one to use for a STORED slug.
 *
 *  MOVED here from `pc.decision-engine.ts` in R4-G5 T1, beside `bareEntitySlug`, so `pc.pools.ts` can use it
 *  without importing the decision engine: the engine imports `pc.pools` for `strandedPicks`, and the old
 *  direction would be a cycle. The engine keeps a re-export, so its three plugin importers and its own test
 *  are untouched. */
export function wikilinkTailSlug(link: string): string {
  const inner = link.replace(/^\[\[/, "").replace(/\]\]$/, "");
  const tail = inner.split("/").pop() ?? inner;
  return slugify(tail);
}
