import type { Feature, Resource } from "@archivist-gg/dnd5e";
import type { Edition, SubclassSpellcastingConfig } from "@archivist-gg/dnd5e/class/class.types";
import type { SelectionPool, PoolGrant, TabDecl } from "@archivist-gg/dnd5e/types/selection-pool";
import type { AdditionalSpellsEntry, ProgressionEntry }
  from "@archivist-gg/dnd5e/schemas/entity-extras-schema";

export interface SubclassEntity {
  slug: string;
  name: string;
  parent_class: string;
  edition: Edition;
  source: string;
  description: string;
  spellcasting?: SubclassSpellcastingConfig | null;
  table?: Record<number, { columns?: Record<string, string | number> }>;
  features_by_level: Record<number, Feature[]>;
  resources: Resource[];
  selection_pools?: SelectionPool[];
  pool_grants?: PoolGrant[];
  tabs?: TabDecl[];
  /** Converter/bundle extras declared by subclass.schema.ts §2.7; all optional, none read today. */
  rendering_hint?: string;
  short_name?: string;
  has_fluff?: boolean;
  has_fluff_images?: boolean;
  /** RAW 5etools passthrough (single measured key-set `{_subclassFluff:{…}}`): mirrors `z.unknown()`. */
  fluff?: unknown;
  table_col_labels?: string[];
  cantrip_progression?: number[];
  prepared_spells_change?: string;
  prepared_spells_progression?: number[];
  spells_known_progression?: number[];
  feat_progression?: ProgressionEntry[];
  optionalfeature_progression?: ProgressionEntry[];
  additional_spells?: AdditionalSpellsEntry[];
  /** One wikilink, or an array of them for the multi-fluff-image emit. */
  image?: string | string[];
}
