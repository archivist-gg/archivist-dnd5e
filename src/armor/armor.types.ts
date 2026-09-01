import type { imageField } from "@archivist-gg/dnd5e/schemas/entity-extras-schema";
import type { z } from "zod";

// Reuse the existing shared Ability type rather than redeclaring it.
export type { Ability } from "@archivist-gg/dnd5e/types/choice";

/* eslint-disable @typescript-eslint/no-redundant-type-constituents */
export type ArmorCategory =
  | "light"
  | "medium"
  | "heavy"
  | "shield"
  | "natural"
  | "feature"
  | "spell"
  | string;
/* eslint-enable @typescript-eslint/no-redundant-type-constituents */

export interface ArmorEntity {
  name: string;
  slug: string;
  category: ArmorCategory;
  ac: {
    base: number;
    // Optional: the zod default (flat: 0) only applies on the parsed path.
    // Raw vault data omits this key entirely, so read-sites must default it.
    flat?: number;
    add_dex: boolean;
    dex_max?: number;
    add_con: boolean;
    add_wis: boolean;
    description?: string;
  };
  strength_requirement?: number;
  stealth_disadvantage?: boolean;
  weight?: number | string;
  cost?: string;
  rarity?: string;
  source?: string;
  page?: number;
  // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
  edition?: "2014" | "2024" | string;
  entries?: unknown[];
  /** Carried as the empty string on every converter armor carrier today (27). */
  rendering_hint?: string;
  has_fluff?: boolean;
  has_fluff_images?: boolean;
  /** One wikilink, or an array for >= 2 fluff images (images-ON emit). */
  image?: z.infer<typeof imageField>;
  raw?: Record<string, unknown>;
  // NOTE: `strength_required` is deliberately NOT declared here. The parser maps it onto
  // `strength_requirement` and leaves the original in place as an inert `.loose()` extra
  // (spec §5, NO delete) — it is raw-shaped, so read-sites must cast to reach it.
}
