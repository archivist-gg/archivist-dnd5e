import type { Ability } from "@archivist-gg/dnd5e";
import type { CharacterOverrides, KnownSpellEntry, ResolvedClass } from "./pc.types";
import { abilityModifier } from "@archivist-gg/dnd5e/dnd/math";
import type { CasterType } from "@archivist-gg/dnd5e/class/class.types";
import { bareSlug } from "@archivist-gg/dnd5e/class/class.slug";
import { readTableColumn } from "./pc.table-column";

export interface SpellcastingProfile {
  ability: Ability;
  casterType: CasterType;
  preparation: "known" | "prepared";
  spellList: string;
  table: Record<number, { columns?: Record<string, string | number> }>;
}

/**
 * Data-driven spellcasting profile for a resolved class. Reads the subclass
 * block if the subclass grants casting (e.g. Architect of Ruin), else the class
 * block. Known/cantrip columns come from whichever entity grants casting
 * (subclass table preferred, falling back to the class table). Returns null for
 * non-casters. No hardcoded class knowledge — everything comes from the data.
 */
export function resolveSpellcasting(rc: ResolvedClass): SpellcastingProfile | null {
  const sub = rc.subclass?.spellcasting ?? null;
  const cls = rc.entity?.spellcasting ?? null;
  const sc = sub ?? cls;
  if (!sc) return null;
  const table = (sub ? rc.subclass?.table : rc.entity?.table) ?? rc.entity?.table ?? {};
  return {
    ability: sc.ability,
    casterType: sc.caster_type,
    preparation: sc.preparation,
    spellList: sc.spell_list,
    table,
  };
}

/** The ability a class actually casts with: a per-class override wins, else the
 *  data ability from resolveSpellcasting. `dataAbility` is non-nullable by
 *  contract: resolve caster-ness (a non-null SpellcastingProfile) BEFORE calling. */
export function effectiveSpellcastingAbility(
  classSlug: string,
  dataAbility: Ability,
  overrides: CharacterOverrides,
): Ability {
  return overrides.spellcasting_ability_by_class?.[classSlug] ?? dataAbility;
}

export interface NormalizedKnownSpell {
  slug: string;            // bare slug, brackets stripped
  classSlug: string | null;
  source: "class" | "feat" | "item" | "race" | "domain";
  preparedFlag: boolean | undefined; // undefined when entry didn't specify
  alwaysPrepared: boolean;
}

export function normalizeKnownSpell(entry: KnownSpellEntry): NormalizedKnownSpell {
  if (typeof entry === "string") {
    return { slug: bareSlug(entry), classSlug: null, source: "class", preparedFlag: undefined, alwaysPrepared: false };
  }
  return {
    slug: bareSlug(entry.spell),
    classSlug: entry.class ? bareSlug(entry.class) : null,
    source: entry.source ?? "class",
    preparedFlag: entry.prepared,
    alwaysPrepared: entry.always_prepared ?? false,
  };
}

export interface CasterClassInput {
  casterType: CasterType;
  level: number;
}

export interface DerivedSpellSlots {
  /** spell level (1..9) → total slots. Levels with 0 slots are omitted. */
  standard: Record<number, number>;
  /** Warlock Pact Magic, or null. */
  pact: { level: number; total: number } | null;
}

// Standard full-caster / multiclass slot table. Index = caster level (1..20);
// each row is slots for spell levels 1..9. Edition-independent.
const FULL_CASTER_SLOTS: number[][] = [
  /* 1  */ [2, 0, 0, 0, 0, 0, 0, 0, 0],
  /* 2  */ [3, 0, 0, 0, 0, 0, 0, 0, 0],
  /* 3  */ [4, 2, 0, 0, 0, 0, 0, 0, 0],
  /* 4  */ [4, 3, 0, 0, 0, 0, 0, 0, 0],
  /* 5  */ [4, 3, 2, 0, 0, 0, 0, 0, 0],
  /* 6  */ [4, 3, 3, 0, 0, 0, 0, 0, 0],
  /* 7  */ [4, 3, 3, 1, 0, 0, 0, 0, 0],
  /* 8  */ [4, 3, 3, 2, 0, 0, 0, 0, 0],
  /* 9  */ [4, 3, 3, 3, 1, 0, 0, 0, 0],
  /* 10 */ [4, 3, 3, 3, 2, 0, 0, 0, 0],
  /* 11 */ [4, 3, 3, 3, 2, 1, 0, 0, 0],
  /* 12 */ [4, 3, 3, 3, 2, 1, 0, 0, 0],
  /* 13 */ [4, 3, 3, 3, 2, 1, 1, 0, 0],
  /* 14 */ [4, 3, 3, 3, 2, 1, 1, 0, 0],
  /* 15 */ [4, 3, 3, 3, 2, 1, 1, 1, 0],
  /* 16 */ [4, 3, 3, 3, 2, 1, 1, 1, 0],
  /* 17 */ [4, 3, 3, 3, 2, 1, 1, 1, 1],
  /* 18 */ [4, 3, 3, 3, 3, 1, 1, 1, 1],
  /* 19 */ [4, 3, 3, 3, 3, 2, 1, 1, 1],
  /* 20 */ [4, 3, 3, 3, 3, 2, 2, 1, 1],
];

// Single-class half caster (Paladin / Ranger). Index = class level (1..20);
// spell levels 1..5. Edition-independent.
const HALF_CASTER_SLOTS: number[][] = [
  /* 1  */ [0, 0, 0, 0, 0],
  /* 2  */ [2, 0, 0, 0, 0],
  /* 3  */ [3, 0, 0, 0, 0],
  /* 4  */ [3, 0, 0, 0, 0],
  /* 5  */ [4, 2, 0, 0, 0],
  /* 6  */ [4, 2, 0, 0, 0],
  /* 7  */ [4, 3, 0, 0, 0],
  /* 8  */ [4, 3, 0, 0, 0],
  /* 9  */ [4, 3, 2, 0, 0],
  /* 10 */ [4, 3, 2, 0, 0],
  /* 11 */ [4, 3, 3, 0, 0],
  /* 12 */ [4, 3, 3, 0, 0],
  /* 13 */ [4, 3, 3, 1, 0],
  /* 14 */ [4, 3, 3, 1, 0],
  /* 15 */ [4, 3, 3, 2, 0],
  /* 16 */ [4, 3, 3, 2, 0],
  /* 17 */ [4, 3, 3, 3, 1],
  /* 18 */ [4, 3, 3, 3, 1],
  /* 19 */ [4, 3, 3, 3, 2],
  /* 20 */ [4, 3, 3, 3, 2],
];

// Dedicated single-class one-third caster table (Eldritch Knight / Arcane Trickster /
// Architect of Ruin). NOT floor(level/3) of the full table — that is wrong (yields 3
// first-level slots at L7 instead of the correct 4/2). Index = class level (1..20);
// spell levels 1..4.
const THIRD_CASTER_SLOTS: number[][] = [
  /* 1  */ [0, 0, 0, 0],
  /* 2  */ [0, 0, 0, 0],
  /* 3  */ [2, 0, 0, 0],
  /* 4  */ [3, 0, 0, 0],
  /* 5  */ [3, 0, 0, 0],
  /* 6  */ [3, 0, 0, 0],
  /* 7  */ [4, 2, 0, 0],
  /* 8  */ [4, 2, 0, 0],
  /* 9  */ [4, 2, 0, 0],
  /* 10 */ [4, 3, 0, 0],
  /* 11 */ [4, 3, 0, 0],
  /* 12 */ [4, 3, 0, 0],
  /* 13 */ [4, 3, 2, 0],
  /* 14 */ [4, 3, 2, 0],
  /* 15 */ [4, 3, 2, 0],
  /* 16 */ [4, 3, 3, 0],
  /* 17 */ [4, 3, 3, 0],
  /* 18 */ [4, 3, 3, 0],
  /* 19 */ [4, 3, 3, 1],
  /* 20 */ [4, 3, 3, 1],
];

// Warlock Pact Magic: warlock level → { slot level, slot count }.
const PACT_MAGIC: Array<{ level: number; total: number }> = [
  /* 1  */ { level: 1, total: 1 },
  /* 2  */ { level: 1, total: 2 },
  /* 3  */ { level: 2, total: 2 },
  /* 4  */ { level: 2, total: 2 },
  /* 5  */ { level: 3, total: 2 },
  /* 6  */ { level: 3, total: 2 },
  /* 7  */ { level: 4, total: 2 },
  /* 8  */ { level: 4, total: 2 },
  /* 9  */ { level: 5, total: 2 },
  /* 10 */ { level: 5, total: 2 },
  /* 11 */ { level: 5, total: 3 },
  /* 12 */ { level: 5, total: 3 },
  /* 13 */ { level: 5, total: 3 },
  /* 14 */ { level: 5, total: 3 },
  /* 15 */ { level: 5, total: 3 },
  /* 16 */ { level: 5, total: 3 },
  /* 17 */ { level: 5, total: 4 },
  /* 18 */ { level: 5, total: 4 },
  /* 19 */ { level: 5, total: 4 },
  /* 20 */ { level: 5, total: 4 },
];

// R4-G1a D6b: the artificer progression. A COPY of the half-caster rows with the level-1 row replaced (the only row
// that differs: an artificer, and the XPHB Paladin/Ranger, cast at level 1). Never alias HALF_CASTER_SLOTS.
const ARTIFICER_CASTER_SLOTS: number[][] = HALF_CASTER_SLOTS.map((row) => [...row]);
ARTIFICER_CASTER_SLOTS[0] = [2, 0, 0, 0, 0];

type SlotCaster = Exclude<CasterType, "pact">;
/** The single-class slot table for a progression. Exhaustive by construction: an unhandled member is a COMPILE
 *  error at the `never` assignment (a bare switch statement would fall through silently). */
export function slotTableFor(caster: SlotCaster): number[][] {
  switch (caster) {
    case "full": return FULL_CASTER_SLOTS;
    case "half": return HALF_CASTER_SLOTS;
    case "third": return THIRD_CASTER_SLOTS;
    case "artificer": return ARTIFICER_CASTER_SLOTS;
    default: { const _n: never = caster; throw new Error(`unknown caster type ${String(_n)}`); }
  }
}

function rowToRecord(row: number[]): Record<number, number> {
  const out: Record<number, number> = {};
  row.forEach((n, i) => { if (n > 0) out[i + 1] = n; });
  return out;
}

/**
 * Standard spell slots plus Pact Magic for a character's casting classes. A SINGLE regular caster reads its own
 * progression table through `slotTableFor` (the artificer row included: level-1 slots, then the half-caster rows).
 * TWO OR MORE pool into a multiclass caster level, `full + floor(half/2) + floor(third/3) + ceil(artificer/2)` on
 * the SUMS, read off FULL_CASTER_SLOTS. Warlock levels never join that pool: they produce a separate pact entry.
 */
export function deriveSpellSlots(classes: CasterClassInput[]): DerivedSpellSlots {
  let fullLevels = 0, halfLevels = 0, thirdLevels = 0, artificerLevels = 0, warlockLevel = 0;
  const regular: Array<{ caster: SlotCaster; level: number }> = [];
  for (const c of classes) {
    if (c.casterType === "pact") { warlockLevel += c.level; continue; }
    regular.push({ caster: c.casterType, level: c.level });
    switch (c.casterType) {
      case "full": fullLevels += c.level; break;
      case "half": halfLevels += c.level; break;
      case "third": thirdLevels += c.level; break;
      case "artificer": artificerLevels += c.level; break;
      default: { const _n: never = c.casterType; throw new Error(`unknown caster type ${String(_n)}`); }
    }
  }

  let standard: Record<number, number> = {};
  if (regular.length === 1) {
    const only = regular[0];
    const table = slotTableFor(only.caster);
    const idx = only.level - 1;
    if (idx >= 0 && idx < table.length) standard = rowToRecord(table[idx]);
  } else if (regular.length >= 2) {
    // Multiclass caster level: full + floor(half/2) + floor(third/3) + ceil(artificer/2), on the SUMS (TCE and the
    // 2024 rule both round the artificer progression UP).
    const cl = fullLevels + Math.floor(halfLevels / 2) + Math.floor(thirdLevels / 3) + Math.ceil(artificerLevels / 2);
    if (cl >= 1 && cl <= FULL_CASTER_SLOTS.length) standard = rowToRecord(FULL_CASTER_SLOTS[cl - 1]);
  }

  const pact = warlockLevel >= 1 && warlockLevel <= PACT_MAGIC.length ? PACT_MAGIC[warlockLevel - 1] : null;
  return { standard, pact };
}

export interface LimitClassInput {
  classSlug: string;
  level: number;
  profile: SpellcastingProfile;
  /** Ability score for this class's spellcasting ability. */
  abilityScore: number;
}

export interface SpellLimit {
  classSlug: string;
  kind: "known" | "prepared";
  cantripsKnown: number | null;     // null = unknown / not shown
  preparedOrKnown: number | null;
}

/** The converter spells the 2024 column two ways; the bundle uses the first. Serves the PREPARED branch here, and
 *  Task 6's preparation inference in `resolveSpellcasting` (which does not read it yet). The KNOWN branch keeps its
 *  own candidates (the XPHB Sorcerer and Warlock are known casters whose count sits under "Prepared Spells"). */
export const PREPARED_COLUMNS = ["Prepared Spells", "Spells Prepared"];

/** The level term of the prepared-count FALLBACK (used only when no table column supplies the count). Slots round
 *  the artificer progression UP; its prepared count rounds DOWN (TCE: "half your artificer level, rounded down").
 *  `third` is a DELTA from the shipped `else` arm, which used the whole `level`: unreachable until Task 6's XPHB
 *  Arcane Trickster, whose table supplies the count, so no shipped number moves (spec D6c, §8). */
export function preparedLevelTerm(caster: CasterType, level: number): number {
  switch (caster) {
    case "full": case "pact": return level;
    case "half": case "artificer": return Math.floor(level / 2);
    case "third": return Math.floor(level / 3);
    default: { const _n: never = caster; throw new Error(`unknown caster type ${String(_n)}`); }
  }
}

/**
 * Cantrip and prepared/known counts per casting class. The PREPARED count is TABLE-FIRST (R4-G1a D6c): a
 * PREPARED_COLUMNS cell on the class table row wins outright, and only a row without one falls back to the formula
 * `max(1, abilityMod + preparedLevelTerm(casterType, level))`. The KNOWN count is read from the table alone and is
 * null when the row carries no candidate column.
 */
export function computeSpellLimits(inputs: LimitClassInput[]): SpellLimit[] {
  const out: SpellLimit[] = [];
  for (const i of inputs) {
    const p = i.profile;
    const cantripsKnown = readTableColumn(p.table, i.level, ["Cantrips Known", "Cantrips"]);
    const mod = abilityModifier(i.abilityScore);
    let preparedOrKnown: number | null;
    if (p.preparation === "prepared") {
      const fromTable = readTableColumn(p.table, i.level, PREPARED_COLUMNS);
      preparedOrKnown = fromTable !== null ? fromTable : Math.max(1, mod + preparedLevelTerm(p.casterType, i.level));
    } else {
      preparedOrKnown = readTableColumn(p.table, i.level, ["Spells Known", "Prepared Spells"]);
    }
    out.push({ classSlug: i.classSlug, kind: p.preparation, cantripsKnown, preparedOrKnown });
  }
  return out;
}
