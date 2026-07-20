export function bareSlug(ref: string): string {
  if (typeof ref !== "string") return "";
  const m = ref.match(/^\[\[(.+?)\]\]$/);
  return (m ? m[1] : ref).toLowerCase();
}

/**
 * Bare class name for profile / spell-`classes` lookups.
 *
 * Compendium-qualified slugs are `<compendium>_<type>_<name>` (3-part, e.g.
 * `srd-2024_class_wizard`) or the legacy `<compendium>_<name>` (2-part, e.g.
 * `srd-5e_wizard`); compendium/type segments are hyphen-cased, so `_` only ever
 * separates the structural parts from the entity name. Strip that prefix to get
 * the canonical class key (`wizard`). Name-slugs never contain `_`, so a 3-part
 * slug's name is `parts.slice(2).join("_")`. Hand-written/test slugs without a
 * `_` pass through unchanged (`wizard` → `wizard`).
 */
export function baseClassName(ref: string): string {
  const bare = bareSlug(ref);
  const p = bare.split("_");
  return p.length >= 3 ? p.slice(2).join("_") : p[p.length - 1];
}
