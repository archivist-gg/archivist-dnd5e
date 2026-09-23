/**
 * A spell's BASE roll (`damage_roll`) read from its structured-rules (5etools) record: the DAMAGE or
 * HEALING roll at the spell's own level, or a cantrip's tier-1 roll. `spell-merge.ts` prefers it over
 * Open5e v2's own top-level `damage_roll`, which is looser ("the first dice in the text": 2024 Teleport
 * `1d100`, Prismatic Spray `1d8`, Bless `1d4`) and EMPTY on many 2014 spells (Magic Missile, Cure
 * Wounds, Acid Splash).
 *
 * The rules mirror the converter's (`archivist-import-5etools/scripts/lib/spell-mapper.ts`,
 * `mapBaseDamageRoll`) so an SRD document and a converted one agree on the same spell:
 *   1. a cantrip's `scalingLevelDice` tier `"1"` (several objects join with " / ", like the tiers);
 *   2. else the BASE of the first `{@scaledamage}` tag, else of the first `{@scaledice}` tag when the
 *      spell deals damage (`damageInflict`) or heals (`miscTags` HL / THP), so Sleep's and Color
 *      Spray's hit-point pools stay out; with the converter's stale-base guard (a base whose die
 *      differs from the increment's yields to the entries' `{@damage}` roll on the increment's die:
 *      XPHB Ice Storm `2d8|4-9|1d10` → `2d10`);
 *   3. else the first `{@damage}` tag in `entries` that is a dice expression (`1d4 + 1`, `7d8 + 30`);
 *   4. else, for a healing or temporary-hit-point spell, the first `{@dice}` dice expression
 *      (XPHB False Life `2d4 + 4`, Regenerate `4d8 + 15`).
 * A value with no die (`70`, a flat heal; `0`, Booming Blade's tier 1) is never a roll.
 */

/** A dice expression: dice or flat terms joined by `+` (or `;` between components), at least one die. */
const DICE_EXPR = /^\s*(\d+d\d+|\d+)(\s*[+;]\s*(\d+d\d+|\d+))*\s*$/;
const HAS_DIE = /\d+d\d+/;

export function isRoll(value: string): boolean {
  return DICE_EXPR.test(value) && HAS_DIE.test(value);
}

/** The converter's reassembly: components joined by " + ", components groups by "; ". */
function normalize(value: string): string {
  return value
    .split(";")
    .map((group) => group.split("+").map((t) => t.trim()).join(" + "))
    .join("; ");
}

function dieOf(term: string): string | null {
  const m = term.match(/(\d+)d(\d+)/);
  return m ? `d${m[2]}` : null;
}

function tagValues(json: string, tag: string): string[] {
  const re = new RegExp(`\\{@${tag}\\s+([^}]+)\\}`, "g");
  return [...json.matchAll(re)].map((m) => m[1].trim());
}

/** Plain dice rolls of the `{@damage}` tags in `entries` (the stale-base guard's candidates). */
function entriesDamageRolls(entries: unknown): string[] {
  return tagValues(JSON.stringify(entries ?? ""), "damage")
    .map((v) => v.split("|")[0].trim())
    .filter((v) => /^\d+d\d+$/.test(v));
}

function fromScaleTag(tag: string, entries: unknown): string | null {
  const [baseRaw = "", , inc = ""] = tag.split("|").map((s) => s.trim());
  if (!isRoll(baseRaw)) return null;
  const incDie = dieOf(inc);
  if (incDie !== null && /^\d+d\d+$/.test(inc) && dieOf(baseRaw) !== incDie) {
    const fixed = entriesDamageRolls(entries).find((r) => dieOf(r) === incDie);
    if (fixed) return fixed;
  }
  return normalize(baseRaw);
}

interface StructuredScaling { scaling?: Record<string, string> }

export function baseRollFromStructured(structured: Record<string, unknown> | null | undefined): string | null {
  if (!structured) return null;

  // 1. cantrip tier 1
  if ((structured.level ?? 0) === 0 && structured.scalingLevelDice != null) {
    const raw = structured.scalingLevelDice as StructuredScaling | StructuredScaling[];
    const objs = Array.isArray(raw) ? raw : [raw];
    const parts = objs
      .map((o) => o?.scaling?.["1"])
      .filter((v): v is string => typeof v === "string")
      .map((v) => v.replace(/\{\{spellcasting_mod\}\}/g, "your spellcasting ability modifier").trim());
    if (parts.length > 0 && parts.every(isRoll)) return parts.map(normalize).join(" / ");
  }

  const damages = Array.isArray(structured.damageInflict) && structured.damageInflict.length > 0;
  const tags = Array.isArray(structured.miscTags) ? (structured.miscTags as unknown[]) : [];
  const heals = tags.includes("HL") || tags.includes("THP");

  // 2. the base of the first scale tag (entries + entriesHigherLevel, the converter's scan)
  const scaleJson = JSON.stringify({ entries: structured.entries ?? [], entriesHigherLevel: structured.entriesHigherLevel ?? [] });
  const scaleTag = tagValues(scaleJson, "scaledamage")[0] ?? ((damages || heals) ? tagValues(scaleJson, "scaledice")[0] : undefined);
  if (scaleTag !== undefined) {
    const roll = fromScaleTag(scaleTag, structured.entries);
    if (roll) return roll;
  }

  // 3. the first {@damage} dice expression in the entries
  const entriesJson = JSON.stringify(structured.entries ?? "");
  for (const v of tagValues(entriesJson, "damage")) {
    const value = v.split("|")[0].trim();
    if (isRoll(value)) return normalize(value);
  }

  // 4. a healing / temporary-hit-point spell's first {@dice} roll
  if (heals) {
    for (const v of tagValues(entriesJson, "dice")) {
      const value = v.split("|")[0].trim();
      if (isRoll(value)) return normalize(value);
    }
  }
  return null;
}
