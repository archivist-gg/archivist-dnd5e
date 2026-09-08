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
  MonsterSectionHeader, MonsterSpeed, MonsterSpeedValue, MonsterSpellcasting, MonsterSpellEntry, MonsterTypeStructured,
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

/** The three decimal spellings the SRD authors for a fractional CR, mapped to the fraction `CR_TO_XP` keys on. DATA,
 *  not a branch: only the LOOKUP key is normalised, so the rendered text stays the AUTHORED string and the SRD's
 *  `0.25` renders as `0.25 (50 XP; PB +2)` beside the converter's `1/4 (50 XP; PB +2)` for the same creature. All
 *  THREE CR-shaped fields go through it: `cr` in `formatCR`, and `lair` / `coven` in `challengeLine` via `xpFor`. */
const CR_DECIMAL_KEYS: Readonly<Record<string, string>> = { "0.125": "1/8", "0.25": "1/4", "0.5": "1/2" };

/** An OWN-property test. `Object.hasOwn` is ES2022 and this package's `lib` stops at ES7 (TS2550), so the table reads
 *  go through `hasOwnProperty` instead: what they must never use is `in`, which sees `Object.prototype`. */
function hasOwn(table: Readonly<Record<string, unknown>>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(table, key);
}

/** The authored CR text as the XP / PB tables key it: a decimal fraction becomes its fraction, everything else is
 *  itself. An unknown spelling stays unknown, so the caller can still report a table MISS. */
function crKey(text: string): string {
  return hasOwn(CR_DECIMAL_KEYS, text) ? CR_DECIMAL_KEYS[text] : text;
}

/** The XP any CR-shaped field is worth: normalised key, OWN-property read, 0 for a key the table does not carry (so
 *  a `lair: "constructor"` can never stringify a function into the Challenge line). */
function xpFor(cr: string): number {
  const key = crKey(cr);
  return hasOwn(CR_TO_XP, key) ? CR_TO_XP[key] : 0;
}

export function formatCR(cr: string | MonsterCRStructured | undefined): FormattedCR | undefined {
  if (cr === undefined || cr === null) return undefined;
  const obj = typeof cr === "object" ? cr : { cr: String(cr) };
  const text = String(obj.cr);
  // `hasOwn`, never `in`: an authored `cr: "constructor"` would otherwise read `Object.prototype` and print a
  // stringified function as its XP. Both tables are read through it.
  const key = crKey(text);
  const tableMiss = !hasOwn(CR_TO_XP, key);
  return {
    crText: text,
    xp: obj.xp ?? xpFor(text),
    pb: getProficiencyBonus(key),
    tableMiss,
    lair: obj.lair, coven: obj.coven, xpLair: obj.xp_lair, xpOverride: obj.xp,
  };
}

/** Thousands-separated without `toLocaleString` (ICU-independent, deterministic across Node and Electron). */
export function formatXP(xp: number): string {
  return String(xp).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** The bare `cr` text (today's Challenge value; `formatCR` normalises it before the PB / XP table reads). */
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
  if (f.lair !== undefined) line += `, or ${f.lair} (${formatXP(xpFor(f.lair))} XP) in its lair`;
  if (f.coven !== undefined) line += `, or ${f.coven} (${formatXP(xpFor(f.coven))} XP) as a coven`;
  return line;
}

// ---------------------------------------------------------------------------------------------------------------
// armor class, hit points, speed
// ---------------------------------------------------------------------------------------------------------------
/** R4 {G5, G6} live rider N-3-3: a BRACED entry joins with a SPACE, every other with ", ". The braces
 *  flag marks an entry that reads as a parenthetical on the one before it ("15 (17 with mage armor)"),
 *  so emitting the list comma as well gave the Archmage and the converter's Feonor
 *  `Armor Class. 12, (15 with mage armor)`. The separator therefore belongs to the entry that FOLLOWS
 *  it, not to the list, which is why this joins by hand rather than with `Array.join`. A braced entry
 *  that opens the line still stands alone, and two unbraced entries still take the comma. */
export function formatAC(ac: MonsterAC[] | undefined): string {
  const parts: { text: string; braced: boolean }[] = [];
  for (const entry of ac ?? []) {
    if (entry.special !== undefined) { parts.push({ text: entry.special, braced: false }); continue; }
    if (entry.ac === undefined) continue;                      // neither ac nor special: skipped (§3.2)
    let text = String(entry.ac);
    if (entry.from && entry.from.length > 0) text += ` (${entry.from.map(capitalizeOutsideLinks).join(", ")})`;
    if (entry.condition) text += ` ${entry.condition}`;
    parts.push(entry.braces ? { text: `(${text})`, braced: true } : { text, braced: false });
  }
  if (parts.length === 0) return "10";
  return parts.reduce((acc, p, i) => (i === 0 ? p.text : `${acc}${p.braced ? " " : ", "}${p.text}`), "");
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

// ---------------------------------------------------------------------------------------------------------------
// spellcasting (§8.2)
// ---------------------------------------------------------------------------------------------------------------

const GROUP_ORDER = ["will", "daily", "rest", "restLong", "recharge", "legendary", "charges", "ritual"] as const;

/** ONE label table: EVERY group of `GROUP_ORDER` owns its label text here, so the eight FREQUENCY-group labels are
 *  DATA; the slot-table wording (`Cantrips (At Will):`, `N Level (N Slots):`) is generated in `spellcastingLines`
 *  and deliberately outside this table. Title-cased to match the SRD 2024 statblock prose the vault already
 *  shows beside these entries. `plain` is a plain sub-key's label, and the whole label of the two count-less groups
 *  `will` and `ritual`; `each` is its `Ne` twin, absent where a group has no twin; `six` is `recharge`'s
 *  already-at-6 form. `N` stands for the sub-key's count. `charges` alone ends without a colon: `spellcastingLines`
 *  appends ` (chargesItem):` after it (§8.2). The KEY type is `GROUP_ORDER`'s union, so a ninth group without a row
 *  is a compile error rather than a runtime `undefined`. */
export const SPELLCASTING_LABELS: Readonly<Record<(typeof GROUP_ORDER)[number], { plain: string; each?: string; six?: string }>> = {
  will: { plain: "At Will:" },
  daily: { plain: "N/Day:", each: "N/Day Each:" },
  rest: { plain: "N/Rest:", each: "N/Rest Each:" },
  restLong: { plain: "N/Long Rest:", each: "N/Long Rest Each:" },
  recharge: { plain: "Recharge N-6:", six: "Recharge 6:" },
  legendary: { plain: "N/Legendary Action:", each: "N/Legendary Action Each:" },
  charges: { plain: "N Charges", each: "N Charges Each" },
  ritual: { plain: "Rituals:" },
};

/** The ELEMENT guard for every spell group: a `null` (a hand-authored empty YAML list item) and any non-object
 *  non-string leaf yield NO spell rather than throwing. `typeof null === "object"`, so the check is explicit. */
function spellText(e: MonsterSpellEntry): string | undefined {
  if (typeof e === "string") return e;
  if (!e || typeof e !== "object") return undefined;
  return e.hidden ? undefined : e.entry;
}
/** A non-array group (a hand-typed `will: "fireball"`) yields NO spells rather than throwing: `entriesToMarkdown`
 *  reaches `spellcastingLines` through a cast, so the declared element type is not a runtime guarantee. This guards
 *  the LIST; its ELEMENTS are guarded one level down, in `spellText`. */
function spellsOf(list: MonsterSpellEntry[] | undefined): string {
  return (Array.isArray(list) ? list : []).map(spellText).filter((s): s is string => s !== undefined).join(", ");
}
/** Sub-keys DESCENDING by numeric prefix, the plain key BEFORE its `e` twin (5etools walks 9 down to 1, plain then
 *  each; the shipped SRD 2024 prose prints `2/Day Each:` before `1/Day Each:`). */
function sortedKeys(record: Record<string, unknown>): string[] {
  return Object.keys(record).sort((a, b) => {
    const na = parseInt(a, 10), nb = parseInt(b, 10);
    if (na !== nb) return nb - na;
    return (a.endsWith("e") ? 1 : 0) - (b.endsWith("e") ? 1 : 0);
  });
}
function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"], v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}

export function spellcastingLines(block: MonsterSpellcasting): string[] {
  // 5etools' meaning of `hidden`: the block's own `headerEntries` already names those spells in prose; measured 169 of
  // 170 groups, the 170th covered by a "any cleric spell" header. An entry of `hidden` names a frequency GROUP, or
  // `spells` (which omits the whole slot table); a `{ entry, hidden: true }` spell is omitted the same way.
  // Each of the three is `Array.isArray`-guarded for the same reason `spellsOf` is: the cast into this function makes
  // the declared element types a compile-time claim only, `lair_actions` / `regional_actions` / `variant` are
  // `z.array(z.unknown())` in the schema, and the render path is synchronous with no `createErrorBlock` boundary.
  const hidden = new Set(Array.isArray(block.hidden) ? block.hidden : []);
  const lines: string[] = Array.isArray(block.headerEntries) ? [...block.headerEntries] : [];
  for (const group of GROUP_ORDER) {
    if (hidden.has(group)) continue;
    const label = SPELLCASTING_LABELS[group];
    if (group === "will" || group === "ritual") {
      const s = spellsOf(group === "will" ? block.will : block.ritual); if (s) lines.push(`${label.plain} ${s}`);
      continue;
    }
    if (group === "recharge") {
      for (const k of sortedKeys(block.recharge ?? {})) {
        const s = spellsOf(block.recharge![k]); if (!s) continue;
        lines.push(`${(k === "6" ? label.six ?? label.plain : label.plain).replace("N", k)} ${s}`);
      }
      continue;
    }
    const record = block[group as "daily" | "rest" | "restLong" | "legendary" | "charges"] ?? {};
    for (const k of sortedKeys(record)) {
      const s = spellsOf(record[k]); if (!s) continue;
      const text = (k.endsWith("e") ? label.each ?? label.plain : label.plain).replace("N", String(parseInt(k, 10)));
      lines.push(group === "charges" ? `${text}${block.chargesItem ? ` (${block.chargesItem})` : ""}: ${s}` : `${text} ${s}`);
    }
  }
  if (!hidden.has("spells") && block.spells) {
    // Only a key that round-trips through `Number` names a slot level, and a level is read only once its `spells`
    // array is confirmed: a malformed `spells` record is SKIPPED, never dereferenced (same cast, same reason).
    const levelKeys = Object.keys(block.spells).filter((k) => String(Number(k)) === k).sort((a, b) => Number(a) - Number(b));
    for (const key of levelKeys) {
      const level = block.spells[key];
      if (!level || !Array.isArray(level.spells)) continue;
      const lvl = Number(key);
      const s = level.spells.join(", "); if (!s) continue;
      if (lvl === 0) { lines.push(`Cantrips (At Will): ${s}`); continue; }
      const slots = level.slots !== undefined
        ? (level.lower !== undefined ? `${level.slots} ${ordinal(level.lower)}-Level Slots` : `${level.slots} Slots`)
        : undefined;
      lines.push(`${ordinal(lvl)} Level${slots ? ` (${slots})` : ""}: ${s}`);
    }
  }
  if (Array.isArray(block.footerEntries)) lines.push(...block.footerEntries);
  return lines;
}

// ---------------------------------------------------------------------------------------------------------------
// 5etools entry trees (§8.3)
// ---------------------------------------------------------------------------------------------------------------
type Node = Record<string, unknown>;

function inline(v: unknown): string {
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return v.map(inline).filter(Boolean).join(" ");
  if (v && typeof v === "object") {
    const n = v as Node;
    const parts: string[] = [];
    if (typeof n.name === "string") parts.push(`**${n.name}.**`);
    if (n.entry !== undefined) parts.push(inline(n.entry));
    if (n.entries !== undefined) parts.push(inline(n.entries));
    if (n.items !== undefined) parts.push(inline(n.items));
    return parts.join(" ");
  }
  return v === undefined || v === null ? "" : String(v);
}

function blocksOf(v: unknown): string[] {
  if (typeof v === "string") return [v];
  if (Array.isArray(v)) return v.flatMap(blocksOf);
  if (!v || typeof v !== "object") return [];
  const n = v as Node;
  const type = typeof n.type === "string" ? n.type : "entries";           // an untyped node is an `entries` node
  switch (type) {
    case "entries": case "section": {
      const body = blocksOf(n.entries);
      if (typeof n.name === "string" && body.length > 0) body[0] = `**${n.name}.** ${body[0]}`;
      else if (typeof n.name === "string") body.push(`**${n.name}.**`);
      return body;
    }
    case "list": {
      const items = Array.isArray(n.items) ? n.items : [];
      return [items.map((it) => `- ${inline(it)}`).join("\n")];
    }
    case "item": return [inline(n)];
    case "table": {
      const out: string[] = [];
      if (typeof n.caption === "string") out.push(`**${n.caption}**`);
      const cols = Array.isArray(n.colLabels) ? n.colLabels.map(inline) : [];
      const rows = Array.isArray(n.rows) ? n.rows : [];
      const table = [`| ${cols.join(" | ")} |`, `| ${cols.map(() => "---").join(" | ")} |`];
      for (const r of rows) table.push(`| ${(Array.isArray(r) ? r : [r]).map(inline).join(" | ")} |`);
      out.push(table.join("\n"));
      return out;
    }
    case "inset": case "variant": case "variantInner": case "variantSub": {
      const body = blocksOf(n.entries).map((b) => b.split("\n").map((l) => `> ${l}`).join("\n"));
      const head = typeof n.name === "string" ? [`> **${n.name}**`] : [];
      return [[...head, ...body].join("\n>\n")];
    }
    case "spellcasting": return [spellcastingLines(n as unknown as MonsterSpellcasting).join("\n")];
    default: return [...blocksOf(n.entries), ...blocksOf(n.items), ...blocksOf(n.entry)];
  }
}

/** The measured node vocabulary to markdown; never throws; an unknown type recurses into its children only. */
export function entriesToMarkdown(tree: unknown): string {
  return blocksOf(tree).filter((b) => b.length > 0).join("\n\n");
}
