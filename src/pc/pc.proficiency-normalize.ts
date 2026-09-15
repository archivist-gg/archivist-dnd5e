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

/** The display label for one AUTHORED proficiency value that no vocabulary canonicalizes (R4-G7 T8 RIDER-14).
 *  The rule reads the value's SHAPE, never a word list:
 *  - a value with no whitespace is a slug ("thieves'-tools", "heavy"), and a phrase with no uppercase letter
 *    ("hand crossbows") carries no authored casing and shares its slug's `toProfSlug` key: both keep today's
 *    `humanizeProficiency(toProfSlug(raw))` (the fold and the apostrophe rule of the composition above);
 *  - a phrase that carries authored uppercase is PROSE ("Martial weapons that have the Light property",
 *    "... the 2H or H property") and prints as authored: U+2019 folded to ASCII, whitespace trimmed and collapsed,
 *    the first character capitalised, every other letter untouched. Title-casing it word by word lower-cased
 *    `2H` to `2h` and read "That Have The Light Property". */
export const proficiencyLabel = (raw: string): string => {
  const text = raw.replace(/’/g, "'").trim().replace(/\s+/g, " ");
  if (!/\s/.test(text) || text === text.toLowerCase()) return humanizeProficiency(toProfSlug(raw));
  return text.charAt(0).toUpperCase() + text.slice(1);
};
