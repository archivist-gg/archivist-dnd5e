import type { Edition } from "@archivist-gg/dnd5e/types/edition";
import type { imageField } from "@archivist-gg/dnd5e/schemas/entity-extras-schema";
import type { z } from "zod";

/* eslint-disable @typescript-eslint/no-redundant-type-constituents */
export type WeaponCategory =
  | "simple-melee"
  | "simple-ranged"
  | "martial-melee"
  | "martial-ranged"
  | "natural"
  | string;
/* eslint-enable @typescript-eslint/no-redundant-type-constituents */

export type DamageType =
  | "acid"
  | "bludgeoning"
  | "cold"
  | "fire"
  | "force"
  | "lightning"
  | "necrotic"
  | "piercing"
  | "poison"
  | "psychic"
  | "radiant"
  | "slashing"
  | "thunder";

export type ConditionalProperty = { kind: "conditional"; uid: string; note: string };

export type WeaponProperty =
  | "finesse"
  | "light"
  | "heavy"
  | "two_handed"
  | "reach"
  | "special"
  | "thrown"
  | "ammunition"
  | "versatile"
  | "loading"
  | "range"
  | ConditionalProperty;

/* eslint-disable @typescript-eslint/no-redundant-type-constituents */
export type WeaponTypeTag =
  | "sword"
  | "axe"
  | "bow"
  | "crossbow"
  | "club"
  | "dagger"
  | "firearm"
  | "hammer"
  | "lance"
  | "mace"
  | "net"
  | "polearm"
  | "rapier"
  | "spear"
  | "staff"
  | string;
/* eslint-enable @typescript-eslint/no-redundant-type-constituents */

export interface WeaponEntity {
  name: string;
  slug: string;
  category: WeaponCategory;
  damage: {
    dice: string;
    // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
    type: DamageType | string;
    versatile_dice?: string;
  };
  properties: WeaponProperty[];
  range?: { normal: number; long: number };
  reload?: number;
  mastery?: string[];
  type_tags?: WeaponTypeTag[];
  ammo_type?: string;
  weight?: number | string;
  cost?: string;
  source?: string;
  page?: number;
  edition: Edition;
  entries?: unknown[];
  /** Carried as the empty string on every converter weapon carrier today (98). */
  rendering_hint?: string;
  has_fluff?: boolean;
  has_fluff_images?: boolean;
  /** One wikilink, or an array for >= 2 fluff images (images-ON emit). */
  image?: z.infer<typeof imageField>;
  raw?: Record<string, unknown>;
}
