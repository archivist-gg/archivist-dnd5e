/** Read a numeric value from a (sub)class table column at a given level, trying
 *  each candidate key in order. Returns null when absent or non-numeric. Shared
 *  by spellcasting (Cantrips/Spells Known) and the pool engine (pick counts). */
export function readTableColumn(
  table: Record<number, { columns?: Record<string, string | number> }> | undefined,
  level: number,
  keys: string[],
): number | null {
  const cols = table?.[level]?.columns;
  if (!cols) return null;
  for (const k of keys) {
    const raw = cols[k];
    if (raw === undefined || raw === null) continue;
    const n = typeof raw === "number" ? raw : parseInt(String(raw), 10);
    if (!Number.isNaN(n)) return n;
  }
  return null;
}

/** All numeric columns of a (sub)class table row at `level`, keyed by column
 *  name. Non-numeric / missing cells are omitted. Backs `column('Name')` in the
 *  resource max-formula DSL. */
export function numericColumnsAt(
  table: Record<number, { columns?: Record<string, string | number> }> | undefined,
  level: number,
): Record<string, number> {
  const out: Record<string, number> = {};
  const cols = table?.[level]?.columns;
  if (!cols) return out;
  for (const [k, raw] of Object.entries(cols)) {
    if (raw === undefined || raw === null) continue;
    const n = typeof raw === "number" ? raw : parseInt(String(raw), 10);
    if (!Number.isNaN(n)) out[k] = n;
  }
  return out;
}

/** Class-table COLUMN names per `select-entity` choice id (R4-G5 §6.2, invariant 3): the DATA route that makes a
 *  levelled pick count GROW. MEASURED 2026-09-07 on both corpora: the Fighter 2024's `weapon-mastery` choice
 *  authors `count: 3` at levels 1 / 4 / 10 / 16 while the class table's "Weapon Mastery" column reads
 *  3 / 4 / 5 / 6 (byte-identical between the converter document and the SRD 2024 bundle record); the Barbarian
 *  2024's column reads 2 / 3 / 4 against an authored 2; Paladin / Ranger / Rogue 2024 carry `count: 2` and NO
 *  column, which is the correct RAW count. Read only INSIDE dnd5e (`buildDecisionLedger`). G7 handoff: the
 *  converter emits `count.column` on the choice itself and this table retires. */
export const COUNT_COLUMNS: Readonly<Record<string, string[]>> = {
  "weapon-mastery": ["Weapon Mastery"],
};

/** The column keys for a choice id, by OWN-property lookup (`derivePoolLayout`'s precedent, invariant 3). The
 *  guard is LOAD-BEARING, not defensive: `readTableColumn` above iterates its `keys` with `for ... of`, so a
 *  plain index on a choice id of `constructor` hands it the Object constructor FUNCTION and THROWS while the
 *  ledger is being built. Returns undefined for every id the table does not own. */
export function countColumnsFor(choiceId: string): string[] | undefined {
  if (!Object.prototype.hasOwnProperty.call(COUNT_COLUMNS, choiceId)) return undefined;
  return COUNT_COLUMNS[choiceId];
}
