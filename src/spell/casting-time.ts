/**
 * The ONE reader of a spell's `casting_time` string. Every consumer (the plugin's compact Cast-table label,
 * the add-drawer's filter bucket and its sort rank) goes through here, so a spelling that one of them
 * understands the others understand too. Before this, each kept its own exact-string switch over the bundle's
 * spellings (`action`, `bonus-action`, `1minute`), and they drifted: a converted or AI-generated spell's
 * `1 action` / `10 minute` printed raw in the Cast table, and every vault spell spelled `bonus action`,
 * `1 minute` or `1 hour` filtered as "special".
 *
 * The LEADING token decides. Prose after it (a reaction's trigger, Plant Growth's "or 8 hours") is left for
 * the caller's tooltip and never matched, and the trailing word boundary stops a word that merely starts with
 * a unit (`reactionary`, `bonuses`, `minuteman`) from reading as one. A count is optional and only meaningful
 * for minutes and hours; `bonus` may drop the word `action`, which hand-authored spells do.
 */
export type CastingTimeKind = "action" | "bonus" | "reaction" | "time";

export interface ParsedCastingTime {
  kind: CastingTimeKind;
  /** 1 for the action economy; the stated number of minutes / hours for `time` (1 when omitted). */
  count: number;
  /** Present only for `time`. */
  unit?: "minute" | "hour";
}

export function parseCastingTime(token: string | undefined): ParsedCastingTime | null {
  const t = token?.trim() ?? "";
  if (!t) return null;
  if (/^(?:1\s*)?reaction\b/i.test(t)) return { kind: "reaction", count: 1 };
  if (/^(?:1\s*)?bonus(?:[\s-]*action)?\b/i.test(t)) return { kind: "bonus", count: 1 };
  if (/^(?:1\s*)?action\b/i.test(t)) return { kind: "action", count: 1 };
  const m = /^(\d+)?[\s-]*(minute|min|hour|hr)s?\b/i.exec(t);
  if (m) return { kind: "time", count: m[1] ? Number(m[1]) : 1, unit: /^h/i.test(m[2]) ? "hour" : "minute" };
  return null;
}
