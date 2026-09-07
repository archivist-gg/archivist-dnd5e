/**
 * R4-G6 §3 · the monster schema. Every key the converter and the SRD bundle emit is DECLARED (79 converter keys +
 * `name`, `subtype`, `columns`, `slug` / `edition` / `source`, `image` / `thumbnail`, `raw`). An undeclared TOP-LEVEL key
 * relocates to `raw` (the parser's extras copy); an undeclared NESTED key is stripped and the converter census reports
 * it (plain `z.object` on every nested container: Gate 0 Q1). No `.default()`; no `.min(1)` on `rendering_hint`
 * (always `""`); one nullable spelling. `satisfies` (never an annotation) keeps `.shape`, which `MONSTER_KNOWN_KEYS`
 * and the parity test read.
 */
import { z } from "zod";
import { featureObjectSchema } from "../schemas/feature-schema";
import { imageField } from "../schemas/entity-extras-schema";
import type { Monster, DamageQualifier } from "./monster.types";

const str = z.string();
const num = z.number();
const bool = z.boolean();
const strArr = z.array(z.string());

export const damageQualifierSchema: z.ZodType<DamageQualifier> = z.object({
  get types() { return z.array(z.union([str, damageQualifierSchema])).optional(); },
  note: str.optional(), pre_note: str.optional(), cond: bool.optional(), special: str.optional(),
});
const qualifierList = z.array(z.union([str, damageQualifierSchema])).optional();

const speedValue = z.union([num, z.object({ number: num, condition: str.optional() })]);
export const monsterSpeedSchema = z.object({
  walk: speedValue.optional(), fly: speedValue.optional(), swim: speedValue.optional(), climb: speedValue.optional(), burrow: speedValue.optional(),
  hover: bool.optional(), can_hover: bool.optional(),
  alternate: z.record(str, z.array(z.object({ number: num, condition: str.optional() }))).optional(),
  choose: z.object({ from: strArr, amount: num, note: str.optional() }).optional(),
});
export const monsterTypeSchema = z.object({
  type: z.union([str, z.object({ choose: strArr })]),
  tags: z.array(z.union([str, z.object({ tag: str, prefix: str, prefix_hidden: bool.optional() })])).optional(),
  sidekick_type: str.optional(), sidekick_tags: strArr.optional(), swarm_size: str.optional(), sidekick_hidden: bool.optional(),
});
export const monsterCRSchema = z.object({ cr: str, lair: str.optional(), coven: str.optional(), xp: num.optional(), xp_lair: num.optional() });
export const monsterACSchema = z.object({ ac: num.optional(), from: strArr.optional(), condition: str.optional(), braces: bool.optional(), special: str.optional() });
export const monsterHPSchema = z.object({ average: num.optional(), formula: str.optional(), special: str.optional() });
export const alignmentEntrySchema = z.object({ alignment: strArr.optional(), chance: num.optional(), note: str.optional(), special: str.optional() });
const spellEntry = z.union([str, z.object({ entry: str, hidden: bool.optional() })]);
const spellList = z.array(spellEntry);
const spellLevel = z.object({ slots: num.optional(), lower: num.optional(), spells: strArr });
export const monsterSpellcastingSchema = z.object({
  name: str.optional(), type: str.optional(), headerEntries: strArr.optional(), footerEntries: strArr.optional(),
  ability: str.optional(), displayAs: str.optional(), hidden: strArr.optional(),
  spells: z.record(str, spellLevel).optional(), will: spellList.optional(), ritual: spellList.optional(),
  daily: z.record(str, spellList).optional(), rest: z.record(str, spellList).optional(), restLong: z.record(str, spellList).optional(),
  recharge: z.record(str, spellList).optional(), legendary: z.record(str, spellList).optional(), charges: z.record(str, spellList).optional(),
  chargesItem: str.optional(),
});
export const initiativeSchema = z.union([num, z.object({ proficiency: num.optional(), advantage_mode: str.optional() })]);
export const gearEntrySchema = z.union([str, z.object({ item: str, quantity: num.optional(), displayName: str.optional() })]);
const featureArr = z.array(featureObjectSchema).optional();

export const monsterSchema = z.object({
  name: str.min(1),
  size: z.union([str, strArr]).optional(), size_note: str.optional(),
  type: z.union([str, monsterTypeSchema]).optional(), subtype: str.optional(),
  alignment: z.union([str, z.array(z.union([str, alignmentEntrySchema]))]).optional(), alignment_prefix: str.optional(),
  cr: z.union([str, monsterCRSchema]).optional(), pb_note: str.optional(),
  ac: z.array(monsterACSchema).optional(), hp: monsterHPSchema.optional(), speed: monsterSpeedSchema.optional(),
  abilities: z.object({ str: num, dex: num, con: num, int: num, wis: num, cha: num }).optional(),
  saves: z.record(str, num).optional(), skills: z.record(str, num).optional(), skills_other: z.array(z.unknown()).optional(),
  senses: strArr.nullable().optional(), passive_perception: num.optional(), languages: strArr.nullable().optional(),
  damage_vulnerabilities: qualifierList, damage_resistances: qualifierList, damage_immunities: qualifierList, condition_immunities: qualifierList,
  traits: featureArr, actions: featureArr, bonus_actions: featureArr, reactions: featureArr, legendary_actions: featureArr, mythic: featureArr,
  mythic_header: strArr.optional(),
  legendary_action_uses: num.optional(), legendary_resistance: num.optional(), legendary_actions_lair_count: num.optional(),
  section_headers: z.array(z.object({ section: str, header: strArr })).optional(), action_note: str.optional(), reaction_note: str.optional(),
  spellcasting: z.array(monsterSpellcastingSchema).optional(), legendary_group: z.object({ name: str, source: str }).optional(),
  lair_actions: z.array(z.unknown()).optional(), regional_actions: z.array(z.unknown()).optional(), variant: z.array(z.unknown()).optional(),
  initiative: initiativeSchema.optional(), gear: z.array(gearEntrySchema).optional(),
  is_named_creature: bool.optional(), is_npc: bool.optional(), familiar: bool.optional(), short_name: z.union([str, bool]).optional(), level: num.optional(),
  dragon_age: str.optional(), dragon_casting_color: str.optional(),
  environment: strArr.optional(), treasure: strArr.optional(), attached_items: strArr.optional(), group: strArr.nullable().optional(),
  summoned_by_spell: str.optional(), summoned_by_spell_level: num.optional(), summoned_by_class: str.optional(),
  trait_tags: strArr.optional(), action_tags: strArr.optional(), sense_tags: strArr.optional(), language_tags: strArr.optional(),
  spellcasting_tags: strArr.optional(), misc_tags: strArr.optional(), damage_tags: strArr.optional(), damage_tags_spell: strArr.optional(),
  damage_tags_legendary: strArr.optional(), condition_inflict: strArr.optional(), condition_inflict_spell: strArr.optional(),
  condition_inflict_legendary: strArr.optional(), saving_throw_forced: strArr.optional(), saving_throw_forced_spell: strArr.optional(),
  saving_throw_forced_legendary: strArr.optional(),
  has_fluff: bool.optional(), has_fluff_images: bool.optional(), has_token: bool.optional(), token_credit: str.optional(),
  token_custom: bool.optional(), foundry_token_scale: num.optional(),
  sound_clip: z.object({ type: str, path: str }).optional(),
  alt_art: z.array(z.object({ name: str, source: str.optional(), page: num.optional() })).optional(),
  image: imageField, thumbnail: imageField, rendering_hint: str.optional(), columns: num.optional(),
  slug: str.optional(), edition: str.optional(), source: str.optional(),
  raw: z.record(str, z.unknown()).optional(),
}) satisfies z.ZodType<Monster>;

export const MONSTER_KNOWN_KEYS: ReadonlySet<string> = new Set(Object.keys(monsterSchema.shape));
