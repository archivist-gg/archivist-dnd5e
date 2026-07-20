// packages/dnd5e/tools/srd-canonical/data/synthetic-item-seeds.ts
//
// Committed source for the 17 synthetic SRD-2024 item seeds that have NO
// Open5e / structured-rules provenance: the 10 generic Spell Scrolls
// (Cantrip .. 9th Level) and the 7 Unidentified placeholders (Potion, Scroll,
// Wondrous Item, Weapon, Armor, Ring, Wand).
//
// These items drive plugin systems that need a data hook Open5e does not
// provide:
//   - scroll_level  → the scroll-cast system (pick a spell of <= level, cast
//                     at the scroll's own save DC / attack bonus, then consume)
//   - unidentified  → the identify-swap system (show masked_category instead of
//     + masked_category the true identity until Identify replaces the placeholder)
//
// Previously these were OFFLINE-INJECTED as raw edits to the runtime JSON with
// no generator source, so a full `build:srd-canonical` silently dropped them.
// Authoring them here makes the seeds REPRODUCIBLE: anyone who installs the
// package and regenerates reproduces them byte-for-byte. The generator
// (tools/srd-canonical/index.ts) computes each seed's canonical 3-part slug
// via buildCanonicalSlug("2024", "item", name) and injects `edition: "2024"` —
// neither is hardcoded here.
//
// 2024-only (source "SRD 5.2"); there is no 2014 counterpart.

export interface SyntheticItemSeed {
  /** Display name. The generator slugifies this into the canonical slug. */
  name: string;
  /** SRD source stamp (always "SRD 5.2" for these 2024 seeds). */
  source: string;
  /** Magic-item rarity. Present on scrolls; omitted on unidentified placeholders. */
  rarity?: string;
  /** Prose description rendered on the item sheet. */
  description: string;
  /** Item type token (accepted as a free string by the item schema). */
  type: string;
  /** Spell level the scroll can cast (0 = cantrip). Scrolls only. */
  scroll_level?: number;
  /** True for the identify-swap placeholders. */
  unidentified?: boolean;
  /** Generic category shown for an unidentified item (== its `type`). */
  masked_category?: string;
}

const SCROLL_DESCRIPTION =
  "A spell scroll bears the words of a single spell inscribed in a mystical cipher. " +
  "Choose the spell it holds. Reading the scroll casts that spell using the scroll's " +
  "own save DC and attack bonus; once cast, the words fade and the scroll crumbles to dust.";

const UNIDENTIFIED_DESCRIPTION =
  "An unidentified item of unknown properties. Identify it to reveal what it truly is.";

const SOURCE = "SRD 5.2";

// Generic Spell Scrolls: one per spell level 0 (cantrip) .. 9, rarity scaling
// with level per the SRD magic-item table.
const SCROLL_SEEDS: SyntheticItemSeed[] = [
  { name: "Spell Scroll (Cantrip)", source: SOURCE, rarity: "common", description: SCROLL_DESCRIPTION, type: "scroll", scroll_level: 0 },
  { name: "Spell Scroll (1st Level)", source: SOURCE, rarity: "common", description: SCROLL_DESCRIPTION, type: "scroll", scroll_level: 1 },
  { name: "Spell Scroll (2nd Level)", source: SOURCE, rarity: "uncommon", description: SCROLL_DESCRIPTION, type: "scroll", scroll_level: 2 },
  { name: "Spell Scroll (3rd Level)", source: SOURCE, rarity: "uncommon", description: SCROLL_DESCRIPTION, type: "scroll", scroll_level: 3 },
  { name: "Spell Scroll (4th Level)", source: SOURCE, rarity: "rare", description: SCROLL_DESCRIPTION, type: "scroll", scroll_level: 4 },
  { name: "Spell Scroll (5th Level)", source: SOURCE, rarity: "rare", description: SCROLL_DESCRIPTION, type: "scroll", scroll_level: 5 },
  { name: "Spell Scroll (6th Level)", source: SOURCE, rarity: "very rare", description: SCROLL_DESCRIPTION, type: "scroll", scroll_level: 6 },
  { name: "Spell Scroll (7th Level)", source: SOURCE, rarity: "very rare", description: SCROLL_DESCRIPTION, type: "scroll", scroll_level: 7 },
  { name: "Spell Scroll (8th Level)", source: SOURCE, rarity: "very rare", description: SCROLL_DESCRIPTION, type: "scroll", scroll_level: 8 },
  { name: "Spell Scroll (9th Level)", source: SOURCE, rarity: "legendary", description: SCROLL_DESCRIPTION, type: "scroll", scroll_level: 9 },
];

// Unidentified placeholders: one per masked category. `type` deliberately
// equals `masked_category` (a valid category token), never a fake value.
const UNIDENTIFIED_SEEDS: SyntheticItemSeed[] = [
  { name: "Unidentified Potion", source: SOURCE, description: UNIDENTIFIED_DESCRIPTION, type: "potion", unidentified: true, masked_category: "potion" },
  { name: "Unidentified Scroll", source: SOURCE, description: UNIDENTIFIED_DESCRIPTION, type: "scroll", unidentified: true, masked_category: "scroll" },
  { name: "Unidentified Wondrous Item", source: SOURCE, description: UNIDENTIFIED_DESCRIPTION, type: "wondrous item", unidentified: true, masked_category: "wondrous item" },
  { name: "Unidentified Weapon", source: SOURCE, description: UNIDENTIFIED_DESCRIPTION, type: "weapon", unidentified: true, masked_category: "weapon" },
  { name: "Unidentified Armor", source: SOURCE, description: UNIDENTIFIED_DESCRIPTION, type: "armor", unidentified: true, masked_category: "armor" },
  { name: "Unidentified Ring", source: SOURCE, description: UNIDENTIFIED_DESCRIPTION, type: "ring", unidentified: true, masked_category: "ring" },
  { name: "Unidentified Wand", source: SOURCE, description: UNIDENTIFIED_DESCRIPTION, type: "wand", unidentified: true, masked_category: "wand" },
];

/** All 17 synthetic item seeds, scrolls first then unidentified placeholders. */
export const SYNTHETIC_ITEM_SEEDS: SyntheticItemSeed[] = [
  ...SCROLL_SEEDS,
  ...UNIDENTIFIED_SEEDS,
];
