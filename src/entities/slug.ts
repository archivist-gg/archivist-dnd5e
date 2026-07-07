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

