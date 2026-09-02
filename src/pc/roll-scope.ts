/**
 * R4-G3a §6.2.3 · `normalizeRollScope`: prose `roll-modifier.scope` → canonical scope value(s).
 *
 * `RollModifierEntry.scope` is documented "skill slug or ability key", but the converter writes
 * whatever the source prose said. Measured over the 152 check/save sites that fold: 68 absent, 4
 * already canonical, 80 PROSE, of which 53 % rendered NO chip anywhere, because the readers
 * compare `scope` to a slug or an ability key literally.
 *
 * The mapping is DETERMINISTIC and vocabulary-driven, never a private table:
 *   - strip the generic roll NOUNS ("saving throws", "checks", "ability checks", "attack rolls")
 *     and the leading QUANTIFIERS ("all", "any", "other", "the next", "you make");
 *   - split on comma / slash / "and" / "or" into parts;
 *   - per part: the `"Ability (Skill)"` pattern keeps the SKILL; then a skill slug (from
 *     ALL_SKILL_SLUGS) wins, else an ability name or key (via normalizeAbility, moved to
 *     dnd/constants.ts in this same task so there is exactly one copy).
 *
 * Anything else → `undefined`, which the fold reads as PASS-THROUGH: the raw scope stays on the
 * entry and matches no chip, exactly as today. That is the deliberate no-behaviour-change answer
 * for the 35 residual strings the grammar cannot express ("saving throws against spells",
 * "Initiative rolls", "… to maintain Concentration"); they are a G7 handoff, not a guess here.
 *
 * FAN-OUT BOUND: more than 3 parts is not a scope we map, so it returns `undefined` too. The rule
 * is "a list this long is prose, not an enumeration": the measured maximum over the corpus is 3
 * ("Intelligence, Wisdom, Charisma"), so the bound costs nothing and caps what one effect can
 * multiply into at the fold.
 *
 * `_roll` is accepted and unused in v1: the vocabulary is the same for checks and saves (a skill
 * scope on a save simply matches no save chip), and the parameter is here so a later rule set can
 * discriminate without changing every call site.
 */
import { ALL_SKILL_SLUGS } from "../types/choice";
import { normalizeAbility } from "../dnd/constants";
import type { RollKind } from "./pc.types";

const NOUNS = /\b(saving throws?|saves?|ability checks?|checks?|attack rolls?)\b/gi;
const QUANTIFIERS = /\b(all|any|other|the next|you make|that you make)\b/gi;
const slug = (s: string) => s.toLowerCase().trim().replace(/[^a-z]+/g, "-").replace(/(^-|-$)/g, "");

export function normalizeRollScope(raw: string | undefined, _roll: RollKind): string[] | undefined {
  if (raw == null) return undefined;
  const cleaned = raw.replace(NOUNS, " ").replace(QUANTIFIERS, " ").replace(/\s+/g, " ").trim();
  const parts = cleaned.split(/\s*(?:,|\/|\band\b|\bor\b)\s*/i).map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0 || parts.length > 3) return undefined;
  const out: string[] = [];
  for (let p of parts) {
    const m = p.match(/^(?:[a-z]+\s*)?\(\s*([a-z -]+)\s*\)$/i);
    if (m) p = m[1];
    const s = slug(p);
    if ((ALL_SKILL_SLUGS as readonly string[]).includes(s)) { out.push(s); continue; }
    const ab = normalizeAbility(p);
    if (ab) { out.push(ab); continue; }
    return undefined;
  }
  return out;
}
