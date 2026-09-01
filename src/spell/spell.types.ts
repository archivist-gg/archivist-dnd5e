import type { CastingOption } from "@archivist-gg/dnd5e/types/casting-option";
export type { CastingOption };

export interface Spell {
  name: string;
  level?: number;
  school?: string;
  casting_time?: string;
  range?: string;
  components?: string;
  duration?: string;
  concentration?: boolean;
  ritual?: boolean;
  classes?: string[];
  description?: string;
  at_higher_levels?: string[];
  damage?: { types: string[] };
  saving_throw?: { ability: string };
  casting_options?: CastingOption[];
  // §2 · the fourteen converter keys (R4-G2). Declared-only this phase: nothing renders them yet.
  // `components` and `duration` deliberately STAY `string` above — `parseSpell` normalises the
  // converter's structured forms, so every existing consumer is untouched.
  rendering_hint?: string;
  misc_tags?: string[];
  area_tags?: string[];
  condition_inflict?: string[];
  affects_creature_type?: string[];
  spell_attack?: "melee" | "ranged";
  ability_check?: string[];
  damage_resist?: string[];
  damage_immune?: string[];
  condition_immune?: string[];
  damage_vulnerable?: string[];
  has_fluff?: boolean;
  image?: string | string[];
  has_fluff_images?: boolean;
  // Body-only metadata: passed through from canonical YAML so the renderer
  // can show a source badge ("SRD 5e", "SRD 2024", or a custom compendium).
  source?: string;
  /* eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents */
  edition?: "2014" | "2024" | string;
}
