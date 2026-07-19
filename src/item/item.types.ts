import type { Ability, ArmorCategory } from "@archivist-gg/dnd5e/armor/armor.types";
import type { WeaponCategory, WeaponEntity } from "@archivist-gg/dnd5e/weapon/weapon.types";
import type { ConditionalBonus } from "@archivist-gg/dnd5e/types/item-conditions.types";

/* eslint-disable @typescript-eslint/no-redundant-type-constituents */
export type ItemRarity =
  | "common"
  | "uncommon"
  | "rare"
  | "very rare"
  | "legendary"
  | "artifact"
  | string;
/* eslint-enable @typescript-eslint/no-redundant-type-constituents */

export type AttunementTag =
  | { class: string; subclass?: string }
  | { alignment: string }
  | { race: string }
  | { creature_type: string };

export interface ItemEntity {
  name: string;
  slug?: string;
  type?: string;
  rarity?: ItemRarity;

  base_item?: string;

  bonuses?: {
    ac?: number | ConditionalBonus;
    weapon_attack?: number | ConditionalBonus;
    weapon_damage?: number | ConditionalBonus;
    spell_attack?: number | ConditionalBonus;
    spell_save_dc?: number | ConditionalBonus;
    saving_throws?: number | ConditionalBonus;
    ability_scores?: {
      static?: Partial<Record<Ability, number>>;
      bonus?: Partial<Record<Ability, number | ConditionalBonus>>;
    };
    speed?: {
      walk?: number | ConditionalBonus;
      fly?: number | ConditionalBonus | "walk";
      swim?: number | ConditionalBonus;
      climb?: number | ConditionalBonus;
    };
  };

  resist?: string[];
  immune?: string[];
  vulnerable?: string[];
  condition_immune?: string[];

  charges?:
    | {
        max: number;
        recharge?: string;
        recharge_amount?: string;
        destroy_on_empty?: { roll: string; threshold: number; effect?: string };
      }
    | number;
  attached_spells?: {
    charges?: Record<string, string[]>;
    daily?: Record<string, string[]>;
    will?: string[];
    rest?: Record<string, string[]>;
    /** Total uses with no recharge — item often consumed when empty. */
    limited?: Record<string, string[]>;
  };

  attunement?:
    | { required: boolean; restriction?: string; tags?: AttunementTag[] }
    | boolean
    | string;

  grants?: {
    proficiency?: boolean;
    languages?: boolean | string[];
    senses?: {
      darkvision?: number;
      tremorsense?: number;
      truesight?: number;
      blindsight?: number;
    };
  };

  container?: {
    capacity_weight?: number;
    weightless?: boolean;
    pack_contents?: string[];
  };

  light?: { bright_radius: number; dim_radius: number };

  cursed?: boolean;
  sentient?: boolean;
  focus?: boolean | "arcane" | "druid" | "holy";
  tier?: "major" | "minor";

  damage?: WeaponEntity["damage"] | string;
  weapon_category?: WeaponCategory;
  armor_category?: ArmorCategory;

  weight?: number | string;
  cost?: string;
  source?: string;
  page?: number;
  /* eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents */
  edition?: "2014" | "2024" | string;
  description?: string;
  entries?: unknown[];
  effects?: unknown[];
  /** Structured additive on-hit damage riders (e.g. Flame Tongue "+2d6 fire",
   *  Wounding "+2d6 necrotic"). Read per-weapon in the equipment builder →
   *  AttackRow.damageRiders. `amount` is a dice/flat string. */
  damage_riders?: Array<{ amount: string; damage_type: string; applies_to?: "weapon" | "spell" | "all"; condition?: string }>;

  /** Spell-scroll casting level (e.g. 3 for a "Spell Scroll (3rd Level)"). */
  scroll_level?: number;
  /** Marks an item the player has not yet identified: the sheet shows the
   *  masked_category label instead of the item's true identity. */
  unidentified?: boolean;
  /** Generic category label shown for an unidentified item (e.g. "potion",
   *  "scroll", "wand") in place of its real name. */
  masked_category?: string;

  raw?: Record<string, unknown>;

  // Legacy fields preserved for downstream callers (ai-tools, modal, edit-render)
  // that haven't been updated to the canonical shape yet (deferred to SP6).
  damage_dice?: string;
  damage_type?: string;
  properties?: string[];
  recharge?: string;
  curse?: boolean;
  value?: number;
}

// Legacy alias — many existing files import `Item`. Keep the symbol working.
export type Item = ItemEntity;
