// src/pc/pc.types.ts
//
// Shared PC-domain type nucleus, relocated from the Obsidian plugin's
// pc.types.ts so the item mechanical-evaluation layer (item.conditions.types,
// item.actions-map) can reference EquippedSlots/ClassEntry/EquipmentEntry
// without a plugin→dnd5e→plugin type cycle. Only the nucleus closure lives
// here; Character/Resolved*/Derived* stay in the plugin and re-import these.

import type { Ability } from "../types/choice";
import type { ArmorEntity } from "../armor/armor.types";
import type { WeaponEntity } from "../weapon/weapon.types";
import type { ItemEntity } from "../item/item.types";

/** A persisted decision value: entity slug / inline value (string), multi-select
 *  slugs (string[]), or an ability-points allocation. Stale/odd legacy values
 *  survive parsing (schema is permissive); readers narrow defensively. */
export type ChoiceValue = string | string[] | Partial<Record<Ability, number>>;

export type LevelChoices = Record<string, ChoiceValue>;

export interface ClassEntry {
  name: string;                        // "[[rogue]]" or "rogue"
  level: number;
  subclass: string | null;             // "[[soulknife]]" or null
  choices: Record<number, LevelChoices>;
}

export type SlotKey = "mainhand" | "offhand" | "armor" | "shield";

export interface EquipmentEntryOverrides {
  name?: string;
  bonus?: number;
  damage_bonus?: number;
  extra_damage?: string;
  ac_bonus?: number;
  action?: "action" | "bonus-action" | "reaction" | "free" | "special";
  range?: string;
  resist?: string[];
  immune?: string[];
  vulnerable?: string[];
  condition_immune?: string[];
}

export interface EquipmentEntryState {
  charges?: { current: number; max: number };
  recovery?: { amount: string; reset: "dawn" | "short" | "long" | "special" };
  depletion_risk?: { trigger: string; roll: string; threshold: number; effect: string };
}

export type EquipmentEntry =
  | {
      item: string;
      equipped?: boolean;
      attuned?: boolean;
      qty?: number;
      notes?: string;
      slot?: SlotKey | null;
      overrides?: EquipmentEntryOverrides;
      state?: EquipmentEntryState;
      /** Build-only provenance tag for gear the Builder's Equipment step seeded
       *  on the character's behalf (e.g. `"builder:starting"`, `"builder:gold-buy"`).
       *  Lets the step reconcile its own grants on re-pick / mode-switch without
       *  touching hand-managed entries. Stripped by finishBuild — absent on every
       *  finished file. */
      granted_by?: string;
    };

export interface ResolvedEquipped {
  index: number;
  entity: ArmorEntity | WeaponEntity | ItemEntity | null;
  entityType: string | null;
  entry: EquipmentEntry;
}

export interface EquippedSlots {
  mainhand?: ResolvedEquipped;
  offhand?: ResolvedEquipped;
  armor?: ResolvedEquipped;
  shield?: ResolvedEquipped;
}
