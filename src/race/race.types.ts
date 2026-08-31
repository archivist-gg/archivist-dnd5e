import type { Feature, Ability, Speed, Choice } from "@archivist-gg/dnd5e";
import type { Edition } from "@archivist-gg/dnd5e/types/edition";
import type { AdditionalSpellsEntry }
  from "@archivist-gg/dnd5e/schemas/entity-extras-schema";

export type Size = "tiny" | "small" | "medium" | "large" | "huge";

export type FixedAbilityIncrease = { ability: Ability; amount: number };
export type ChoiceAbilityIncrease = { choose: number; pool: Ability[]; amount: number };
export type AbilityScoreIncrease = FixedAbilityIncrease | ChoiceAbilityIncrease;

export interface Vision {
  darkvision?: number;
  blindsight?: number;
  tremorsense?: number;
  truesight?: number;
}

export interface LanguageProficiencies {
  fixed: string[];
  choice?: { count: number; from: string | string[] };
}

export interface RaceEntity {
  slug: string;
  name: string;
  edition: Edition;
  source: string;
  description: string;
  size: Size;
  speed: Speed;
  ability_score_increases: AbilityScoreIncrease[];
  age: string;
  alignment: string;
  vision: Vision;
  languages: LanguageProficiencies;
  variant_label: string;
  traits: Feature[];
  choices?: Choice[];
  subspecies_of?: string;
  /** Converter/bundle extras declared by race.schema.ts §2.3. Every one is optional: none is
   *  read by the pc pipeline today, and declaring them is what stops the parser silently
   *  dropping them (the "declare or lose" rule). */
  rendering_hint?: string;
  has_fluff?: boolean;
  has_fluff_images?: boolean;
  creature_type?: string[];
  creature_type_tags?: string[];
  /** DUAL ARITY (§2.8): the converter emits an array on 109 docs, the shipped SRD bundle a bare
   *  object on 3 (`SRD 2024/Races/{Elf,Tiefling}.md`, `SRD 5e/Races/Tiefling.md`). */
  additional_spells?: AdditionalSpellsEntry[] | AdditionalSpellsEntry;
  /** The four RAW 5etools passthroughs: `unknown` mirrors the schema's `z.unknown()`. Today's
   *  variant set is a snapshot, not a contract, so the type stays maximally loose. */
  trait_tags?: unknown;
  lineage?: unknown;
  height_and_weight?: unknown;
  sound_clip?: unknown;
  /** One wikilink, or an array of them for the multi-fluff-image emit. */
  image?: string | string[];
}
