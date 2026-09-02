import type { Ability, SkillSlug, Choice } from "@archivist-gg/dnd5e";
import type { Edition } from "@archivist-gg/dnd5e/types/edition";
import type { Resource } from "@archivist-gg/dnd5e/types/resource";
import type { StartingEquipmentEntry } from "@archivist-gg/dnd5e/types/equipment-grant";
import type { AdditionalSpellsEntry }
  from "@archivist-gg/dnd5e/schemas/entity-extras-schema";

export type BackgroundToolProficiency =
  | { kind: "fixed"; items: string[] }
  | { kind: "choice"; count: number; from: string[] };

export type BackgroundLanguageProficiency =
  | { kind: "fixed"; languages: string[] }
  | { kind: "choice"; count: number; from: string | string[] };

export interface SuggestedCharacteristics {
  personality_traits?: Record<string, string>;
  ideals?: Record<string, { name?: string; desc: string; alignment?: string }>;
  bonds?: Record<string, string>;
  flaws?: Record<string, string>;
}

export interface BackgroundEntity {
  slug: string;
  name: string;
  edition: Edition;
  source: string;
  description: string;
  skill_proficiencies: SkillSlug[];
  tool_proficiencies: BackgroundToolProficiency[];
  language_proficiencies: BackgroundLanguageProficiency[];
  equipment: StartingEquipmentEntry[];
  feature: { name: string; description: string; resources?: Resource[] };
  ability_score_increases: { pool: Ability[] } | null;
  origin_feat: string | null;
  suggested_characteristics: SuggestedCharacteristics | null;
  choices?: Choice[];
  /** Converter/bundle extras declared by background.schema.ts §2.6; all optional, none read today. */
  rendering_hint?: string;
  has_fluff_images?: boolean;
  /** 88 roll tables over 67 docs; `roll` is a STRING on every row ("1", "2-3"). Render is G3b's
   *  (the 2026-09-02 G3 split; G3a renders no background tables). */
  tables?: Array<{ name: string; dice: string; rows: Array<{ roll: string; text: string }> }>;
  additional_spells?: AdditionalSpellsEntry[];
  /** The kind is CLOSED at the converter's only push site (background-mapper.ts). */
  prerequisites?: Array<{ kind: "campaign"; slug: string }>;
  /** One wikilink, or an array of them for the multi-fluff-image emit. */
  image?: string | string[];
}
