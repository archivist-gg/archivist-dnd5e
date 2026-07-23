// src/pc/pc.proficiency-normalize.ts

/** Normalized token-set key for matching class weapon DISPLAY names ("hand crossbows")
 *  against weapon-entity names ("Crossbow, hand"). EXACT equality on the key; verified
 *  collision-free across the SRD weapon set. Strip-"s" singularizer does not handle
 *  irregular plurals; no SRD weapon triggers that. */
export const normKey = (s: string): string =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/)
    .filter(Boolean).map((w) => (w.endsWith("s") ? w.slice(0, -1) : w)).sort().join(" ");
