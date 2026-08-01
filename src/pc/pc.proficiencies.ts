import type { ResolvedCharacter } from "./pc.types";
import {
  collectChosenProficiencies,
  computeEffectiveProficiencies,
} from "./pc.decision-engine";
import { humanizeProficiency, toProfSlug } from "./pc.proficiency-normalize";
import {
  collectProficiencyGrants,
  type ProficiencyEntry,
  type ProficiencyGrant,
} from "./pc.proficiency-grants";

/** Re-exported for the plugin: both types are DECLARED in the leaf so that
 *  pc.decision-engine can reference them without importing this module, which
 *  would close a cycle (spec §4.3). */
export type { ProficiencyEntry, ProficiencyOrigin } from "./pc.proficiency-grants";

/** Every bucket carries provenance (spec §7.1). `languages`/`tools` ARE
 *  {@link computeEffectiveProficiencies}' output, unmodified · `armor`/`weapons`
 *  are composed below from the raw grant walk, because they have no vocabulary
 *  constant to canonicalize against (spec §3.3's second rule). */
export interface ProficiencyAggregate {
  armor: ProficiencyEntry[];
  weapons: ProficiencyEntry[];
  tools: ProficiencyEntry[];
  languages: ProficiencyEntry[];
}

/** Normalized intermediate of every proficiency/language source the DISPLAY path
 *  reads, in one place. Only the class branch is a live proficiency source today
 *  (race/bg/feat `.proficiencies` object fields do not exist on those entities);
 *  race languages, bg tool/lang, and feat grants read their real fields. Chosen
 *  picks come from the single decision walk in pc.decision-engine so display can
 *  never diverge from the persisted picks.
 *
 *  Every grant bucket carries `{value, source}` rather than a bare value: the
 *  walk holds the granting entity and the aggregate needs it to fill
 *  `ProficiencyEntry.sources` for armor and weapons (spec §7.1). The
 *  language/tool grant buckets are still surfaced here for completeness, but
 *  the aggregate no longer reads them · languages and tools come from
 *  computeEffectiveProficiencies, which does its own grant walk so that
 *  suppressions and manual adds can never be skipped by a second composer. */
export interface ProficiencySources {
  classArmor: ProficiencyGrant[];              // ArmorCategory[] · category names
  classWeaponFixed: ProficiencyGrant[];        // WeaponProficiency.fixed · display names (D6 matches via normKey)
  classWeaponCategories: ProficiencyGrant[];
  classToolFixed: ProficiencyGrant[];
  raceLangFixed: ProficiencyGrant[];
  bgToolFixed: ProficiencyGrant[];
  bgLangFixed: ProficiencyGrant[];
  featArmor: ProficiencyGrant[];
  featWeapons: ProficiencyGrant[];
  featTools: ProficiencyGrant[];
  featLanguages: ProficiencyGrant[];
  chosenLanguages: string[];         // from collectChosenProficiencies (flat, per-domain)
  chosenTools: string[];
}

export function collectProficiencySources(resolved: ResolvedCharacter): ProficiencySources {
  const g = collectProficiencyGrants(resolved);
  const chosen = collectChosenProficiencies(resolved);

  return {
    ...g,
    chosenLanguages: chosen.languages,
    chosenTools: chosen.tools,
  };
}

export function aggregateProficiencies(resolved: ResolvedCharacter): ProficiencyAggregate {
  const src = collectProficiencySources(resolved);
  // languages/tools are computeEffectiveProficiencies' output, passed through
  // UNMODIFIED: it already dedupes across spellings, folds decision picks and
  // manual adds in, applies the user's suppressions and sorts by label. Nothing
  // else may compose those two buckets · a second composer is exactly what spec
  // §4.1 exists to eliminate, and it is how the sheet would come to render a
  // suppressed language that the override modal does not.
  const effective = computeEffectiveProficiencies(resolved);

  return {
    // Walk order defines `sources` order (spec §4.1): class before feats, and
    // for weapons the class `fixed` names before the class categories, matching
    // the pre-T8 insertion order exactly.
    armor: composeGrantEntries([src.classArmor, src.featArmor]),
    weapons: composeGrantEntries([src.classWeaponFixed, src.classWeaponCategories, src.featWeapons]),
    tools: effective.tools,
    languages: effective.languages,
  };
}

/** Compose one armor/weapon display bucket from the raw grant walk.
 *
 *  Armor and weapons have NO vocabulary constant, so spec §3.3's SECOND rule
 *  applies: `value` is the raw authored string and `label` is the module-private
 *  {@link prettyName}, byte for byte what the sheet renders today. They are
 *  composed HERE rather than in the grant leaf precisely so `prettyName` can
 *  stay unexported (spec §7.1, fence F8).
 *
 *  DEDUPE is keyed on `toProfSlug`, not on the raw value. The pre-T8 bucket was
 *  a `Set<prettyName(raw)>`, and prettyName is `humanizeProficiency(toProfSlug(raw))`,
 *  so slug-keying reproduces the shipped collapse exactly: a Fighter/Paladin
 *  double grant of `heavy` stays ONE row, and two spellings of one category
 *  ("hand crossbows" / "hand-crossbows") do not split into two.
 *
 *  SORT is by label, because the pre-T8 bucket returned `[...set].sort()` over
 *  the display strings. Dropping it is a visible regression on a single-class
 *  sheet: the 2014 Fighter authors `armor: [shield, light, medium, heavy]` and
 *  renders "Heavy, Light, Medium, Shield". `<`/`>` on strings is the same
 *  UTF-16 code-unit comparison the default `sort()` used. */
function composeGrantEntries(buckets: ProficiencyGrant[][]): ProficiencyEntry[] {
  const byKey = new Map<string, ProficiencyEntry>();
  for (const bucket of buckets) {
    for (const g of bucket) {
      const key = toProfSlug(g.value);
      const existing = byKey.get(key);
      if (!existing) {
        byKey.set(key, {
          value: g.value, label: prettyName(g.value), sources: [g.source], origin: "grant",
        });
        continue;
      }
      // Same category from more than one entity: keep every granting name, in
      // walk order (spec §7.2's list semantics, applied to armor/weapons).
      if (!existing.sources.includes(g.source)) existing.sources.push(g.source);
    }
  }
  return [...byKey.values()].sort((a, b) => (a.label < b.label ? -1 : a.label > b.label ? 1 : 0));
}

/** Display string for one proficiency, from EITHER a 2024 slug ("thieves'-tools")
 *  or 2014 prose ("Thieves’ tools"). The COMPOSITION is the fix: toProfSlug folds
 *  U+2019 to ASCII and collapses whitespace, so the two spellings land on one
 *  string and the sheet renders one row instead of two. humanizeProficiency alone
 *  fixes the casing and leaves the duplicate row standing.
 *
 *  `_` is PRESERVED deliberately: this splits on `-` only, matching the plugin's
 *  humanizeSlug, where the pre-R4-P3a body here split on `[-_]`. That matters
 *  because underscore is live slug vocabulary in this engine (edition-namespaced
 *  entity slugs like "srd-2024_magic-initiate", see `resolveEntityRef` at
 *  pc.decision-engine.ts:274-276 · :233 is `matchPool` and never named one),
 *  so routing an entity slug through here now yields "A_b" where it once gave
 *  "A B". Safe today: 0 of the 50 distinct values that can reach this function
 *  contain `_`, counted over every fixed grant read at :116-128, every
 *  language/tool select-proficiency `from` pool in runtime data, and the
 *  ALL_LANGUAGES fallback · 7 of those 50 change output. Re-derive that census
 *  before widening what feeds this. */
function prettyName(slug: string): string {
  return humanizeProficiency(toProfSlug(slug));
}
