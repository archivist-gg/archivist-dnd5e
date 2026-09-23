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
 *   4. else, for a healing or temporary-hit-point spell that does not roll on a table (`miscTags` RO), the first
 *      `{@dice}` dice expression in the spell's OWN prose, a string directly in `entries` (XPHB False Life
 *      `2d4 + 4`, Regenerate `4d8 + 15`); a roll inside one named option is that option's (2014 Enhance Ability's
 *      Bear's Endurance `2d6`), and a table-rolling spell's dice pick a row (XPHB Reincarnate's species `1d10`).
 * In rules 3 and 4, a `table` or `list` whose rows / items give DIFFERENT rolls is a menu of variants, not the
 * spell's roll (2014 Animate Objects' size table), while one that gives the same roll throughout is (Prismatic
 * Spray's rays, `12d6`). Genuine damage in a named block stays the spell's (the Teleport mishap `3d10`).
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

interface RollCandidate { value: string; container: number | null; topLevel: boolean }

/**
 * Every dice-expression `{@<tag>}` in `entries`, in document order (the key order `JSON.stringify` walks), with the
 * innermost `table` / `list` it sits in and whether it is a string directly in `entries` (the spell's own prose). A
 * candidate inside a container whose candidates are not all the same roll is dropped: that container is a menu.
 */
function rollCandidates(entries: unknown, tag: string): RollCandidate[] {
  const found: RollCandidate[] = [];
  let nextContainer = 0;
  const re = new RegExp(`\\{@${tag}\\s+([^}]+)\\}`, "g");
  const walk = (node: unknown, container: number | null, depth: number): void => {
    if (typeof node === "string") {
      for (const m of node.matchAll(re)) {
        const value = m[1].split("|")[0].trim();
        if (isRoll(value)) found.push({ value: normalize(value), container, topLevel: depth === 0 });
      }
      return;
    }
    if (Array.isArray(node)) {
      for (const el of node) walk(el, container, depth);
      return;
    }
    if (node && typeof node === "object") {
      const obj = node as Record<string, unknown>;
      const menuKey = obj.type === "table" ? "rows" : obj.type === "list" ? "items" : null;
      const id = menuKey ? nextContainer++ : null;
      for (const [k, v] of Object.entries(obj)) {
        if (k === "type") continue;
        walk(v, k === menuKey ? id : container, depth + 1);
      }
    }
  };
  walk(entries ?? [], null, 0);
  const valuesIn = new Map<number, Set<string>>();
  for (const c of found) if (c.container !== null) (valuesIn.get(c.container) ?? valuesIn.set(c.container, new Set()).get(c.container)!).add(c.value);
  return found.filter((c) => c.container === null || valuesIn.get(c.container)!.size === 1);
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
  const rollsOnTable = tags.includes("RO");

  // 2. the base of the first scale tag (entries + entriesHigherLevel, the converter's scan)
  const scaleJson = JSON.stringify({ entries: structured.entries ?? [], entriesHigherLevel: structured.entriesHigherLevel ?? [] });
  const scaleTag = tagValues(scaleJson, "scaledamage")[0] ?? ((damages || heals) ? tagValues(scaleJson, "scaledice")[0] : undefined);
  if (scaleTag !== undefined) {
    const roll = fromScaleTag(scaleTag, structured.entries);
    if (roll) return roll;
  }

  // 3. the first {@damage} dice expression in the entries (never one row of a menu)
  const damage = rollCandidates(structured.entries, "damage")[0];
  if (damage) return damage.value;

  // 4. a healing / temporary-hit-point spell's first {@dice} roll in its own prose
  if (heals && !rollsOnTable) {
    const dice = rollCandidates(structured.entries, "dice").find((c) => c.topLevel);
    if (dice) return dice.value;
  }
  return null;
}
