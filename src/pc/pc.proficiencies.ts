import type { ResolvedCharacter } from "./pc.types";
import {
  collectChosenProficiencies,
  collectLanguageToolChoiceStatus,
  type ChoiceStatus,
} from "./pc.decision-engine";
import { humanizeProficiency, toProfSlug } from "./pc.proficiency-normalize";

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

interface FeatProficiencyGrants {
  armor?: string[];
  weapons?: string[];
  tools?: string[];
  languages?: string[];
}

export function collectProficiencySources(resolved: ResolvedCharacter): ProficiencySources {
  const classArmor: string[] = [];
  const classWeaponFixed: string[] = [];
  const classWeaponCategories: string[] = [];
  const classToolFixed: string[] = [];
  for (const c of resolved.classes) {
    const prof = c.entity?.proficiencies;
    if (!prof) continue;
    for (const a of prof.armor ?? []) classArmor.push(a);
    for (const w of prof.weapons?.fixed ?? []) classWeaponFixed.push(w);
    for (const w of prof.weapons?.categories ?? []) classWeaponCategories.push(w);
    for (const t of prof.tools?.fixed ?? []) classToolFixed.push(t);
  }

  const raceLangFixed = [...(resolved.race?.languages?.fixed ?? [])];

  const bgToolFixed: string[] = [];
  const bgLangFixed: string[] = [];
  const bg = resolved.background;
  if (bg) {
    for (const entry of bg.tool_proficiencies ?? []) {
      if (entry.kind === "fixed") bgToolFixed.push(...entry.items);
    }
    for (const entry of bg.language_proficiencies ?? []) {
      if (entry.kind === "fixed") bgLangFixed.push(...entry.languages);
    }
  }

  const featArmor: string[] = [];
  const featWeapons: string[] = [];
  const featTools: string[] = [];
  const featLanguages: string[] = [];
  for (const f of resolved.feats) {
    // FeatEntity has no typed proficiency-grant bag; some feats carry one as an
    // opaque authored field. Read it through a narrow structural view.
    const featView = f as unknown as { proficiencies?: FeatProficiencyGrants };
    const grants = featView.proficiencies;
    if (!grants) continue;
    featArmor.push(...(grants.armor ?? []));
    featWeapons.push(...(grants.weapons ?? []));
    featTools.push(...(grants.tools ?? []));
    featLanguages.push(...(grants.languages ?? []));
  }

  const chosen = collectChosenProficiencies(resolved);
  const status = collectLanguageToolChoiceStatus(resolved);

  return {
    classArmor, classWeaponFixed, classWeaponCategories, classToolFixed,
    raceLangFixed, bgToolFixed, bgLangFixed,
    featArmor, featWeapons, featTools, featLanguages,
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
 *  entity slugs like "srd-2024_magic-initiate", see pc.decision-engine.ts:233),
 *  so routing an entity slug through here now yields "A_b" where it once gave
 *  "A B". Safe today: 0 of the 50 distinct values that can reach this function
 *  contain `_`, counted over every fixed grant read at :115-127, every
 *  language/tool select-proficiency `from` pool in runtime data, and the
 *  ALL_LANGUAGES fallback · 7 of those 50 change output. Re-derive that census
 *  before widening what feeds this. */
function prettyName(slug: string): string {
  return humanizeProficiency(toProfSlug(slug));
}
