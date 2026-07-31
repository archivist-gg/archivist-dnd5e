// src/pc/pc.proficiency-normalize.ts

/** Normalized token-set key for matching class weapon DISPLAY names ("hand crossbows")
 *  against weapon-entity names ("Crossbow, hand"). EXACT equality on the key; verified
 *  collision-free across the SRD weapon set. Strip-"s" singularizer does not handle
 *  irregular plurals; no SRD weapon triggers that. */
export const normKey = (s: string): string =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/)
    .filter(Boolean).map((w) => (w.endsWith("s") ? w.slice(0, -1) : w)).sort().join(" ");

/** Canonical proficiency slug: lowercase, curly apostrophe folded to ASCII,
 *  whitespace collapsed to hyphens. Universally idempotent (one pass removes all
 *  whitespace) and the IDENTITY over ALL_SKILL_SLUGS / ALL_LANGUAGES / ALL_TOOLS,
 *  which are already canonical. The fold list is deliberately U+2019-only: no SRD
 *  tool name contains any other non-ASCII character. */
export const toProfSlug = (s: string): string =>
  s.toLowerCase().replace(/’/g, "'").trim().replace(/\s+/g, "-");

/** Apostrophe-safe title case: capitalizes only at start-of-string or after
 *  whitespace, never after `'` (so "smith's-tools" reads "Smith's Tools", not
 *  "Smith'S Tools"). Intentionally the same body as the plugin's humanizeSlug.
 *  The divergence that matters is one level up: prettyName is
 *  humanizeProficiency(toProfSlug(x)), and the U+2019 fold lives in toProfSlug.
 *  Do NOT "simplify" prettyName to a bare humanizer call · that reintroduces
 *  the duplicate-row defect (one proficiency rendering as two rows). */
export const humanizeProficiency = (s: string): string =>
  s.replace(/-/g, " ").replace(/(^|\s)\w/g, (c) => c.toUpperCase());
