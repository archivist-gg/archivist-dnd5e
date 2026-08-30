/** One thing a starting-equipment option grants. `item` is a BARE compendium
 *  slug (e.g. "chain-mail"); the seeder resolves it to the full edition slug.
 *  `category` is a player-picked class of item ("martial-weapon",
 *  "simple-weapon", "martial-melee-weapon", "any-armor", "shield", …) resolved
 *  by a nested select-entity. `gold` is gp folded into the bundle. */
export type EquipmentGrant =
  /** `contains_value` and `worth_value` are in COPPER (the converter's unit: `1500` = 15 gp); `display_name` is a
   *  display override for a generic slug. Carried; read only by grantLabel (display_name) in this phase. */
  | { item: string; qty?: number; contains_value?: number; display_name?: string; worth_value?: number }
  | { category: string; qty?: number; display_name?: string }
  | { gold: number };

/** One selectable option of a `kind:"choice"` starting-equipment entry. `label`
 *  is the human display string (the `.pc-cb-eqopt` text); `grants` is what seeds. */
export interface EquipmentOption {
  label: string;
  grants: EquipmentGrant[];
}

/** Structured starting equipment. Shared by class + background. A `fixed` entry
 *  may carry a `label` for the un-parsed (prose fallback) case where `grants`
 *  is empty — it then displays but seeds nothing (graceful degradation). */
export type StartingEquipmentEntry =
  | { kind: "choice"; options: EquipmentOption[] }
  | { kind: "fixed"; label?: string; grants: EquipmentGrant[] }
  | { kind: "gold"; amount: number };

/** Buy-with-Gold budget. `fixed` gp (2024) or a `dice`×`multiplier` roll (2014
 *  "XdY × 10"); average is derived by the consumer. */
export interface StartingGold {
  fixed?: number;
  dice?: string;
  multiplier?: number;
}
