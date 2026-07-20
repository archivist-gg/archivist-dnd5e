// src/modules/item/item.actions-map.ts

import type { EquipmentEntry } from "../pc/pc.types";

export type ActionCost = "action" | "bonus-action" | "reaction" | "free" | "special";

export interface ItemAction {
  cost: ActionCost;
  range?: string;
  max_charges?: number;
  recovery?: { amount: string; reset: "dawn" | "short" | "long" | "special" };
}

/**
 * Curated map of canonical SRD chargeable / activated items.
 * Slugs match the SRD compendium slug format. Augmenter reads this map
 * and stamps `actions: ItemAction` onto the augmented entity bundle.
 */
export const ITEM_ACTIONS: Record<string, ItemAction> = {
  // Wands and rods
  "wand-of-fireballs":           { cost: "action",       range: "150 ft.", max_charges: 7, recovery: { amount: "1d6+1", reset: "dawn" } },
  "wand-of-magic-missiles":      { cost: "action",       range: "120 ft.", max_charges: 7, recovery: { amount: "1d6+1", reset: "dawn" } },
  "wand-of-lightning-bolts":     { cost: "action",       range: "100 ft.", max_charges: 7, recovery: { amount: "1d6+1", reset: "dawn" } },
  "wand-of-paralysis":           { cost: "action",       range: "60 ft.",  max_charges: 7, recovery: { amount: "1d6+1", reset: "dawn" } },
  "wand-of-fear":                { cost: "action",       range: "self",    max_charges: 7, recovery: { amount: "1d6+1", reset: "dawn" } },
  "wand-of-binding":             { cost: "action",       range: "self",    max_charges: 7, recovery: { amount: "1d6+1", reset: "dawn" } },
  "wand-of-secrets":             { cost: "action",       range: "30 ft.",  max_charges: 3, recovery: { amount: "1d3",   reset: "dawn" } },
  "wand-of-web":                 { cost: "action",       range: "60 ft.",  max_charges: 7, recovery: { amount: "1d6+1", reset: "dawn" } },
  "wand-of-wonder":              { cost: "action",       range: "120 ft.", max_charges: 7, recovery: { amount: "1d6+1", reset: "dawn" } },

  // Activatable wondrous items
  "boots-of-speed":              { cost: "bonus-action", range: "self",    max_charges: 1, recovery: { amount: "1",     reset: "long" } },
  "boots-of-levitation":         { cost: "action",       range: "self" },
  "boots-of-striding-and-springing": { cost: "free",     range: "self" },
  "broom-of-flying":             { cost: "action",       range: "touch" },
  "cloak-of-displacement":       { cost: "free",         range: "self" },
  "cloak-of-the-bat":            { cost: "action",       range: "self",    max_charges: 1, recovery: { amount: "1", reset: "long" } },
  "decanter-of-endless-water":   { cost: "action",       range: "touch" },
  "drum-of-panic":               { cost: "action",       range: "120 ft.", max_charges: 1, recovery: { amount: "1", reset: "long" } },
  "eyes-of-charming":            { cost: "action",       range: "30 ft.",  max_charges: 3, recovery: { amount: "3", reset: "dawn" } },

  // Rings
  "ring-of-three-wishes":        { cost: "action",       range: "self",    max_charges: 3, recovery: { amount: "0", reset: "special" } },
  "ring-of-shooting-stars":      { cost: "action",       range: "60 ft.",  max_charges: 6, recovery: { amount: "1d6", reset: "dawn" } },
  "ring-of-the-ram":             { cost: "action",       range: "60 ft.",  max_charges: 3, recovery: { amount: "1d3", reset: "dawn" } },
  "ring-of-spell-storing":       { cost: "action",       range: "self",    max_charges: 5 },
  "ring-of-animal-influence":    { cost: "action",       range: "self",    max_charges: 3, recovery: { amount: "1d3",   reset: "dawn" } },
  "ring-of-elemental-command":   { cost: "action",       range: "self",    max_charges: 5, recovery: { amount: "1d4+1", reset: "dawn" } },
  "ring-of-evasion":             { cost: "reaction",     range: "self",    max_charges: 3, recovery: { amount: "1d3",   reset: "dawn" } },

  // Necklaces
  "necklace-of-fireballs":       { cost: "action",       range: "60 ft.",  max_charges: 9 },

  // Gems
  "gem-of-brightness":           { cost: "action",       range: "60 ft.",  max_charges: 50 },
  "gem-of-seeing":               { cost: "action",       range: "self",    max_charges: 3, recovery: { amount: "1d3", reset: "dawn" } },

  // Helms
  "helm-of-teleportation":       { cost: "action",       range: "self",    max_charges: 3, recovery: { amount: "1d3", reset: "dawn" } },

  // Medallions
  "medallion-of-thoughts":       { cost: "action",       range: "30 ft.",  max_charges: 3, recovery: { amount: "1d3", reset: "dawn" } },

  // Pipes
  "pipes-of-haunting":           { cost: "action",       range: "30 ft.",  max_charges: 3, recovery: { amount: "1d3", reset: "dawn" } },
  "pipes-of-the-sewers":         { cost: "action",       range: "self",    max_charges: 3, recovery: { amount: "1d3", reset: "dawn" } },

  // Cubes / chimes
  "cube-of-force":               { cost: "action",       range: "self",    max_charges: 36, recovery: { amount: "1d20", reset: "dawn" } },
  "chime-of-opening":            { cost: "action",       range: "120 ft.", max_charges: 10 },

  // Magic weapons with activation actions (surface in items table only via override; weapons table is primary)
  "sun-blade":                   { cost: "free",         range: "self" },

  // Potions / consumables
  // 2024 healing potions are a Bonus Action to drink/administer (curation still
  // carries range/max_charges/recovery; the type=potion default covers uncurated ones).
  "potion-of-healing":           { cost: "bonus-action", range: "self",    max_charges: 1, recovery: { amount: "0", reset: "special" } },
  "potion-of-greater-healing":   { cost: "bonus-action", range: "self",    max_charges: 1, recovery: { amount: "0", reset: "special" } },
  "potion-of-superior-healing":  { cost: "bonus-action", range: "self",    max_charges: 1, recovery: { amount: "0", reset: "special" } },
  "potion-of-supreme-healing":   { cost: "bonus-action", range: "self",    max_charges: 1, recovery: { amount: "0", reset: "special" } },
  "alchemists-fire":             { cost: "action",       range: "20 ft.",  max_charges: 1, recovery: { amount: "0", reset: "special" } },
  "holy-water":                  { cost: "action",       range: "20 ft.",  max_charges: 1, recovery: { amount: "0", reset: "special" } },
  // Oils are APPLIED (minutes), not drunk: curated to "action" so the blanket
  // type=potion → bonus-action default never mislabels these mis-typed items.
  "oil-of-sharpness":            { cost: "action",       range: "self",    max_charges: 1, recovery: { amount: "0", reset: "special" } },
  "oil-of-etherealness":         { cost: "action",       range: "self",    max_charges: 1, recovery: { amount: "0", reset: "special" } },
  "oil-of-slipperiness":         { cost: "action",       range: "self",    max_charges: 1, recovery: { amount: "0", reset: "special" } },
  "dust-of-disappearance":       { cost: "action",       range: "self",    max_charges: 1, recovery: { amount: "0", reset: "special" } },
};

/**
 * Look up an ItemAction by slug, accepting either a bare name slug
 * (`wand-of-fireballs`) or a compendium-prefixed slug
 * (`srd-5e_wand-of-fireballs`, `srd-2024_wand-of-fireballs`,
 * `homebrew_wand-of-fireballs`).
 *
 * Type-namespaced slugs follow the shape `<prefix>_<entity_type>_<name-slug>`
 * (all kebab-case; slugify never emits `_`), so a slug splits on `_` into
 * exactly 3 parts and the bare name is `parts.slice(2).join("_")`. This is
 * arity-robust: it also recovers the bare name from a legacy 2-part
 * `<prefix>_<name>` slug and an already-bare name. `ITEM_ACTIONS` is keyed by
 * bare name.
 *
 * Returns `undefined` if no map entry matches. Does not crash on slugs
 * without an underscore — those are treated as already-bare.
 */
export function findItemAction(slug: string): ItemAction | undefined {
  if (slug in ITEM_ACTIONS) return ITEM_ACTIONS[slug];
  const p = slug.split("_");
  const bare = p.length >= 3 ? p.slice(2).join("_") : p[p.length - 1];
  return bare === slug ? undefined : ITEM_ACTIONS[bare];
}

/**
 * Resolve the ItemAction for an equipped entry.
 * Priority: per-instance override > curated map > `itemType==="potion"`
 * bonus-action default > null.
 *
 * `itemType` is the entity's `data.type` (from the registry, statically
 * `unknown`); per the 2024 SRD, drinking/administering a potion is a Bonus
 * Action, so an uncurated `type==="potion"` item still surfaces (curated oils
 * mis-typed `"potion"` are pinned to "action" so this default cannot mislabel
 * them). Returns null when no source supplies a cost (non-potion uncurated with
 * no override).
 *
 * Accepts both bare and compendium-prefixed slugs (see `findItemAction`).
 */
export function resolveItemAction(
  slug: string,
  entry: EquipmentEntry,
  itemType?: unknown,
): ItemAction | null {
  const curated = findItemAction(slug) ?? null;
  const override = entry.overrides;
  const overrideCost = override?.action;
  const overrideRange = override?.range;

  const cost = overrideCost ?? curated?.cost ?? (itemType === "potion" ? "bonus-action" : undefined);
  if (!cost) return null;

  return {
    cost,
    range: overrideRange ?? curated?.range,
    max_charges: curated?.max_charges,
    recovery: curated?.recovery,
  };
}
