import type { Choice, Ability, FeatCategory, FeatureEffect } from "@archivist-gg/dnd5e";
import type { Edition } from "@archivist-gg/dnd5e/types/edition";
import type { Resource, ActionCost } from "@archivist-gg/dnd5e/types/resource";
import type { AdditionalSpellsEntry, ProgressionEntry }
  from "@archivist-gg/dnd5e/schemas/entity-extras-schema";

export type FeatPrerequisite =
  | { kind: "ability"; ability: Ability; min: number }
  | { kind: "level"; min: number }
  | { kind: "spellcaster" }
  | { kind: "proficiency"; proficiency_type: "armor" | "weapon" | "tool" | "skill" | "saving-throw"; value: string }
  | { kind: "race"; slug: string }
  | { kind: "class"; slug: string }
  | { kind: "feat"; slug: string }
  | { kind: "campaign"; slug: string }
  | { kind: "exclusive-feat-category"; slug: string }
  | { kind: "feature"; slug: string }
  | { kind: "other"; detail: string }
  | { kind: "feat-category"; slug: string }
  | { kind: "background"; slug: string };

export interface FeatGrantsAsi {
  amount: number;
  pool?: Ability[];
}

export interface FeatEntity {
  slug: string;
  name: string;
  edition: Edition;
  source: string;
  category: FeatCategory;
  description: string;
  prerequisites: FeatPrerequisite[];
  benefits: string[];
  effects: FeatureEffect[];
  grants_asi: FeatGrantsAsi | null;
  repeatable: boolean;
  choices: Choice[];
  resources?: Resource[];
  /** Converter/bundle extras declared by feat.schema.ts §2.4; all optional, none read today. */
  rendering_hint?: string;
  additional_spells?: AdditionalSpellsEntry[];
  has_fluff?: boolean;
  has_fluff_images?: boolean;
  /** RAW 5etools passthrough: `unknown` mirrors the schema's `z.unknown()`. */
  trait_tags?: unknown;
  optionalfeature_progression?: ProgressionEntry[];
  /** R-G1b-5: a TOP-LEVEL bundle key on `SRD 2024/Feats/Boon of the Night Spirit.md`.
   *  MAPPED since R4-G3a §10.2.3: the resolver carries it onto the resolved feature's
   *  `action`, so the feat note shows an Action line and the row files under that economy. */
  action_cost?: ActionCost;
  /** One wikilink, or an array of them for the multi-fluff-image emit. */
  image?: string | string[];
}
