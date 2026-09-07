import type { Abilities, Feature } from "../types";

export interface Monster {
  name: string;
  size?: string | string[];              size_note?: string;
  type?: string | MonsterTypeStructured; subtype?: string;
  alignment?: string | (string | AlignmentEntry)[];   alignment_prefix?: string;
  cr?: string | MonsterCRStructured;     pb_note?: string;
  ac?: MonsterAC[];  hp?: MonsterHP;  speed?: MonsterSpeed;  abilities?: Abilities;
  saves?: Partial<Record<string, number>>;  skills?: Record<string, number>;  skills_other?: unknown[];
  senses?: string[] | null;  passive_perception?: number;  languages?: string[] | null;
  damage_vulnerabilities?: (string | DamageQualifier)[];  damage_resistances?: (string | DamageQualifier)[];
  damage_immunities?: (string | DamageQualifier)[];       condition_immunities?: (string | DamageQualifier)[];
  traits?: Feature[];  actions?: Feature[];  bonus_actions?: Feature[];  reactions?: Feature[];
  legendary_actions?: Feature[];  mythic?: Feature[];  mythic_header?: string[];
  legendary_action_uses?: number;  legendary_resistance?: number;  legendary_actions_lair_count?: number;
  section_headers?: MonsterSectionHeader[];  action_note?: string;  reaction_note?: string;
  spellcasting?: MonsterSpellcasting[];  legendary_group?: MonsterLegendaryGroup;
  lair_actions?: unknown[];  regional_actions?: unknown[];  variant?: unknown[];
  initiative?: number | MonsterInitiative;  gear?: (string | MonsterGearEntry)[];
  is_named_creature?: boolean;  is_npc?: boolean;  familiar?: boolean;  short_name?: string | boolean;  level?: number;
  dragon_age?: string;  dragon_casting_color?: string;
  environment?: string[];  treasure?: string[];  attached_items?: string[];  group?: string[] | null;
  summoned_by_spell?: string;  summoned_by_spell_level?: number;  summoned_by_class?: string;
  trait_tags?: string[];  action_tags?: string[];  sense_tags?: string[];  language_tags?: string[];
  spellcasting_tags?: string[];  misc_tags?: string[];  damage_tags?: string[];  damage_tags_spell?: string[];
  damage_tags_legendary?: string[];  condition_inflict?: string[];  condition_inflict_spell?: string[];
  condition_inflict_legendary?: string[];  saving_throw_forced?: string[];  saving_throw_forced_spell?: string[];
  saving_throw_forced_legendary?: string[];
  has_fluff?: boolean;  has_fluff_images?: boolean;  has_token?: boolean;  token_credit?: string;
  token_custom?: boolean;  foundry_token_scale?: number;  sound_clip?: MonsterSoundClip;  alt_art?: MonsterAltArt[];
  image?: string | string[];  thumbnail?: string | string[];  rendering_hint?: string;  columns?: number;
  slug?: string;  edition?: string;  source?: string;  raw?: Record<string, unknown>;
}

// R4-G6 §3.2 · monster-LOCAL shapes for the converter's wide leaves. The shared `AC` / `HP` / `Speed` in
// `../types` are NOT widened: `Speed` is `RaceEntity.speed` and the PC recalc reads it as a number.
export interface MonsterAC { ac?: number; from?: string[]; condition?: string; braces?: boolean; special?: string }
export interface MonsterHP { average?: number; formula?: string; special?: string }
export type MonsterSpeedValue = number | { number: number; condition?: string };
export interface MonsterSpeed {
  walk?: MonsterSpeedValue; fly?: MonsterSpeedValue; swim?: MonsterSpeedValue; climb?: MonsterSpeedValue; burrow?: MonsterSpeedValue;
  hover?: boolean; can_hover?: boolean;
  alternate?: Record<string, { number: number; condition?: string }[]>;
  choose?: { from: string[]; amount: number; note?: string };
}
export interface MonsterTypeStructured {
  type: string | { choose: string[] };
  tags?: (string | { tag: string; prefix: string; prefix_hidden?: boolean })[];
  sidekick_type?: string; sidekick_tags?: string[]; swarm_size?: string; sidekick_hidden?: boolean;
}
export interface MonsterCRStructured { cr: string; lair?: string; coven?: string; xp?: number; xp_lair?: number }
export interface AlignmentEntry { alignment?: string[]; chance?: number; note?: string; special?: string }
export interface DamageQualifier { types?: (string | DamageQualifier)[]; note?: string; pre_note?: string; cond?: boolean; special?: string }
export type MonsterSpellEntry = string | { entry: string; hidden?: boolean };
export interface MonsterSpellSlotLevel { slots?: number; lower?: number; spells: string[] }
export interface MonsterSpellcasting {
  name?: string; type?: string; headerEntries?: string[]; footerEntries?: string[]; ability?: string; displayAs?: string;
  hidden?: string[]; spells?: Record<string, MonsterSpellSlotLevel>; will?: MonsterSpellEntry[]; ritual?: MonsterSpellEntry[];
  daily?: Record<string, MonsterSpellEntry[]>; rest?: Record<string, MonsterSpellEntry[]>; restLong?: Record<string, MonsterSpellEntry[]>;
  recharge?: Record<string, MonsterSpellEntry[]>; legendary?: Record<string, MonsterSpellEntry[]>; charges?: Record<string, MonsterSpellEntry[]>;
  chargesItem?: string;
}
/** `advantage_mode` is a STRING, decoded by `INITIATIVE_MODES` in monster.format.ts (never a closed enum: a hand-typed
 *  5etools `adv` must not refuse the document). */
export interface MonsterInitiative { proficiency?: number; advantage_mode?: string }
export interface MonsterGearEntry { item: string; quantity?: number; displayName?: string }
export interface MonsterSectionHeader { section: string; header: string[] }
export interface MonsterLegendaryGroup { name: string; source: string }
export interface MonsterSoundClip { type: string; path: string }
export interface MonsterAltArt { name: string; source?: string; page?: number }
