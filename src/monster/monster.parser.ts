import type { Monster } from "./monster.types";
import type { FeatureRecharge } from "../types";
import type { ParseResult } from "@archivist-gg/core";
import { parseYaml } from "@archivist-gg/core";
import { monsterSchema, MONSTER_KNOWN_KEYS } from "./monster.schema";

/** The four recharge kinds. Pinned by the converter's AST guard as a literal `new Set([...])` in THIS file. */
const VALID_RECHARGE_TYPES: ReadonlySet<FeatureRecharge["type"]> = new Set([
  "recharge_on_roll",
  "per_day",
  "per_short_rest",
  "per_long_rest",
]);

const NUMERIC_STRING = /^[+-]?\d+(\.\d+)?$/;
const FEATURE_ARRAYS = ["traits", "actions", "reactions", "legendary_actions", "bonus_actions", "mythic"] as const;
const SPEED_MODES = ["walk", "fly", "swim", "climb", "burrow"] as const;
const ABILITY_KEYS = ["str", "dex", "con", "int", "wis", "cha"] as const;
const NULL_KEPT = new Set(["senses", "languages", "group"]);

function isRecord(v: unknown): v is Record<string, unknown> { return typeof v === "object" && v !== null && !Array.isArray(v); }

/** A numeric STRING becomes the number (the hand parser's `Number()`); anything else is left for the schema to judge. */
function coerceNumeric(obj: Record<string, unknown>, key: string): void {
  const v = obj[key];
  if (typeof v === "string" && NUMERIC_STRING.test(v.trim())) obj[key] = Number(v);
}

/** Step 9: delete every `null` anywhere in the tree (a bare `key:` in hand-authored YAML), except the three top-level
 *  converter-emitted nullables; a null array element is removed. */
function scrubNulls(v: unknown, top: boolean): void {
  if (Array.isArray(v)) {
    for (let i = v.length - 1; i >= 0; i--) { if (v[i] === null) v.splice(i, 1); else scrubNulls(v[i], false); }
    return;
  }
  if (!isRecord(v)) return;
  for (const [k, x] of Object.entries(v)) {
    if (x === null) { if (!(top && NULL_KEPT.has(k))) delete v[k]; }
    else scrubNulls(x, false);
  }
}

/** Step 5: delete every non-finite number anywhere in the tree (today's edit path writes `.nan` onto 400 notes). */
function scrubNonFinite(v: unknown): void {
  if (Array.isArray(v)) { for (const x of v) scrubNonFinite(x); return; }
  if (!isRecord(v)) return;
  for (const [k, x] of Object.entries(v)) {
    if (typeof x === "number" && !Number.isFinite(x)) delete v[k];
    else scrubNonFinite(x);
  }
}

/**
 * R4-G6 §4.1 · the hand parser's tolerances made explicit, BEFORE `safeParse`. Each step rewrites only a shape the
 * old parser already rewrote, coerced or dropped; the converter corpora are untouched by it (0 / 0 / 0 measured).
 */
export function migrateLegacy(raw: Record<string, unknown>): void {
  // 9 · a null ANYWHERE in the tree is deleted (a bare `key:`; a null array element is removed), except the three
  //     converter-emitted top-level nullables. Runs FIRST: the `?? 10` fill (step 6) must see the deletion.
  scrubNulls(raw, true);
  // 1 · the legacy `legendary` alias and the numeric `legendary_actions`
  if (raw.legendary_actions != null && !Array.isArray(raw.legendary_actions) && typeof raw.legendary_actions !== "object") {
    if (raw.legendary_action_uses == null) raw.legendary_action_uses = Number(raw.legendary_actions);
    delete raw.legendary_actions;
  }
  if (!Array.isArray(raw.legendary_actions) && Array.isArray(raw.legendary)) raw.legendary_actions = raw.legendary;
  delete raw.legendary;
  // 2 · scalar ac / hp; an ac of numbers
  if (typeof raw.ac === "number") raw.ac = [{ ac: raw.ac }];
  if (Array.isArray(raw.ac)) raw.ac = raw.ac.map((e) => (typeof e === "number" ? { ac: e } : e));
  if (typeof raw.hp === "number") raw.hp = { average: raw.hp };
  // 3 · a numeric cr
  if (typeof raw.cr === "number") raw.cr = String(raw.cr);
  // 4 · numeric strings on the named leaves
  for (const k of ["passive_perception", "legendary_action_uses", "legendary_resistance", "columns", "initiative"]) coerceNumeric(raw, k);
  if (isRecord(raw.initiative)) coerceNumeric(raw.initiative, "proficiency");
  for (const k of ["saves", "skills"]) { const o = raw[k]; if (isRecord(o)) for (const m of Object.keys(o)) coerceNumeric(o, m); }
  if (isRecord(raw.hp)) coerceNumeric(raw.hp, "average");
  if (Array.isArray(raw.ac)) for (const e of raw.ac) if (isRecord(e)) coerceNumeric(e, "ac");
  if (isRecord(raw.abilities)) for (const k of ABILITY_KEYS) coerceNumeric(raw.abilities, k);
  if (isRecord(raw.speed)) for (const k of SPEED_MODES) { coerceNumeric(raw.speed, k); const v = raw.speed[k]; if (isRecord(v)) coerceNumeric(v, "number"); }
  // 5 · the generic non-finite scrub
  scrubNonFinite(raw);
  // 6 · a missing ability score is 10
  if (isRecord(raw.abilities)) for (const k of ABILITY_KEYS) if (raw.abilities[k] == null) raw.abilities[k] = 10;
  // 7 · a bare senses / languages string
  if (typeof raw.senses === "string") raw.senses = [raw.senses];
  if (typeof raw.languages === "string") raw.languages = [raw.languages];
  // 8 · feature `desc` and a malformed recharge
  for (const k of FEATURE_ARRAYS) {
    const arr = raw[k];
    if (!Array.isArray(arr)) continue;
    for (const f of arr) {
      if (!isRecord(f)) continue;
      if (typeof f.desc === "string" && f.description === undefined && !Array.isArray(f.entries)) { f.description = f.desc; delete f.desc; }
      const r = f.recharge;
      if (r !== undefined && !(isRecord(r) && typeof r.param === "number" && VALID_RECHARGE_TYPES.has(r.type as FeatureRecharge["type"]))) delete f.recharge;
    }
  }
}

export function parseMonster(source: string): ParseResult<Monster> {
  const result = parseYaml<Record<string, unknown>>(source, ["name"]);
  if (!result.success) return result;
  const raw = result.data;
  migrateLegacy(raw);

  const parsed = monsterSchema.safeParse(raw);
  if (!parsed.success) {
    return { success: false, error: `monster schema validation failed: ${parsed.error.message}` };
  }
  const monster = parsed.data as Monster;

  // R4-G6 §3.3 · an undeclared TOP-LEVEL key relocates to `raw` (never stripped; the census says `relocated-to-raw`).
  const extras: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) if (!MONSTER_KNOWN_KEYS.has(k)) extras[k] = v;
  if (Object.keys(extras).length > 0) monster.raw = { ...(monster.raw ?? {}), ...extras };

  // Extract Legendary Resistance count from traits if not explicitly set (contract B3, unchanged).
  // SRD data stores it as a trait named "Legendary Resistance (3/Day)" rather than a separate numeric field.
  if (!monster.legendary_resistance && monster.traits) {
    const lrIndex = monster.traits.findIndex((t) => /^Legendary Resistance\s*\(/i.test(t.name ?? ""));
    if (lrIndex !== -1) {
      const match = monster.traits[lrIndex].name?.match(/\((\d+)\/Day\)/i);
      if (match) {
        monster.legendary_resistance = parseInt(match[1], 10);
        monster.traits.splice(lrIndex, 1);
      }
    }
  }

  return { success: true, data: monster };
}
