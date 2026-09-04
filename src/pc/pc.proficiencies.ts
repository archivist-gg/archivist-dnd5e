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
 *  constant to canonicalize against (spec §3.3's second rule) · and for `weapons`
 *  that grant walk is followed by the chosen `select-entity{weapon}` picks
 *  (R4-G3b §7 F5), which land with origin `pick`. */
export interface ProficiencyAggregate {
  armor: ProficiencyEntry[];
  weapons: ProficiencyEntry[];
  tools: ProficiencyEntry[];
  languages: ProficiencyEntry[];
}

/** Normalized intermediate of every proficiency/language source the DISPLAY path
 *  reads, in one place. Among the ENTITY branches only the class one is a live
 *  proficiency source today (race/bg/feat `.proficiencies` object fields do not
 *  exist on those entities); race languages, bg tool/lang, and feat grants read
 *  their real fields, and the four `effect*` buckets carry what a feature's
 *  `kind: "proficiency"` effects grant · that is the live path a 2014 race trait
 *  actually uses (R4-P3c). Chosen picks come from the single decision walk in
 *  pc.decision-engine so display can never diverge from the persisted picks.
 *
 *  Every grant bucket carries `{value, source}` rather than a bare value: the
 *  walk holds the granting entity and the aggregate needs it to fill
 *  `ProficiencyEntry.sources` for armor and weapons (spec §7.1). The
 *  language/tool grant buckets are still surfaced here for completeness, but
 *  the aggregate no longer reads them · languages and tools come from
 *  computeEffectiveProficiencies, which does its own grant walk so that
 *  suppressions and manual adds can never be skipped by a second composer.
 *
 *  These names are RE-DECLARED by hand rather than inherited: this interface
 *  does not `extends ProficiencyGrants`, so a bucket added to the grant walk
 *  stays invisible here until it is added here too. `collectProficiencySources`
 *  spreads the grants object, so an undeclared bucket still flows at RUNTIME ·
 *  the compiler is the only thing that notices, and only where the field is
 *  read. Nothing iterates these objects with Object.keys/values/entries, so a
 *  declaration gap is inert rather than corrupting; it is still a gap. */
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
  effectArmor: ProficiencyGrant[];             // from `kind: "proficiency"` effects · RAW authored string
  effectWeapons: ProficiencyGrant[];
  effectTools: ProficiencyGrant[];             // ...canonical slug, for the vocabulary matcher
  effectLanguages: ProficiencyGrant[];
  chosenLanguages: string[];         // from collectChosenProficiencies (flat, per-domain)
  chosenTools: string[];
  chosenWeapons: string[];           // from collectChosenProficiencies.weapons (R4-G3b §7 F5: bare weapon slugs)
}

export function collectProficiencySources(resolved: ResolvedCharacter): ProficiencySources {
  const g = collectProficiencyGrants(resolved);
  const chosen = collectChosenProficiencies(resolved);

  return {
    ...g,
    chosenLanguages: chosen.languages,
    chosenTools: chosen.tools,
    chosenWeapons: chosen.weapons,
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
    // the insertion order of the bucket this replaced, exactly.
    //
    // Effect buckets go LAST: first-seen wins the dedupe key, so an existing
    // class or feat grant keeps its shipped spelling and label and the effect
    // only appends its source name. Reordering these silently relabels rows.
    //
    // The chosen weapon PICKS are the second argument, so they are seeded after
    // every grant bucket: a weapon both granted and picked stays ONE row that
    // keeps origin `grant` and its granting source(s) (R4-G3b §7 F5 · the same
    // grants-then-picks order computeEffectiveProficiencies uses for the
    // language and tool buckets). Armor passes none.
    armor: composeGrantEntries([src.classArmor, src.featArmor, src.effectArmor]),
    weapons: composeGrantEntries([src.classWeaponFixed, src.classWeaponCategories, src.featWeapons, src.effectWeapons], src.chosenWeapons),
    tools: effective.tools,
    languages: effective.languages,
  };
}

/** Compose one armor/weapon display bucket from the raw grant walk, plus (weapons
 *  only) the chosen `select-entity{weapon}` picks passed as `picks`.
 *
 *  Armor and weapons have NO vocabulary constant, so spec §3.3's SECOND rule
 *  applies: `value` is the raw authored string and `label` is the module-private
 *  {@link prettyName}, byte for byte what the sheet renders today. They are
 *  composed HERE rather than in the grant leaf precisely so `prettyName` can
 *  stay unexported (spec §7.1, fence F8).
 *
 *  DEDUPE is keyed on `toProfSlug`, not on the raw value. The bucket this
 *  replaced was
 *  a `Set<prettyName(raw)>`, and prettyName is `humanizeProficiency(toProfSlug(raw))`,
 *  so slug-keying reproduces the shipped collapse exactly: a Fighter/Paladin
 *  double grant of `heavy` stays ONE row, and two spellings of one category
 *  ("hand crossbows" / "hand-crossbows") do not split into two.
 *
 *  SORT is by label, because the bucket this replaced returned `[...set].sort()` over
 *  the display strings. Dropping it is a visible regression on a single-class
 *  sheet: the 2014 Fighter authors `armor: [shield, light, medium, heavy]` and
 *  renders "Heavy, Light, Medium, Shield". `<`/`>` on strings is the same
 *  UTF-16 code-unit comparison the default `sort()` used.
 *
 *  PICKS are seeded into the SAME map after every grant bucket and share its key,
 *  so first-seen still wins: a weapon that is both class-granted and picked stays
 *  ONE row with origin `grant` and its granting source(s), and only an unmatched
 *  pick mints a row · `{origin: "pick", sources: []}`, mirroring the shape
 *  computeEffectiveProficiencies gives a language or tool pick (R4-G3b §7 F5).
 *  They are seeded BEFORE the sort, so the bucket stays label-sorted as a whole.
 *  `picks` defaults to `[]`, so the armor call is unchanged in behaviour. */
function composeGrantEntries(buckets: ProficiencyGrant[][], picks: string[] = []): ProficiencyEntry[] {
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
  for (const v of picks) { const k = toProfSlug(v); if (!byKey.has(k)) byKey.set(k, { value: v, label: prettyName(v), sources: [], origin: "pick" }); }
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
 *  entity slugs like "srd-2024_magic-initiate", which `resolveEntityRef` in
 *  pc.decision-engine.ts handles · the canonical comparison in that module,
 *  `matchPool`, is never handed one),
 *  so routing an entity slug through here now yields "A_b" where it once gave
 *  "A B". Safe today: 0 of the 73 distinct values in the census contain `_`.
 *  The census is the SUPERSET it has always been, named by symbol because line
 *  cites rot: every fixed grant bucket `collectProficiencyGrants` builds (class
 *  armor / weapons.fixed / weapons.categories / tools.fixed, race + background
 *  fixed languages and tools, the four feat grants), every language/tool
 *  select-proficiency `from` pool in runtime data, and the ALL_LANGUAGES
 *  fallback · 18 of those 73 CHANGE OUTPUT, meaning they render differently than
 *  the retired pre-R4-P3a body did (17 are an `X'S` → `X's` repair, one is the
 *  U+2019 fold). Both numbers moved since P3a recorded 50 / 7, and neither move
 *  is this function: R4-G1b widened ALL_LANGUAGES 16 → 18 (SECRET_LANGUAGES) and
 *  the intervening SRD regens replaced from-less tool picks with explicit
 *  ALL_TOOLS-shaped `from` pools.
 *
 *  It is a superset because languages and tools no longer come through here at
 *  all · they are composed by `computeEffectiveProficiencies`, leaving
 *  `composeGrantEntries` (armor + weapons) as this function's only live caller:
 *  21 distinct values, 0 with `_`, 0 changed. Re-derive BOTH numbers before
 *  widening anything that feeds this; do not copy them forward.
 *
 *  That 21 is now HALF the story, and the half it covers is still true: it
 *  censuses AUTHORED grant strings, a CLOSED population. R4-G3b Task 5 fix 1
 *  added a SECOND input, `composeGrantEntries`' `picks` · the chosen
 *  `select-entity{weapon}` slugs, bare-slugged by collectChosenProficiencies ·
 *  and that population is NOT closed: a `select-entity` with no `from`
 *  enumerates whatever the vault compendium holds (enumerateOptions' registry
 *  branch in pc.decision-engine.ts), so it is bounded by the INSTALLED
 *  COMPENDIUM, not by anything authored in this repo. Re-derived on the shipped
 *  weapon data for this commit: src/srd/data/runtime/weapon.2014.json (37 slugs)
 *  + weapon.2024.json (38) = 75, every one of exactly three `_` segments,
 *  bare-slugging to 42 distinct values, 0 of them containing `_`. What makes
 *  that safe is the SEGMENT COUNT, not the source: bareEntitySlug joins
 *  everything from the third segment on, so a homebrew slug carrying a FOURTH
 *  ("homebrew_weapon_hand_crossbow" -> "hand_crossbow") is the case that would
 *  render "Hand_crossbow" on the panel. Re-derive this count too, over the
 *  compendium in play, before widening what feeds this. */
function prettyName(slug: string): string {
  return humanizeProficiency(toProfSlug(slug));
}
