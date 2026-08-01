import type { ResolvedCharacter } from "./pc.types";
import {
  collectChosenProficiencies,
  collectLanguageToolChoiceStatus,
  type ChoiceStatus,
} from "./pc.decision-engine";
import { humanizeProficiency, toProfSlug } from "./pc.proficiency-normalize";
import { collectProficiencyGrants, type ProficiencyGrant } from "./pc.proficiency-grants";

/** Re-exported for the plugin: both types are DECLARED in the leaf so that
 *  pc.decision-engine can reference them without importing this module, which
 *  would close a cycle (spec §4.3). */
export type { ProficiencyEntry, ProficiencyOrigin } from "./pc.proficiency-grants";

export interface ProficiencyAggregate {
  armor: string[];
  weapons: string[];
  tools: string[];
  languages: string[];
  /** Unresolved language/tool decisions as "choose N" placeholders (N = count -
   *  selected, only when > 0). Additive; consumed by the plugin proficiency panel. */
  choices: { languages: string[]; tools: string[] };
}

/** Normalized intermediate of every proficiency/language source the DISPLAY path
 *  reads, in one place. Only the class branch is a live proficiency source today
 *  (race/bg/feat `.proficiencies` object fields do not exist on those entities);
 *  race languages, bg tool/lang, and feat grants read their real fields. Chosen
 *  picks + per-choice status come from the single decision walk in
 *  pc.decision-engine so display can never diverge from the persisted picks. */
export interface ProficiencySources {
  classArmor: string[];              // ArmorCategory[] — category names
  classWeaponFixed: string[];        // WeaponProficiency.fixed — display names (D6 matches via normKey)
  classWeaponCategories: string[];
  classToolFixed: string[];
  raceLangFixed: string[];
  bgToolFixed: string[];
  bgLangFixed: string[];
  featArmor: string[];
  featWeapons: string[];
  featTools: string[];
  featLanguages: string[];
  chosenLanguages: string[];         // from collectChosenProficiencies (flat, per-domain)
  chosenTools: string[];
  languageChoices: ChoiceStatus[];   // per-choice descriptors for placeholder derivation
  toolChoices: ChoiceStatus[];
}

export function collectProficiencySources(resolved: ResolvedCharacter): ProficiencySources {
  const g = collectProficiencyGrants(resolved);
  const chosen = collectChosenProficiencies(resolved);
  const status = collectLanguageToolChoiceStatus(resolved);
  // The grant walk now carries the granting entity per value; this shape drops
  // it. T8 reshapes ProficiencySources to keep it.
  const flat = (b: ProficiencyGrant[]) => b.map((e) => e.value);

  return {
    classArmor: flat(g.classArmor),
    classWeaponFixed: flat(g.classWeaponFixed),
    classWeaponCategories: flat(g.classWeaponCategories),
    classToolFixed: flat(g.classToolFixed),
    raceLangFixed: flat(g.raceLangFixed),
    bgToolFixed: flat(g.bgToolFixed),
    bgLangFixed: flat(g.bgLangFixed),
    featArmor: flat(g.featArmor),
    featWeapons: flat(g.featWeapons),
    featTools: flat(g.featTools),
    featLanguages: flat(g.featLanguages),
    chosenLanguages: chosen.languages,
    chosenTools: chosen.tools,
    languageChoices: status.languages,
    toolChoices: status.tools,
  };
}

export function aggregateProficiencies(resolved: ResolvedCharacter): ProficiencyAggregate {
  const src = collectProficiencySources(resolved);

  const armor = new Set<string>();
  const weapons = new Set<string>();
  const tools = new Set<string>();
  const languages = new Set<string>();

  for (const a of src.classArmor) armor.add(prettyName(a));
  for (const w of src.classWeaponFixed) weapons.add(prettyName(w));
  for (const w of src.classWeaponCategories) weapons.add(prettyName(w));
  for (const t of src.classToolFixed) tools.add(prettyName(t));

  for (const l of src.raceLangFixed) languages.add(prettyName(l));
  for (const t of src.bgToolFixed) tools.add(prettyName(t));
  for (const l of src.bgLangFixed) languages.add(prettyName(l));

  for (const a of src.featArmor) armor.add(prettyName(a));
  for (const w of src.featWeapons) weapons.add(prettyName(w));
  for (const t of src.featTools) tools.add(prettyName(t));
  for (const l of src.featLanguages) languages.add(prettyName(l));

  // Fold decision-driven picks (languages/tools) into the display set — this is
  // what the pre-fold aggregate was missing.
  for (const l of src.chosenLanguages) languages.add(prettyName(l));
  for (const t of src.chosenTools) tools.add(prettyName(t));

  return {
    armor: [...armor].sort(),
    weapons: [...weapons].sort(),
    tools: [...tools].sort(),
    languages: [...languages].sort(),
    choices: {
      languages: placeholders(src.languageChoices),
      tools: placeholders(src.toolChoices),
    },
  };
}

/** One "choose N" string per unresolved choice (N = count - selected, > 0). */
function placeholders(choices: ChoiceStatus[]): string[] {
  const out: string[] = [];
  for (const c of choices) {
    const remaining = c.count - c.selected;
    if (remaining > 0) out.push("choose " + remaining);
  }
  return out;
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
