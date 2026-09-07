/**
 * R4-G6 §6 · READ-time decoding of the converter's 5etools-shaped monster leaves. Pure functions; every table is
 * DATA in this module (memory: rendering policy from the schema / data, never a switch on game vocabulary in a
 * renderer). Every function accepts the authored string / number shape AND the structured shape, and on the
 * string / number arms reproduces the plugin renderer's historical output byte for byte (invariant 5: the SRD
 * render pins are the proof).
 */
import type { Abilities } from "../types";
import { abilityModifier } from "../dnd/math";
import { CR_TO_XP, getProficiencyBonus } from "./monster.enrichment";
import type {
  AlignmentEntry, DamageQualifier, MonsterAC, MonsterCRStructured, MonsterGearEntry, MonsterHP, MonsterInitiative,
  MonsterSectionHeader, MonsterSpeed, MonsterSpeedValue, MonsterTypeStructured,
} from "./monster.types";

/** The plugin renderer's historical helper, byte for byte (`/\b\w/g`), so `player's` becomes `Player'S`. */
export function capitalizeWords(str: string): string {
  return str.replace(/\b\w/g, (c) => c.toUpperCase());
}

/** `capitalizeWords` applied OUTSIDE wikilink targets: the plain text and the ALIAS of `[[target|alias]]` are
 *  title-cased, the target never is (1,202 `ac[].from` links carry an apostrophe the plain helper mangles). */
export function capitalizeOutsideLinks(str: string): string {
  return str.replace(/\[\[([^\]|]+)(?:\|([^\]]*))?\]\]|([^[]+|\[)/g, (m, target: string | undefined, alias: string | undefined, plain: string | undefined) => {
    if (target !== undefined) return alias !== undefined ? `[[${target}|${capitalizeWords(alias)}]]` : `[[${target}]]`;
    return capitalizeWords(plain ?? m);
  });
}

// ---------------------------------------------------------------------------------------------------------------
// size
// ---------------------------------------------------------------------------------------------------------------
export const SIZE_CODES: Readonly<Record<string, string>> = { T: "Tiny", S: "Small", M: "Medium", L: "Large", H: "Huge", G: "Gargantuan" };

function sizeWords(size: string | string[] | undefined): string[] {
  if (size === undefined) return [];
  const arr = Array.isArray(size) ? size : [size];
  return arr.map((s) => SIZE_CODES[s] ?? capitalizeWords(s));
}

function joinOr(words: string[]): string {
  if (words.length <= 1) return words.join("");
  if (words.length === 2) return `${words[0]} or ${words[1]}`;
  return `${words.slice(0, -1).join(", ")}, or ${words[words.length - 1]}`;
}

export function formatSize(size: string | string[] | undefined, note?: string): string {
  const text = joinOr(sizeWords(size));
  return note ? `${text} ${note}` : text;
}

/** The FIRST decoded size word, lower-cased: the hit-die table and the edit-mode size select key on it. */
export function sizeWord(size: string | string[] | undefined): string {
  const first = sizeWords(size)[0];
  return (first ?? "Medium").toLowerCase();
}

// ---------------------------------------------------------------------------------------------------------------
// alignment
// ---------------------------------------------------------------------------------------------------------------
export const ALIGNMENT_CODES: Readonly<Record<string, string>> = {
  L: "lawful", N: "neutral", NX: "neutral", NY: "neutral", C: "chaotic", G: "good", E: "evil", U: "unaligned", A: "any alignment",
};
/** The multi-code SETS 5etools prints as a phrase, keyed by the sorted code set (the measured combos). */
export const ALIGNMENT_SETS: Readonly<Record<string, string>> = {
  "C,E,L,NX,NY": "any non-good alignment",
  "C,E,G,NX,NY": "any non-lawful alignment",
  "C,E,L,NX": "any evil alignment",
  "C,E,G,NY": "any chaotic alignment",
  "N,NX,NY": "any neutral alignment",
};

function decodeCodes(codes: string[]): string {
  const key = [...codes].sort().join(",");
  if (ALIGNMENT_SETS[key]) return ALIGNMENT_SETS[key];
  return codes.map((c) => ALIGNMENT_CODES[c] ?? c).join(" ");
}

function alignmentText(alignment: string | (string | AlignmentEntry)[] | undefined, prefix?: string): string {
  if (alignment === undefined) return "";
  let body: string;
  if (typeof alignment === "string") body = alignment;
  else if (alignment.every((a) => typeof a === "string")) body = decodeCodes(alignment as string[]);
  else {
    body = alignment.map((a) => {
      if (typeof a === "string") return ALIGNMENT_CODES[a] ?? a;
      if (a.special) return a.special;
      let t = decodeCodes(a.alignment ?? []);
      if (a.chance !== undefined) t += ` (${a.chance}%)`;
      if (a.note) t += ` (${a.note})`;
      return t;
    }).join(" or ");
  }
  return `${prefix ?? ""}${body}`;
}

export function formatAlignment(alignment: string | (string | AlignmentEntry)[] | undefined, prefix?: string): string {
  return capitalizeWords(alignmentText(alignment, prefix));
}

/** The decoded text lower-cased: the edit-mode alignment selects match on it. */
export function alignmentWords(alignment: string | (string | AlignmentEntry)[] | undefined): string {
  return alignmentText(alignment).toLowerCase();
}

// ---------------------------------------------------------------------------------------------------------------
// creature type
// ---------------------------------------------------------------------------------------------------------------
export const IRREGULAR_PLURALS: Readonly<Record<string, string>> = { fey: "fey", undead: "undead" };

function plural(word: string): string {
  return IRREGULAR_PLURALS[word.toLowerCase()] ?? `${word}s`;
}

export function formatType(type: string | MonsterTypeStructured | undefined, level?: number): string {
  if (type === undefined) return "";
  if (typeof type === "string") return capitalizeWords(type);
  // Each piece is capitalised on its own so the connectives ("of", "or") stay lower-case: "Swarm of Tiny Aberrations".
  const baseText = typeof type.type === "string"
    ? capitalizeWords(type.type)
    : type.type.choose.map(capitalizeWords).join(" or ");
  let text = type.swarm_size !== undefined
    ? `Swarm of ${SIZE_CODES[type.swarm_size] ?? capitalizeWords(type.swarm_size)} ${capitalizeWords(plural(typeof type.type === "string" ? type.type : type.type.choose.join(" or ")))}`
    : baseText;
  const tags = (type.tags ?? []).map((t) => typeof t === "string" ? t : t.prefix_hidden ? t.tag : `${t.prefix} ${t.tag}`);
  if (tags.length > 0) text += ` (${tags.map(capitalizeWords).join(", ")})`;
  if (type.sidekick_type && !type.sidekick_hidden) {
    text += `, ${capitalizeWords(type.sidekick_type)} Sidekick`;
    if (type.sidekick_tags && type.sidekick_tags.length > 0) text += ` (${type.sidekick_tags.map(capitalizeWords).join(", ")})`;
    if (level !== undefined) text += ` (level ${level})`;
  }
  return text;
}

// ---------------------------------------------------------------------------------------------------------------
// challenge rating
// ---------------------------------------------------------------------------------------------------------------
export interface FormattedCR {
  crText: string; xp: number; pb: number; tableMiss: boolean;
  lair?: string; coven?: string; xpLair?: number; xpOverride?: number;
}

export function formatCR(cr: string | MonsterCRStructured | undefined): FormattedCR | undefined {
  if (cr === undefined || cr === null) return undefined;
  const obj = typeof cr === "object" ? cr : { cr: String(cr) };
  const text = String(obj.cr);
  const tableMiss = !(text in CR_TO_XP);
  return {
    crText: text,
    xp: obj.xp ?? CR_TO_XP[text] ?? 0,
    pb: getProficiencyBonus(text),
    tableMiss,
    lair: obj.lair, coven: obj.coven, xpLair: obj.xp_lair, xpOverride: obj.xp,
  };
}

/** Thousands-separated without `toLocaleString` (ICU-independent, deterministic across Node and Electron). */
export function formatXP(xp: number): string {
  return String(xp).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** The bare `cr` text (today's Challenge value; the PB / XP tables key on it). */
export function crString(cr: string | MonsterCRStructured | undefined): string | undefined {
  return formatCR(cr)?.crText;
}

export function challengeLine(cr: string | MonsterCRStructured | undefined, pbNote?: string): string | undefined {
  const f = formatCR(cr);
  if (!f) return undefined;
  const pbText = pbNote ? `PB ${pbNote}` : `PB +${f.pb}`;
  if (f.tableMiss && f.xpOverride === undefined) return `${f.crText} (${pbText})`;
  const xpText = `${formatXP(f.xp)} XP`;
  if (f.xpLair !== undefined) return `${f.crText} (${xpText}, or ${formatXP(f.xpLair)} XP in its lair; ${pbText})`;
  let line = `${f.crText} (${xpText}; ${pbText})`;
  if (f.lair !== undefined) line += `, or ${f.lair} (${formatXP(CR_TO_XP[f.lair] ?? 0)} XP) in its lair`;
  if (f.coven !== undefined) line += `, or ${f.coven} (${formatXP(CR_TO_XP[f.coven] ?? 0)} XP) as a coven`;
  return line;
}

// ---------------------------------------------------------------------------------------------------------------
// armor class, hit points, speed
// ---------------------------------------------------------------------------------------------------------------
export function formatAC(ac: MonsterAC[] | undefined): string {
  const parts: string[] = [];
  for (const entry of ac ?? []) {
    if (entry.special !== undefined) { parts.push(entry.special); continue; }
    if (entry.ac === undefined) continue;                      // neither ac nor special: skipped (§3.2)
    let text = String(entry.ac);
    if (entry.from && entry.from.length > 0) text += ` (${entry.from.map(capitalizeOutsideLinks).join(", ")})`;
    if (entry.condition) text += ` ${entry.condition}`;
    parts.push(entry.braces ? `(${text})` : text);
  }
  return parts.length > 0 ? parts.join(", ") : "10";
}

export function formatHP(hp: MonsterHP | undefined): { text: string; formula?: string } {
  if (!hp) return { text: "0" };
  if (hp.special !== undefined) return { text: hp.special };
  if (hp.average === undefined) return { text: "0" };
  return hp.formula ? { text: String(hp.average), formula: hp.formula } : { text: String(hp.average) };
}

export const SPEED_MODES = ["walk", "fly", "swim", "climb", "burrow"] as const;
export type SpeedMode = (typeof SPEED_MODES)[number];

function speedEntry(mode: string, value: MonsterSpeedValue | undefined, hoverAppend: boolean): string | undefined {
  if (value === undefined || value === null) return undefined;
  const n = typeof value === "number" ? value : value.number;
  if (!n) return undefined;                                     // today's `.filter(([_, v]) => v)`: a 0 is omitted
  let text = `${capitalizeWords(mode)} ${n} ft.`;
  const cond = typeof value === "number" ? undefined : value.condition;
  if (cond) text += ` ${cond}`;
  if (hoverAppend && !(cond ?? "").toLowerCase().includes("hover")) text += " (hover)";
  return text;
}

export function formatSpeed(speed: MonsterSpeed | undefined): string {
  if (!speed) return "0 ft.";
  const parts: string[] = [];
  for (const mode of SPEED_MODES) {
    const e = speedEntry(mode, speed[mode], mode === "fly" && speed.can_hover === true);
    if (e) parts.push(e);
  }
  for (const [mode, entries] of Object.entries(speed.alternate ?? {})) {
    for (const alt of entries) { const e = speedEntry(mode, alt, false); if (e) parts.push(e); }
  }
  if (speed.choose) {
    let t = `${speed.choose.amount} ft. ${speed.choose.from.join(" or ")}`;
    if (speed.choose.note) t += ` ${speed.choose.note}`;
    parts.push(t);
  }
  return parts.join(", ");
}

/** The numeric part of a speed value, or 0 (the edit-mode number inputs and the `> 0` gates read this). */
export function speedNumber(speed: MonsterSpeed | undefined, mode: SpeedMode): number {
  const v = speed?.[mode];
  if (v === undefined || v === null) return 0;
  return typeof v === "number" ? v : v.number;
}

// ---------------------------------------------------------------------------------------------------------------
// damage / condition qualifiers
// ---------------------------------------------------------------------------------------------------------------
function qualifierText(q: string | DamageQualifier): string {
  if (typeof q === "string") return capitalizeWords(q);
  if (q.special !== undefined) return q.special;
  const inner = (q.types ?? []).map(qualifierText).join(", ");
  let text = inner;
  if (q.pre_note) text = `${q.pre_note} ${text}`;
  if (q.note) text = `${text} ${q.note}`;
  return text;
}

export function formatQualifiers(list: (string | DamageQualifier)[] | null | undefined): string[] {
  return (list ?? []).map(qualifierText);
}

/** The STRING entries only (the edit-mode multi-selects are `string[]`; structured entries are merged back on save). */
export function qualifierStrings(list: (string | DamageQualifier)[] | null | undefined): string[] {
  return (list ?? []).filter((q): q is string => typeof q === "string");
}

// ---------------------------------------------------------------------------------------------------------------
// initiative, gear, skills_other
// ---------------------------------------------------------------------------------------------------------------
export const INITIATIVE_MODES: Readonly<Record<string, string>> = { advantage: "advantage", adv: "advantage", disadvantage: "disadvantage", dis: "disadvantage" };

export function formatInitiative(initiative: number | MonsterInitiative | undefined, abilities: Abilities | undefined, pb: number): string | undefined {
  if (initiative === undefined || initiative === null) return undefined;
  const dex = abilities ? abilityModifier(abilities.dex) : 0;
  const bonus = typeof initiative === "number" ? initiative : dex + (initiative.proficiency ?? 0) * pb;
  const sign = bonus >= 0 ? `+${bonus}` : `${bonus}`;
  let text = `${sign} (${10 + bonus})`;
  const mode = typeof initiative === "number" ? undefined : initiative.advantage_mode;
  if (mode && INITIATIVE_MODES[mode]) text += ` (${INITIATIVE_MODES[mode]})`;
  return text;
}

function itemName(uid: string): string {
  return capitalizeWords(uid.split("|")[0]);
}

export function formatGear(gear: (string | MonsterGearEntry)[] | undefined): string {
  return (gear ?? []).map((g) => {
    if (typeof g === "string") return itemName(g);
    const name = g.displayName ?? itemName(g.item);
    return g.quantity !== undefined && g.quantity > 1 ? `${name} × ${g.quantity}` : name;
  }).join(", ");
}

export function formatSkillsOther(list: unknown[] | undefined): string | undefined {
  if (!list || list.length === 0) return undefined;
  const parts: string[] = [];
  for (const entry of list) {
    const oneOf = (entry as { one_of?: Record<string, unknown> } | null)?.one_of;
    if (!oneOf) continue;
    parts.push(Object.entries(oneOf).map(([k, v]) => `${capitalizeWords(k)} ${String(v)}`).join(", "));
  }
  return parts.length > 0 ? `plus one of: ${parts.join("; ")}` : undefined;
}

// ---------------------------------------------------------------------------------------------------------------
// legendary intro, section headers, displayAs
// ---------------------------------------------------------------------------------------------------------------
export function legendaryIntro(
  m: { name: string; is_named_creature?: boolean; short_name?: string | boolean; legendary_actions_lair_count?: number },
  count: number,
): string {
  const subject = m.is_named_creature
    ? (typeof m.short_name === "string" ? m.short_name : m.name)
    : `the ${m.name.toLowerCase()}`;
  const Subject = m.is_named_creature ? subject : `The ${m.name.toLowerCase()}`;
  const lair = m.legendary_actions_lair_count !== undefined ? ` (${m.legendary_actions_lair_count} in its lair)` : "";
  return `${Subject} can take ${count} legendary actions${lair}, choosing from the options below. Only one legendary action option can be used at a time and only at the end of another creature's turn. ${Subject} regains spent legendary actions at the start of its turn.`;
}

export function sectionHeader(
  m: { section_headers?: MonsterSectionHeader[]; mythic_header?: string[] },
  section: "legendary_actions" | "mythic" | "reactions",
): string[] | undefined {
  const entry = (m.section_headers ?? []).find((h) => h.section === section);
  if (entry) return entry.header;
  if (section === "mythic" && m.mythic_header && m.mythic_header.length > 0) return m.mythic_header;
  return undefined;
}

export type PlacedSection = "traits" | "actions" | "bonus_actions" | "reactions" | "legendary_actions";
/** ONE object: the 5etools `displayAs` vocabulary to the stat-block section (the plugin never switches on it). */
export const DISPLAY_AS_SECTION: Readonly<Record<string, Exclude<PlacedSection, "traits">>> = {
  action: "actions", bonus: "bonus_actions", reaction: "reactions", legendary: "legendary_actions",
};
export function displayAsSection(displayAs: string | undefined): PlacedSection {
  return (displayAs !== undefined && DISPLAY_AS_SECTION[displayAs]) || "traits";
}
