export function bareSlug(ref: string): string {
  if (typeof ref !== "string") return "";
  const m = ref.match(/^\[\[(.+?)\]\]$/);
  return (m ? m[1] : ref).toLowerCase();
}

/**
 * Bare class name for profile / spell-`classes` lookups.
 *
 * Compendium-qualified slugs are `<compendium>_<name>` — e.g. `srd-5e_wizard`,
 * `srd-2024_bard` (compendium slugs are hyphen-cased, so `_` only ever separates
 * the compendium from the entity name). Strip that prefix to get the canonical
 * class key (`wizard`). Hand-written/test slugs without a `_` pass through
 * unchanged (`wizard` → `wizard`).
 */
export function baseClassName(ref: string): string {
  const bare = bareSlug(ref);
  const sep = bare.indexOf("_");
  return sep >= 0 ? bare.slice(sep + 1) : bare;
}
