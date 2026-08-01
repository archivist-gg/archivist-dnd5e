import type { ResolvedCharacter } from "./pc.types";

export type ProficiencyOrigin = "grant" | "pick" | "manual" | "custom";

export interface ProficiencyEntry {
  /** Canonical slug when the value lands on the domain vocabulary, else the raw string. Spec §3.3. */
  value: string;
  /** Display form. Spec §3.3's first code block (languages/tools) or second (armor/weapons). */
  label: string;
  /** EVERY granting entity's display name, in walk order: class, race, background, feats. */
  sources: string[];
  origin: ProficiencyOrigin;
}

/** One granted value plus the display name of the entity that granted it. */
export interface ProficiencyGrant { value: string; source: string }

export interface ProficiencyGrants {
  classArmor: ProficiencyGrant[];
  classWeaponFixed: ProficiencyGrant[];
  classWeaponCategories: ProficiencyGrant[];
  classToolFixed: ProficiencyGrant[];
  raceLangFixed: ProficiencyGrant[];
  bgToolFixed: ProficiencyGrant[];
  bgLangFixed: ProficiencyGrant[];
  featArmor: ProficiencyGrant[];
  featWeapons: ProficiencyGrant[];
  featTools: ProficiencyGrant[];
  featLanguages: ProficiencyGrant[];
}

interface FeatProficiencyGrants {
  armor?: string[];
  weapons?: string[];
  tools?: string[];
  languages?: string[];
}

/** Stand-in when a granting entity carries no display name. Unreachable through
 *  the typed shapes: every entity here declares `name: string`, and every push
 *  already sits behind a guard that implies its entity exists (a null
 *  `c.entity` yields no `prof`, a null `race` yields an empty fixed list, `bg`
 *  is behind `if (bg)`). It exists because `ProficiencyGrant.source` is
 *  `string`, and cast-built fixtures can omit a field the type says is there ·
 *  the same class of defence as the `resolved.feats ?? []` guard below. A
 *  visible token beats the empty string, which renders as a blank source chip. */
const UNKNOWN_SOURCE = "Unknown";

/** Every FIXED proficiency/language a character's entities grant, each paired
 *  with the display name of the entity that granted it. Walk order is
 *  class → race → background → feats, and that order defines `sources` ordering
 *  downstream (spec §4.1).
 *
 *  This module is a LEAF on purpose: it must import nothing from the decision
 *  engine module, so that the engine can import it without a cycle (spec §4.3).
 *  T3's acceptance check is a literal grep for that module's name over this
 *  file, so do not name it here either · describe it, as this comment does.
 *  The walk returns raw `{value, source}` buckets and nothing else · no
 *  humanizing, no sorting, no dedupe. Label composition stays with the
 *  module-private `prettyName` in `pc.proficiencies.ts` (spec §7.1). */
export function collectProficiencyGrants(resolved: ResolvedCharacter): ProficiencyGrants {
  const classArmor: ProficiencyGrant[] = [];
  const classWeaponFixed: ProficiencyGrant[] = [];
  const classWeaponCategories: ProficiencyGrant[] = [];
  const classToolFixed: ProficiencyGrant[] = [];
  for (const c of resolved.classes) {
    const prof = c.entity?.proficiencies;
    if (!prof) continue;
    const source = c.entity?.name ?? UNKNOWN_SOURCE;
    for (const a of prof.armor ?? []) classArmor.push({ value: a, source });
    for (const w of prof.weapons?.fixed ?? []) classWeaponFixed.push({ value: w, source });
    for (const w of prof.weapons?.categories ?? []) classWeaponCategories.push({ value: w, source });
    for (const t of prof.tools?.fixed ?? []) classToolFixed.push({ value: t, source });
  }

  const raceSource = resolved.race?.name ?? UNKNOWN_SOURCE;
  const raceLangFixed: ProficiencyGrant[] = (resolved.race?.languages?.fixed ?? []).map(
    (l) => ({ value: l, source: raceSource }),
  );

  const bgToolFixed: ProficiencyGrant[] = [];
  const bgLangFixed: ProficiencyGrant[] = [];
  const bg = resolved.background;
  if (bg) {
    const source = bg.name ?? UNKNOWN_SOURCE;
    for (const entry of bg.tool_proficiencies ?? []) {
      if (entry.kind === "fixed") {
        for (const t of entry.items) bgToolFixed.push({ value: t, source });
      }
    }
    for (const entry of bg.language_proficiencies ?? []) {
      if (entry.kind === "fixed") {
        for (const l of entry.languages) bgLangFixed.push({ value: l, source });
      }
    }
  }

  const featArmor: ProficiencyGrant[] = [];
  const featWeapons: ProficiencyGrant[] = [];
  const featTools: ProficiencyGrant[] = [];
  const featLanguages: ProficiencyGrant[] = [];
  // `?? []` because this walk becomes reachable from buildDecisionLedger, whose
  // cast-built fixtures omit `feats` · every pre-existing caller supplied it.
  for (const f of resolved.feats ?? []) {
    // FeatEntity has no typed proficiency-grant bag; some feats carry one as an
    // opaque authored field. Read it through a narrow structural view.
    const featView = f as unknown as { proficiencies?: FeatProficiencyGrants };
    const grants = featView.proficiencies;
    if (!grants) continue;
    const source = f.name ?? UNKNOWN_SOURCE;
    for (const a of grants.armor ?? []) featArmor.push({ value: a, source });
    for (const w of grants.weapons ?? []) featWeapons.push({ value: w, source });
    for (const t of grants.tools ?? []) featTools.push({ value: t, source });
    for (const l of grants.languages ?? []) featLanguages.push({ value: l, source });
  }

  return {
    classArmor, classWeaponFixed, classWeaponCategories, classToolFixed,
    raceLangFixed, bgToolFixed, bgLangFixed,
    featArmor, featWeapons, featTools, featLanguages,
  };
}
