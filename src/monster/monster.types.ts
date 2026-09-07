import type { Abilities, AC, HP, Speed, Feature } from "../types";

export interface Monster {
  name: string;
  size?: string;
  type?: string;
  subtype?: string;
  alignment?: string;
  cr?: string;
  ac?: AC[];
  hp?: HP;
  speed?: Speed;
  abilities?: Abilities;
  saves?: Partial<Record<string, number>>;
  skills?: Record<string, number>;
  senses?: string[];
  passive_perception?: number;
  languages?: string[];
  damage_vulnerabilities?: string[];
  damage_resistances?: string[];
  damage_immunities?: string[];
  condition_immunities?: string[];
  traits?: Feature[];
  actions?: Feature[];
  reactions?: Feature[];
  legendary_actions?: Feature[];
  legendary_action_uses?: number;
  legendary_resistance?: number;
  columns?: number;
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
