import {
  abilityModifier,
  proficiencyFromLevel,
  savingThrow,
  skillBonus,
  passivePerception,
  passive,
  attackBonus,
  saveDC,
} from "@archivist-gg/dnd5e/dnd/math";
import { ABILITY_KEYS, SKILL_ABILITY, ALL_SKILLS } from "@archivist-gg/dnd5e/dnd/constants";
import type { Ability, SkillSlug } from "@archivist-gg/dnd5e";
import type { FeatEntity } from "@archivist-gg/dnd5e/feat/feat.types";
import type { RaceEntity } from "@archivist-gg/dnd5e/race/race.types";
import type { EntityRegistry } from "@archivist-gg/core";
import { computeAppliedBonuses, computeSlotsAndAttacks, emptyAppliedBonuses } from "./pc.equipment";
import { collectChosenProficiencies, collectChosenAbilityPoints } from "./pc.decision-engine";
import { assembleEffectFeatures, computeFeatureEffects, selfEffectsOf } from "./pc.feature-effects";
import { computeConditionEffects } from "./pc.conditions";
import { toDefenseSlug } from "./pc.defense-normalize";
import { resolveSpellcasting, effectiveSpellcastingAbility, deriveSpellSlots, computeSpellLimits, type CasterClassInput, type LimitClassInput } from "./pc.spellcasting";
import type {
  ACTerm,
  ChoiceValue,
  DefenseEntry,
  DefenseOrigin,
  DerivedEquipment,
  DerivedStats,
  HPBreakdown,
  ProficiencySet,
  ResolvedCharacter,
  ResolvedClass,
  CharacterOverrides,
  SpellcastingClassInfo,
  SpellLimitInfo,
} from "./pc.types";
import type { InformationalBonus } from "../item/item.conditions.types";

type ProficiencyTri = "none" | "proficient" | "expertise";

// Category words that the weapon gate can actually match: the class-level
// vocabulary (isWeaponSlugProficient's `simple`/`martial` literals) plus the
// entity-level `weapon.category` forms its third fallback compares by exact
// equality. Anything else is a specific weapon NAME, which can only ever match
// through `.specific` (normKey against weapon.name).
//
// ADDITIVE on purpose. weapon.category is an OPEN union (`| string`, and
// z.string() at runtime), so this list can never be proven exhaustive over
// homebrew · a vault weapon may declare any category at all. Pushing to
// .categories unconditionally means nothing that grants today can stop
// granting; the extra .specific push is what makes a specific name work.
const WEAPON_CATEGORY_WORDS = new Set([
  "simple", "martial",
  "simple-melee", "simple-ranged", "martial-melee", "martial-ranged", "natural",
]);

/**
 * PHB "fixed average" value per hit die (per level beyond first). Called
 * "average" in the PHB but actually ceil((die + 1) / 2); equivalent to
 * Math.floor(die / 2) + 1 for even dice.
 *
 * d6 → 4, d8 → 5, d10 → 6, d12 → 7.
 */
export function phbAverageForDie(hitDieStr: string): number {
  const n = parseDieSize(hitDieStr);
  if (n == null) return 4;
  return Math.floor(n / 2) + 1;
}

/** Extracts the integer size from "d8" / "d10" / 8 / 10. */
export function parseDieSize(die: string | number | undefined | null): number | null {
  if (die == null) return null;
  if (typeof die === "number") return die;
  const m = die.match(/^d?(\d+)$/i);
  return m ? parseInt(m[1], 10) : null;
}

/**
 * ALL_SKILLS entries are Title Case ("Animal Handling"); DerivedStats.skills
 * keys are kebab-case SkillSlug ("animal-handling"); shared SKILL_ABILITY keys
 * are space-lowercase ("animal handling"). These two helpers bridge the gap.
 */
function skillSlugFromDisplay(display: string): SkillSlug {
  return display.toLowerCase().replace(/\s+/g, "-") as SkillSlug;
}

function skillSlugToAbilityLookup(slug: SkillSlug): string {
  return slug.replace(/-/g, " ");
}

/**
 * Flattens RaceEntity.ability_score_increases into a partial ability→bonus map.
 * Fixed increases contribute their amount directly. Choice increases are ignored
 * here — they're expected to come through class.choices with a specific ability
 * selected, which computeAbilityScores handles separately.
 */
export function flattenRaceAsi(race: RaceEntity | null): Partial<Record<Ability, number>> {
  const out: Partial<Record<Ability, number>> = {};
  if (!race?.ability_score_increases) return out;
  for (const asi of race.ability_score_increases) {
    if ("ability" in asi) {
      out[asi.ability] = (out[asi.ability] ?? 0) + asi.amount;
    }
    // Choice increases are resolved through class.choices; skip here.
  }
  return out;
}

/**
 * Resolves the selected subrace's fixed ability-score increases, matched by
 * slug the same way race-block merges subrace traits (the `[[..]]` wikilink
 * wrapper is stripped before comparison). Returns [] when no subrace selected
 * or no match. Choice-style increases are not expected on subraces here.
 */
function subraceAsi(
  resolved: ResolvedCharacter,
): Array<{ ability?: Ability; amount?: number }> {
  const subSlug = resolved.definition.subrace?.replace(/\[\[|\]\]/g, "") ?? null;
  if (!subSlug) return [];
  const subraces =
    (resolved.race as unknown as {
      subraces?: Array<{ slug: string; ability_score_increases?: Array<{ ability?: Ability; amount?: number }> }>;
    })?.subraces ?? [];
  const sub = subraces.find((s) => s.slug === subSlug);
  return sub?.ability_score_increases ?? [];
}

/**
 * Sums the LEGACY class-level ASI-BRANCH allocations (`choices[lvl].asi`) per
 * ability across every class. This is the path taken when an L4/L8-style
 * "Ability Score Increase or Feat" decision resolves to the plain +2 ASI branch
 * rather than a feat. Shared by both `computeAbilityScores`' fold and
 * `abilityBonusBreakdown`'s `class` bucket so the two reads can never drift.
 *
 * Disjoint from chosen-feat ability-points (`choices[lvl]["feat:<id>"]`) and from
 * origin ability-points · no source double-counts.
 *
 * Since R4-P4 Decision B an `asi` that SHARES a level with a string `feat` key is
 * discarded as an orphan rather than folded: that level took the feat branch, and
 * the `asi` beside it is residue the picker never cleared on a branch switch.
 * Folding both paid the same slot twice (Volker.md drew FOUR points from one L4).
 */
export function collectClassAsiBranch(
  resolved: ResolvedCharacter,
): Partial<Record<Ability, number>> {
  const out: Partial<Record<Ability, number>> = {};
  for (const c of resolved.classes) {
    for (const [, choice] of Object.entries(c.choices)) {
      // Optional-chained on purpose: pc.schema.ts deliberately PRESERVES a
      // non-object level value rather than dropping it, so `choice` can be null
      // or undefined here. The sibling collectClassFeatAbilityPoints guards the
      // same hazard with its own `if (!block) continue;`, and the pre-R4-P4 base
      // of this loop read `(choice as {...})?.asi`. A plain `block.feat` throws
      // on `choices: {4: null}` where every other reader returns empty.
      const block = choice as { asi?: Partial<Record<Ability, number>>; feat?: unknown } | null | undefined;
      // A level that also carries a chosen feat took the feat branch; any `asi`
      // beside it is an orphan left by a branch switch (the picker never cleared
      // the abandoned branch's child keys). `typeof … === "string"` MIRRORS
      // collectClassFeatAbilityPoints' own gate exactly, so the two can never both
      // decline ON THIS PREDICATE: whichever way the typeof test falls, exactly
      // one of them takes the block. That is NOT a claim that they can never both
      // decline · downstream of its own gate collectClassFeatAbilityPoints still
      // bails when the feat slug resolves to no entity (`if (!feat) continue`), and
      // then a block like `{asi:{con:1,wis:1}, feat:"<slug not loaded>"}` folds
      // nowhere and the two points vanish silently. Measured, not assumed. That is
      // by design (an unresolvable pick grants nothing); reaching it needs a
      // compendium that is not loaded, NOT a rename: R4-P4's regen renamed zero of
      // the 3329 shipped slugs (measured base-vs-HEAD; it added exactly one).
      // Do NOT loosen the gate to `"feat" in block` or a `startsWith("feat")`
      // prefix test: the first strands a non-string `feat` (a legacy hand edit)
      // with no fold at all, the second skips every correctly-flattened block.
      if (typeof block?.feat === "string") continue;
      const asi = block?.asi;
      if (!asi) continue;
      for (const ab of ABILITY_KEYS) {
        const v = asi[ab];
        if (typeof v === "number") out[ab] = (out[ab] ?? 0) + v;
      }
    }
  }
  return out;
}

/** Per-ability bonus provenance for the builder's obelisk captions:
 *  species = fixed race ASI + subrace fixed ASI + race ability-points choices;
 *  background = background ability-points choices;
 *  class = legacy class ASI-BRANCH allocations (the L4 asi-or-feat → asi path),
 *          MINUS any `asi` sharing a level with a string `feat` key, which
 *          collectClassAsiBranch discards as branch-switch residue (R4-P4 Dec. B);
 *  feat = class chosen-feat ability-points (the L4 asi-or-feat → feat path) +
 *         flat feat ability_bonuses (e.g. Athlete +1 STR). All already fold into
 *         computeAbilityScores totals, so the caption must account for them or a
 *         tile reads higher than the named sources explain (smoke r1/r5c). */
export function abilityBonusBreakdown(
  resolved: ResolvedCharacter,
): Record<Ability, { species: number; background: number; class: number; feat: number }> {
  const race = flattenRaceAsi(resolved.race);
  const origin = collectChosenAbilityPoints(resolved);
  const sub = subraceAsi(resolved);
  const classAsi = collectClassAsiBranch(resolved);
  const featPoints = collectClassFeatAbilityPoints(resolved);

  const out = {} as Record<Ability, { species: number; background: number; class: number; feat: number }>;
  for (const ab of ABILITY_KEYS) {
    let species = (race[ab] ?? 0) + (origin.race[ab] ?? 0);
    for (const asi of sub) {
      if (asi.ability === ab && typeof asi.amount === "number") species += asi.amount;
    }
    let feat = featPoints[ab] ?? 0;
    for (const f of resolved.feats) {
      const bonus = (f as unknown as { ability_bonuses?: Partial<Record<Ability, number>> }).ability_bonuses?.[ab];
      if (typeof bonus === "number") feat += bonus;
    }
    out[ab] = { species, background: origin.background[ab] ?? 0, class: classAsi[ab] ?? 0, feat };
  }
  return out;
}

/** Dice-only portion of PC max HP: first VALID level anywhere = max(die),
 *  every later valid level = PHB average. Skip rule identical to hpLevelCount. */
export function hitDiceAverageSum(classes: ResolvedClass[]): number {
  let total = 0;
  let firstLevelCounted = false;
  for (const c of classes) {
    const die = parseDieSize(c.entity?.hit_die);
    if (!c.entity || die == null || c.level < 1) continue;
    for (let lvl = 1; lvl <= c.level; lvl++) {
      if (!firstLevelCounted) {
        total += die;
        firstLevelCounted = true;
      } else {
        total += Math.floor(die / 2) + 1;
      }
    }
  }
  return total;
}

/** Count of levels that contribute to HP (valid class entries only). */
export function hpLevelCount(classes: ResolvedClass[]): number {
  let count = 0;
  for (const c of classes) {
    const die = parseDieSize(c.entity?.hit_die);
    if (!c.entity || die == null || c.level < 1) continue;
    count += c.level;
  }
  return count;
}

/**
 * PC-oriented multiclass HP.
 * - First class's first level: max(hit_die) + conMod.
 * - Every subsequent level (in any class): phbAverageForDie(thatLevel'sClass) + conMod.
 * CON mod contributes once per total level.
 * Decomposed (P5 T2) into hitDiceAverageSum (dice-only) + hpLevelCount (level count),
 * so a later popup can render the two components separately.
 */
export function multiclassMaxHP(classes: ResolvedClass[], conMod: number): number {
  return Math.max(1, hitDiceAverageSum(classes) + conMod * hpLevelCount(classes));
}

/**
 * Default AC = 10 + DEX mod. If any class's features include an
 * "Unarmored Defense"–style feature with a structured flag, applies the
 * variant (Monk: +WIS; Barbarian: +CON). Falls back to feature-name
 * regex matching with a warning pushed onto `warnings`.
 */
export function unarmoredAC(
  resolved: ResolvedCharacter,
  mods: Record<Ability, number>,
  warnings: string[],
): number {
  return unarmoredACBreakdown(resolved, mods, warnings).total;
}

/**
 * Same logic as `unarmoredAC` but also returns a structured breakdown of the
 * contributing terms (Base 10, DEX, optional class unarmored defense ability).
 * Used by recalc to assemble a richer acBreakdown when no armor is equipped.
 */
export function unarmoredACBreakdown(
  resolved: ResolvedCharacter,
  mods: Record<Ability, number>,
  warnings: string[],
): { total: number; terms: ACTerm[] } {
  const baseTerms: ACTerm[] = [
    { source: "Unarmored", amount: 10, kind: "unarmored" },
    { source: "DEX modifier", amount: mods.dex, kind: "dex" },
  ];

  // Generic unarmored-ac effect (e.g. Reaver Bravado: 10 + DEX + CHA).
  // Takes precedence over the legacy unarmored_defense flag scan below.
  for (const rf of resolved.features) {
    const eff = selfEffectsOf(rf.feature).find((e) => e.kind === "unarmored-ac");
    if (eff && eff.kind === "unarmored-ac") {
      const base = eff.base ?? 10;
      const terms: ACTerm[] = [
        { source: "Unarmored", amount: base, kind: "unarmored" },
        { source: "DEX modifier", amount: mods.dex, kind: "dex" },
      ];
      let total = base + mods.dex;
      for (const ab of eff.abilities) {
        if (ab === "dex") continue; // dex already included
        terms.push({ source: `${ab.toUpperCase()} modifier (${rf.feature.name ?? "Unarmored"})`, amount: mods[ab], kind: "ability" });
        total += mods[ab];
      }
      return { total, terms };
    }
  }

  for (const rf of resolved.features) {
    const feat = rf.feature as unknown as { unarmored_defense?: { ability: Ability }; name?: string };
    if (feat.unarmored_defense?.ability) {
      const ab = feat.unarmored_defense.ability;
      const amt = mods[ab] ?? 0;
      const terms: ACTerm[] = [
        ...baseTerms,
        { source: `${ab.toUpperCase()} modifier (Unarmored Defense)`, amount: amt, kind: "ability" },
      ];
      return { total: 10 + mods.dex + amt, terms };
    }
  }

  // Heuristic fallback by feature name.
  for (const rf of resolved.features) {
    const name = (rf.feature.name ?? "").toLowerCase();
    if (!/unarmored\s*defense/.test(name)) continue;
    if (rf.source.kind === "class" && rf.source.slug.includes("monk")) {
      warnings.push(`Unarmored Defense detected by name on ${rf.source.slug}; populate unarmored_defense:{ability:wis} flag for accuracy.`);
      const terms: ACTerm[] = [
        ...baseTerms,
        { source: "WIS modifier (Unarmored Defense)", amount: mods.wis, kind: "ability" },
      ];
      return { total: 10 + mods.dex + mods.wis, terms };
    }
    if (rf.source.kind === "class" && rf.source.slug.includes("barbarian")) {
      warnings.push(`Unarmored Defense detected by name on ${rf.source.slug}; populate unarmored_defense:{ability:con} flag for accuracy.`);
      const terms: ACTerm[] = [
        ...baseTerms,
        { source: "CON modifier (Unarmored Defense)", amount: mods.con, kind: "ability" },
      ];
      return { total: 10 + mods.dex + mods.con, terms };
    }
  }

  return { total: 10 + mods.dex, terms: baseTerms };
}

/** Initiative = DEX mod + Alert (+5 in 2014). Extendable via feat flags. */
export function initiativeBonus(dexMod: number, feats: FeatEntity[], edition: "2014" | "2024"): number {
  let bonus = dexMod;
  for (const f of feats) {
    if (f.slug === "alert" && edition === "2014") bonus += 5;
    const initBonus = (f as unknown as { initiative_bonus?: number }).initiative_bonus;
    if (typeof initBonus === "number") bonus += initBonus;
  }
  return bonus;
}

/** Speed = race.speed.walk + flat bonuses from feats (e.g., Mobile +10). */
export function speedFromRace(resolved: ResolvedCharacter): number {
  const base = resolved.race?.speed?.walk ?? 30;
  let extra = 0;
  for (const f of resolved.feats) {
    const bonus = (f as unknown as { speed_bonus?: number }).speed_bonus;
    if (typeof bonus === "number") extra += bonus;
  }
  return base + extra;
}

/**
 * Folds class-level CHOSEN-FEAT ability-points into per-ability totals.
 *
 * When the L4-style "asi or feat" decision resolves to a feat that carries
 * `ability-points` choices (e.g. Ability Score Improvement), the picker
 * persists the allocation under the namespaced key
 * `choices[lvl]["feat:" + choice.id]` (the engine's `buildItem` surfaces those
 * children; see pc.decision-engine.ts). This is disjoint from both the legacy
 * asi-BRANCH key (`choices[lvl].asi`) and origin ability-points, so no source
 * double-counts. The chosen feat entity is resolved from `resolved.feats`
 * (already looked up by the resolver) — no registry needed here.
 *
 * The L19 Epic Boon folds through this SAME path, but only as of R4-P4's
 * re-key (live in the SRD data from that phase's regeneration). This docblock
 * earlier cited it as an existing example, which it was not. EVERY reader OF THE
 * FEAT PICK keys on the LITERAL string `feat`, and there are THREE of them, not
 * the two the R4-P4 spec §2.3 and task brief enumerate: this function
 * (`block.feat`, below), `collectFeatSlugs` (pc.resolver.ts:298) and
 * `PCResolver.resolve`'s feat-to-spell pass (pc.resolver.ts:200), the one that
 * makes a SPELL-granting boon work. Note the qualifier: this is NOT a claim that
 * every reader of a saved class choice block keys on `feat`. Others read the very
 * same block by OTHER keys · `collectClassAsiBranch` (above) reads the literal
 * `.asi`, while `resolvePool` (pc.pools.ts) and `resolveChosenInline`
 * (pc.resolver.ts) read by a DYNAMIC pool/choice id. As of R4-P4 Decision B
 * `collectClassAsiBranch` also tests `block.feat`, but only to DETECT the feat
 * branch, not to consume the pick. pc.decision-engine.ts is NOT a fourth:
 * it reads generically by `choice.id`, which is exactly why re-keying works at
 * all. srd-2024.yaml authored the boon's pick `id: epic-boon`, so an L19
 * selection persisted under `choices[19]["epic-boon"]`, which no reader looks
 * at: the boon resolved to no feat, granted no spells, and contributed no
 * ability points at all. Re-keying the authored pick to `id: feat` is what
 * makes it fold. No persisted GRANDCHILD key moved with it ·
 * pc.decision-engine.ts builds `feat:<childId>` off a hardcoded prefix,
 * independent of the parent choice's own id.
 *
 * Clamps defensively (per-ability max_per, then stops at the points total in
 * ABILITY_KEYS order), mirroring collectChosenAbilityPoints.
 */
export function collectClassFeatAbilityPoints(
  resolved: ResolvedCharacter,
): Partial<Record<Ability, number>> {
  const out: Partial<Record<Ability, number>> = {};
  const stripRef = (ref: string): string => ref.replace(/^\[\[/, "").replace(/\]\]$/, "");
  const featBySlug = new Map<string, FeatEntity>();
  for (const f of resolved.feats) featBySlug.set(f.slug, f);

  for (const c of resolved.classes) {
    for (const atLevel of Object.values(c.choices)) {
      const block = atLevel as Record<string, ChoiceValue> | undefined;
      if (!block) continue;
      const featRef = block.feat;
      if (typeof featRef !== "string") continue;
      const feat = featBySlug.get(stripRef(featRef));
      if (!feat) continue;
      for (const ch of feat.choices ?? []) {
        if (ch.kind !== "ability-points") continue;
        const raw = block[`feat:${ch.id}`];
        if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
        let left = ch.points;
        for (const ab of ABILITY_KEYS) {
          if (ch.pool && !ch.pool.includes(ab)) continue;
          const v = raw[ab];
          if (typeof v !== "number" || v <= 0 || left <= 0) continue;
          const take = Math.min(v, ch.max_per, left);
          out[ab] = (out[ab] ?? 0) + take;
          left -= take;
        }
      }
    }
  }
  return out;
}

/**
 * Combines racial ASI (from race.ability_score_increases), feat ASI,
 * class-choice ASI (from classes[i].choices[lvl].asi), chosen-feat ASI
 * (from classes[i].choices[lvl]["feat:<id>"]), and user overrides.
 * Overrides win; ASI sources sum unconditionally.
 */
export function computeAbilityScores(
  resolved: ResolvedCharacter,
  overrides: CharacterOverrides,
): Record<Ability, number> {
  const out = { ...resolved.definition.abilities };

  const raceBonuses = flattenRaceAsi(resolved.race);
  for (const ab of ABILITY_KEYS) {
    const b = raceBonuses[ab];
    if (typeof b === "number") out[ab] = (out[ab] ?? 0) + b;
  }

  // Subrace fixed increases (e.g. Hill Dwarf +1 WIS) — matched by slug the
  // same way race-block merges subrace traits.
  for (const asi of subraceAsi(resolved)) {
    if (asi.ability && typeof asi.amount === "number") out[asi.ability] = (out[asi.ability] ?? 0) + asi.amount;
  }

  // Origin (race/background) ability-points decisions (SP2 Plan 4). Class-level
  // ASI stays on the legacy choices[lvl].asi path below — no double-counting.
  const originPoints = collectChosenAbilityPoints(resolved);
  for (const src of [originPoints.race, originPoints.background]) {
    for (const ab of ABILITY_KEYS) {
      const v = src[ab];
      if (typeof v === "number") out[ab] = (out[ab] ?? 0) + v;
    }
  }

  // Legacy class ASI-BRANCH fold (`choices[lvl].asi`). Extracted into
  // collectClassAsiBranch so this fold and the breakdown's `class` bucket read
  // identically and can't drift.
  const classAsi = collectClassAsiBranch(resolved);
  for (const ab of ABILITY_KEYS) {
    const v = classAsi[ab];
    if (typeof v === "number") out[ab] = (out[ab] ?? 0) + v;
  }

  // Class CHOSEN-FEAT ability-points (SP2 Plan 5). Disjoint from the asi-branch
  // fold above (the `feat:<id>` key never collides with the `asi` branch key).
  const featPoints = collectClassFeatAbilityPoints(resolved);
  for (const ab of ABILITY_KEYS) {
    const v = featPoints[ab];
    if (typeof v === "number") out[ab] = (out[ab] ?? 0) + v;
  }

  // Feat-granted flat ability bonuses (e.g., "Athlete: +1 STR").
  for (const f of resolved.feats) {
    const bonuses = (f as unknown as { ability_bonuses?: Partial<Record<Ability, number>> }).ability_bonuses;
    if (bonuses) {
      for (const ab of ABILITY_KEYS) {
        const v = bonuses[ab];
        if (typeof v === "number") out[ab] = (out[ab] ?? 0) + v;
      }
    }
  }

  // Overrides win.
  if (overrides.scores) {
    for (const ab of ABILITY_KEYS) {
      const v = overrides.scores[ab];
      if (typeof v === "number") out[ab] = v;
    }
  }

  // Default missing abilities to 10.
  for (const ab of ABILITY_KEYS) {
    if (typeof out[ab] !== "number") out[ab] = 10;
  }

  return out;
}

interface ClassProficiencies {
  armor?: { categories?: string[]; specific?: string[] } | string[];
  weapons?: { categories?: string[]; fixed?: string[]; specific?: string[] } | string[];
  tools?: { categories?: string[]; fixed?: string[]; specific?: string[] } | string[];
  languages?: string[];
}

function normalizeArmorProf(input: ClassProficiencies["armor"]): { categories: string[]; specific: string[] } {
  if (!input) return { categories: [], specific: [] };
  if (Array.isArray(input)) return { categories: input, specific: [] };       // armor array = category names
  return { categories: input.categories ?? [], specific: input.specific ?? [] };
}

function normalizeWeaponToolProf(input: ClassProficiencies["weapons"]): { categories: string[]; specific: string[] } {
  if (!input) return { categories: [], specific: [] };
  if (Array.isArray(input)) return { categories: [], specific: input };       // bare array = specific
  return { categories: input.categories ?? [], specific: (input.fixed ?? []).concat(input.specific ?? []) };
}

function mergeInto(target: ProficiencySet, source: { categories: string[]; specific: string[] }): void {
  for (const c of source.categories) if (!target.categories.includes(c)) target.categories.push(c);
  for (const s of source.specific) if (!target.specific.includes(s)) target.specific.push(s);
}

const ORIGIN_RANK: Record<DefenseOrigin, number> = { manual: 0, equipment: 1, grant: 2 };

/**
 * Composes one derived defense bucket from its three sources, in precedence order.
 *
 * Replaces `dedupeDefenseList`, which this function REMOVED in R4-P5 · that symbol no longer exists
 * anywhere in the tree, so do not go looking for it.
 *
 * Two different rules apply to two different fields, deliberately:
 *   - `label` is FIRST-SPELLING-WINS (preserving the retired dedupeDefenseList's display behaviour,
 *     so an authored "Psychic" still renders as "Psychic");
 *   - `origin` is STRONGEST-WINS across ALL three lists.
 * They come from different lists on purpose. Manual sorts first, so first-list-wins would mislabel
 * every granted value that the user also happens to have added by hand.
 *
 * Insertion order is the precedence order (manual, then equipment, then grants), matching the retired
 * concat. Do NOT sort · a label sort would reorder every chip line on the sheet.
 *
 * `label: raw.trim()` is an intentional fix: the retired dedupeDefenseList keyed on `v.trim()` but
 * pushed `v` UNTRIMMED, so "  fire  " reached the sheet with its whitespace.
 *
 * Every clause above is guarded: see "labels an equipment-sourced defense as origin 'equipment'",
 * "merges manual BEFORE equipment" (tests/pc-equipment-derive.test.ts), plus the origin/trim cases in
 * tests/pc-recalc-feature-effects.test.ts. All four were mutation-tested with the control seen RED.
 */
function composeDefenseEntries(
  manual: string[], equipment: string[], grants: string[],
): DefenseEntry[] {
  const byValue = new Map<string, DefenseEntry>();
  const consider = (list: string[], origin: DefenseOrigin) => {
    for (const raw of list) {
      const value = toDefenseSlug(raw);
      if (!value) continue;
      const existing = byValue.get(value);
      if (!existing) { byValue.set(value, { value, label: raw.trim(), origin }); continue; }
      if (ORIGIN_RANK[origin] > ORIGIN_RANK[existing.origin]) existing.origin = origin;
    }
  };
  consider(manual, "manual");
  consider(equipment, "equipment");
  consider(grants, "grant");
  return [...byValue.values()];
}

/** The four suppression buckets of `overrides.defenses`. DERIVED from the store rather than
 *  re-typed as four literals, so renaming a bucket in pc.types.ts is a build error here instead
 *  of a silently dead branch. It evaluates to exactly
 *  `"resistances" | "immunities" | "vulnerabilities" | "condition_immunities"`; widened to `string`
 *  the indexed access in `suppress` is a TS7053 implicit-any error.
 *
 *  ⚠️ What this type does NOT buy you: all four keys are mutually assignable, so passing the WRONG
 *  one at a call site typechecks perfectly, and so does ignoring `bucket` altogether. Only a test
 *  catches either · the single-bucket cases in tests/pc-recalc-feature-effects.test.ts catch a wrong
 *  key (it reads `undefined`, suppresses nothing, and the assertion fails), while ONLY the
 *  overlapping-value case "suppresses ONLY within the addressed bucket, never across buckets"
 *  catches a `bucket`-ignoring implementation. Both measured against the shipped tree. */
type DefenseBucket = keyof NonNullable<CharacterOverrides["defenses"]>;

/**
 * Subtract `overrides.defenses.<bucket>.remove` from a composed bucket · the FIRST and only consumer
 * of that store (added, consumer-less, by R4-P5 Task 4).
 *
 * The store is suppression-only by design: the additive channel is `character.defenses.*`. A note may
 * spell an entry any way it likes, so both sides go through `toDefenseSlug` · the SAME normalizer
 * `composeDefenseEntries` used to build `e.value`, which is the whole point of having exactly one.
 *
 * ⚠️ The chain is triple-optional on purpose, but NOT because a shorter one throws today: that was
 * MEASURED and is false here. `resolved.definition.overrides.defenses?.[bucket]` passes the ENTIRE
 * engine suite, so no recalc-reaching fixture in THIS repo omits `overrides`. It is
 * optional-chained because `Character.overrides` is non-optional in the type while the omission is
 * real one layer over (`computeEffectiveProficiencies`, pc.decision-engine.ts:709-713, records seven
 * live call sites passing a `definition` with no `overrides` key · and making ITS chain
 * non-optional throws, in more than one test), `tests/` is in no tsconfig `include` so the compiler can
 * never see such a fixture, and the plugin repo drives `recalc` with fixtures this suite never runs.
 * The `defenses` levels below it are genuinely optional in the schema: no defaults anywhere, so an
 * untouched note stays byte-identical.
 *
 * Empty strings are inert rather than special-cased: `toDefenseSlug("")` is `""` and
 * `composeDefenseEntries` never emits an entry with an empty value, so `""` in `remove` matches
 * nothing. Guarded by "normalizes every spelling axis of a `remove` entry" in
 * tests/pc-recalc-feature-effects.test.ts, which carries one value per normalization axis plus an
 * unlisted value as the negative control.
 */
function suppress(
  resolved: ResolvedCharacter, bucket: DefenseBucket, entries: DefenseEntry[],
): DefenseEntry[] {
  const suppressed = new Set(
    (resolved.definition?.overrides?.defenses?.[bucket]?.remove ?? []).map(toDefenseSlug),
  );
  return entries.filter((e) => !suppressed.has(e.value));
}

export function computeProficiencies(
  resolved: ResolvedCharacter,
): { armor: ProficiencySet; weapons: ProficiencySet; tools: ProficiencySet; languages: string[]; saves: Ability[] } {
  const armor: ProficiencySet = { categories: [], specific: [] };
  const weapons: ProficiencySet = { categories: [], specific: [] };
  const tools: ProficiencySet = { categories: [], specific: [] };
  const languages = new Set<string>();

  for (const c of resolved.classes) {
    const p = (c.entity as unknown as { proficiencies?: ClassProficiencies })?.proficiencies;
    if (!p) continue;
    mergeInto(armor, normalizeArmorProf(p.armor));
    mergeInto(weapons, normalizeWeaponToolProf(p.weapons));
    mergeInto(tools, normalizeWeaponToolProf(p.tools));
    p.languages?.forEach((l) => languages.add(l));
  }

  const racePr = (resolved.race as unknown as { proficiencies?: ClassProficiencies })?.proficiencies;
  if (racePr) {
    mergeInto(armor, normalizeArmorProf(racePr.armor));
    mergeInto(weapons, normalizeWeaponToolProf(racePr.weapons));
    mergeInto(tools, normalizeWeaponToolProf(racePr.tools));
    racePr.languages?.forEach((l) => languages.add(l));
  }

  const bgPr = (resolved.background as unknown as { proficiencies?: ClassProficiencies })?.proficiencies;
  if (bgPr) {
    mergeInto(armor, normalizeArmorProf(bgPr.armor));
    mergeInto(weapons, normalizeWeaponToolProf(bgPr.weapons));
    mergeInto(tools, normalizeWeaponToolProf(bgPr.tools));
    bgPr.languages?.forEach((l) => languages.add(l));
  }

  for (const f of resolved.feats) {
    const grants = (f as unknown as { grants_proficiency?: ClassProficiencies }).grants_proficiency;
    if (!grants) continue;
    mergeInto(armor, normalizeArmorProf(grants.armor));
    mergeInto(weapons, normalizeWeaponToolProf(grants.weapons));
    mergeInto(tools, normalizeWeaponToolProf(grants.tools));
    grants.languages?.forEach((l) => languages.add(l));
  }

  return {
    armor,
    weapons,
    tools,
    languages: Array.from(languages).sort(),
    saves: [],
  };
}

export function recalc(resolved: ResolvedCharacter, registry?: EntityRegistry): DerivedStats {
  const warnings: string[] = [];
  const overrides = resolved.definition.overrides ?? {};

  // Pass A: apply equipment-derived bonuses (only when registry is available).
  // The legacy single-arg call path keeps an empty AppliedBonuses so all the
  // arithmetic below is a no-op and existing callsites/tests stay green.
  // Chosen proficiencies from persisted decisions (SP2 Plan 3): skills/expertise
  // fold into the skill tri below; languages/tools fold into the proficiency set.
  const chosenProfs = collectChosenProficiencies(resolved);
  // Feature-effects pass (effects-application engine): one pure aggregation over
  // everything whose effects fold (authored features + SELECTED and GRANTED pool
  // boons), threaded into each stat below, BEFORE overrides. assembleEffectFeatures
  // owns the assembly and foldsNow owns the activatable gating, so the display-side
  // proficiency collector reads exactly the same two rules (spec fence F3).
  const { features: effectFeatures, activeBuffs } = assembleEffectFeatures(resolved);
  const featureEffects = computeFeatureEffects(effectFeatures, { activeBuffs });
  const profsForApply = computeProficiencies(resolved);
  for (const t of chosenProfs.tools) {
    if (!profsForApply.tools.specific.includes(t)) profsForApply.tools.specific.push(t);
  }
  for (const l of chosenProfs.languages) {
    if (!profsForApply.languages.includes(l)) profsForApply.languages.push(l);
  }
  for (const t of featureEffects.proficiencies.tools) {
    if (!profsForApply.tools.specific.includes(t)) profsForApply.tools.specific.push(t);
  }
  for (const l of featureEffects.proficiencies.languages) {
    if (!profsForApply.languages.includes(l)) profsForApply.languages.push(l);
  }
  // Effect-granted ARMOR proficiencies are CATEGORIES ("heavy"/"shield"), the
  // same form class/race/feat grants use, so they must land in the `.categories`
  // bucket the proficiency-query matcher reads (incl. the heavy → medium → light
  // implication). Armor is deliberately NOT routed to `.specific` · nothing in
  // the product gates on armor proficiency per item.
  //
  // Effect-granted WEAPON proficiencies are either a category word or an
  // authored weapon NAME, so this fold is ADDITIVE (see WEAPON_CATEGORY_WORDS):
  // every value still goes to `.categories` exactly as before, and a
  // non-category value ALSO goes to `.specific`.
  // `.specific` holds per-item identifiers AND authored weapon names · the gate
  // matches it by slug equality or normKey against weapon.name, so a display
  // spelling like "battleaxes" resolves. Category words stay out of it.
  for (const a of featureEffects.proficiencies.armor) {
    if (!profsForApply.armor.categories.includes(a)) profsForApply.armor.categories.push(a);
  }
  for (const w of featureEffects.proficiencies.weapons) {
    if (!profsForApply.weapons.categories.includes(w)) profsForApply.weapons.categories.push(w);
    if (!WEAPON_CATEGORY_WORDS.has(w) && !profsForApply.weapons.specific.includes(w)) {
      profsForApply.weapons.specific.push(w);
    }
  }
  profsForApply.languages.sort();
  const applied = registry
    ? computeAppliedBonuses(resolved, profsForApply, registry, warnings)
    : emptyAppliedBonuses();

  // Partition the non-AC situational bonuses already collected in
  // `applied.informational` into per-stat slices for UI tooltips (Task 7).
  // (AC informational rides a separate path via derivedEquipment.acInformational.)
  const savesInformational = applied.informational.filter(
    (i) => i.field === "saving_throws",
  );
  const spellcastingInformational = applied.informational.filter(
    (i) => i.field === "spell_attack" || i.field === "spell_save_dc",
  );
  const speedInformational = applied.informational.filter((i) =>
    i.field.startsWith("speed."),
  );

  // Ability scores: base computation, then apply Pass A bonus first, then
  // static (only when it raises the score), then user overrides win.
  const baseScores = computeAbilityScores(resolved, overrides);
  const scores: Record<Ability, number> = { ...baseScores };
  for (const ab of ABILITY_KEYS) {
    const bonus = applied.ability_bonuses[ab];
    if (typeof bonus === "number") scores[ab] += bonus;
  }
  for (const ab of ABILITY_KEYS) {
    const stat = applied.ability_statics[ab];
    if (typeof stat === "number" && stat > scores[ab]) scores[ab] = stat;
  }
  if (overrides.scores) {
    for (const ab of ABILITY_KEYS) {
      const o = overrides.scores[ab];
      if (typeof o === "number") scores[ab] = o;
    }
  }
  const mods: Record<Ability, number> = {
    str: abilityModifier(scores.str),
    dex: abilityModifier(scores.dex),
    con: abilityModifier(scores.con),
    int: abilityModifier(scores.int),
    wis: abilityModifier(scores.wis),
    cha: abilityModifier(scores.cha),
  };

  const totalLevel = resolved.classes.reduce((s, c) => s + c.level, 0);
  const proficiencyBonus = proficiencyFromLevel(totalLevel || 1);

  const conditionEffects = computeConditionEffects(
    resolved.state,
    resolved.definition.edition,
    scores,
  );

  // Saves (first class's saving_throws only, per 5e multiclass rule).
  const firstClass = resolved.classes[0]?.entity ?? null;
  const saveProfs = new Set<Ability>(firstClass?.saving_throws ?? []);
  for (const ab of featureEffects.proficiencies.saves) saveProfs.add(ab);
  const saves: Record<Ability, { bonus: number; proficient: boolean }> = {} as never;
  for (const ab of ABILITY_KEYS) {
    const override = overrides.saves?.[ab];
    const prof = override?.proficient ?? saveProfs.has(ab);
    const derivedBonus = savingThrow(scores[ab], prof, proficiencyBonus) + applied.save_bonus + conditionEffects.d20_test_penalty;
    const bonus = override?.bonus ?? derivedBonus;
    saves[ab] = { bonus, proficient: prof };
  }

  // Skills (definition lists + chosen decision proficiencies/expertise).
  const profSet = new Set([
    ...resolved.definition.skills.proficient,
    ...(resolved.background?.skill_proficiencies ?? []),
    ...chosenProfs.skills,
    ...featureEffects.proficiencies.skills,
  ]);
  const expSet = new Set([...resolved.definition.skills.expertise, ...chosenProfs.expertise]);
  const skills: DerivedStats["skills"] = {} as never;
  for (const skill of ALL_SKILLS) {
    const skillKey = skillSlugFromDisplay(skill);
    const ab = SKILL_ABILITY[skillSlugToAbilityLookup(skillKey)] as Ability;
    const override = overrides.skills?.[skillKey];
    const tri: ProficiencyTri = override?.proficiency
      ?? (expSet.has(skillKey) ? "expertise"
        : profSet.has(skillKey) ? "proficient"
        : "none");
    const bonus = override?.bonus ?? (skillBonus(scores[ab], tri, proficiencyBonus) + conditionEffects.d20_test_penalty);
    (skills as Record<string, { bonus: number; proficiency: ProficiencyTri; ability: Ability }>)[skillKey] = {
      bonus,
      proficiency: tri,
      ability: ab,
    };
  }

  // Passives
  const perceptionTri = skills.perception.proficiency;
  const investigationTri = skills.investigation.proficiency;
  const insightTri = skills.insight.proficiency;
  const passives = {
    perception: overrides.passives?.perception ?? passivePerception(scores.wis, perceptionTri, proficiencyBonus),
    investigation: overrides.passives?.investigation ?? passive(scores.int, investigationTri, proficiencyBonus),
    insight: overrides.passives?.insight ?? passive(scores.wis, insightTri, proficiencyBonus),
  };

  // HP (P5): dice component is the recorded rolled sum when present, else the
  // PHB-average sum; modifier is a user-entered in-game adjustment. The >=1
  // clamp applies to dice+CON exactly as multiclassMaxHP always did; max(0,...)
  // floors the degenerate negative-total case (spec #2 exception).
  const hpRolled = overrides.hp?.rolled ?? null;
  const hpModifier = overrides.hp?.modifier ?? null;
  const averageDiceSum = hitDiceAverageSum(resolved.classes);
  const conLevels = hpLevelCount(resolved.classes);
  const diceSum = hpRolled ?? averageDiceSum;
  const diceConRaw = diceSum + mods.con * conLevels;
  const diceConClamped = Math.max(1, diceConRaw);
  const hpMaxDerived = diceConClamped
    + featureEffects.hp_per_level_bonus * totalLevel
    + (hpModifier ?? 0);
  const hpMaxAfterConditions = Math.max(0, Math.floor(hpMaxDerived * conditionEffects.hp_max_multiplier));
  const hpMax = overrides.hp?.max ?? hpMaxAfterConditions;
  const hpBreakdown: HPBreakdown = {
    diceSum,
    diceSource: hpRolled != null ? "rolled" : "average",
    averageDiceSum,
    conMod: mods.con,
    conLevels,
    clampApplied: diceConClamped !== diceConRaw,
    perLevelTerms: featureEffects.hp_per_level_terms.map((t) => ({
      label: t.label, perLevel: t.value, levels: totalLevel, total: t.value * totalLevel,
    })),
    modifier: hpModifier,
    exhaustionMultiplier: conditionEffects.hp_max_multiplier,
    exhaustionLevel: conditionEffects.exhaustion_level,
    derivedMax: hpMaxAfterConditions,
    override: overrides.hp?.max ?? null,
    final: hpMax,
  };

  // AC + attacks (Pass B). Falls back to unarmored when no registry available.
  //
  // Bug fix: when no armor is equipped, the previous code returned the bare
  // unarmored AC and discarded `derivedEquipment.ac` entirely — so magic-item
  // AC bonuses (Bracers of Defense, Cloak of Protection, Ring of Protection)
  // never applied to an unarmored character. We now layer the equipment-derived
  // item/override AC contributions on top of the unarmored base, while still
  // dropping armor/shield/dex contributions from the equipment breakdown
  // (there's no armor, and the unarmored base already includes its own DEX).
  // Feature ac-bonus terms: requires_armor terms only count when armor is
  // actually equipped (the structured gate for Defense's "while wearing armor").
  const featureAcTermsFor = (hasArmor: boolean): ACTerm[] =>
    featureEffects.ac_terms
      .filter((t) => !t.requires_armor || hasArmor)
      .map((t) => ({ source: t.label, amount: t.value, kind: "feature" as const }));
  const sumTerms = (terms: ACTerm[]): number => terms.reduce((s, t) => s + t.amount, 0);

  // Resolve the weapon-ability overrides (Hexblade "Lies", MCDM scoped "Lies",
  // etc.) for attacks. The fold (computeFeatureEffects) captured every concrete
  // override with its (possibly scoped) weapon slugs; a "spellcasting" override
  // is resolved here against the primary caster ability (the spellcasting block
  // proper is computed below, but the ability only needs the resolved classes —
  // no slot/DC machinery). Spread-COPY so we never mutate the totals array.
  const weaponAbilities = [...featureEffects.weaponAbilities];
  const wantsSpellcasting = resolved.features.some((rf) =>
    selfEffectsOf(rf.feature).some((e) => e.kind === "weapon-ability" && e.ability === "spellcasting"));
  // A "spellcasting" override resolves to a GLOBAL caster ability and is
  // PREPENDED so it wins over concrete globals (preserving the prior
  // spellcasting-wins precedence). A scoped concrete override still wins for its
  // own weapon (scoped beats global downstream in attackAbility).
  if (wantsSpellcasting) {
    let primaryCasterAbility: Ability | null = null;
    for (const c of resolved.classes) {
      if (!c.entity) continue;
      const profile = resolveSpellcasting(c);
      if (profile) {
        primaryCasterAbility = effectiveSpellcastingAbility(c.entity.slug, profile.ability, overrides);
        break;
      }
    }
    if (primaryCasterAbility) weaponAbilities.unshift({ ability: primaryCasterAbility });
  }

  let derivedEquipment: DerivedEquipment | null = null;
  let acDerived: number;
  let acBreakdownDerived: ACTerm[] = [];
  let acInformationalDerived: InformationalBonus[] = [];
  if (registry) {
    // `?? []` coalesce is the recalc read boundary for the mastery gate: the
    // resolver always sets weaponMasteries, but untypechecked test fixtures may
    // omit it — never thread `undefined` into the `.includes` gate downstream.
    derivedEquipment = computeSlotsAndAttacks(resolved, mods, profsForApply, registry, warnings, proficiencyBonus, weaponAbilities, resolved.weaponMasteries ?? []);
    if (derivedEquipment.equippedSlots.armor) {
      const featTerms = featureAcTermsFor(true);
      acDerived = derivedEquipment.ac + sumTerms(featTerms);
      acBreakdownDerived = [...derivedEquipment.acBreakdown, ...featTerms];
      acInformationalDerived = derivedEquipment.acInformational;
    } else {
      const { total: unarmored, terms: unarmoredTerms } = unarmoredACBreakdown(resolved, mods, warnings);
      // Pull additive contributions that stand alone without body armor: item
      // bonuses, per-entry overrides, AND a shield (RAW: a shield grants +2 even
      // when unarmored). The `armor`/`dex` terms are skipped — there's no body
      // armor, and the unarmored base already incorporates DEX (and class
      // unarmored defense).
      const additive = derivedEquipment.acBreakdown.filter(
        (b) => b.kind === "item" || b.kind === "override" || b.kind === "shield",
      );
      const featTerms = featureAcTermsFor(false);
      const additiveSum = additive.reduce((sum, b) => sum + b.amount, 0);
      acDerived = unarmored + additiveSum + sumTerms(featTerms);
      acBreakdownDerived = [...unarmoredTerms, ...additive, ...featTerms];
      // Magic items still source these conditional AC bonuses even on the
      // unarmored path (the additive merge above already includes their
      // numeric contributions); carry the situational pool through.
      acInformationalDerived = derivedEquipment.acInformational;
    }
  } else {
    const { total, terms } = unarmoredACBreakdown(resolved, mods, warnings);
    const featTerms = featureAcTermsFor(false);
    acDerived = total + sumTerms(featTerms);
    acBreakdownDerived = [...terms, ...featTerms];
  }
  const ac = overrides.ac ?? acDerived;

  // Speed. A `speed-bonus` with `set:true` is an absolute walk FLOOR (e.g.
  // "your base speed becomes 60"): Math.max against the additive total, so it
  // raises a slower race but never lowers an already-higher speed.
  const additiveSpeed = speedFromRace(resolved) + applied.speed_bonuses.walk + featureEffects.speed_walk_bonus;
  const baseSpeed = Math.max(featureEffects.speed_walk_set, additiveSpeed);
  const adjustedSpeed = (baseSpeed * conditionEffects.speed_multiplier) - conditionEffects.speed_reduction_ft;
  const conditionSpeed = conditionEffects.speed_floor_zero ? 0 : Math.max(0, Math.floor(adjustedSpeed));
  const speed = overrides.speed ?? conditionSpeed;
  if (!resolved.race) warnings.push("No race resolved; speed defaulted to 30.");

  // Initiative
  const init = overrides.initiative
    ?? (initiativeBonus(mods.dex, resolved.feats, resolved.definition.edition) + featureEffects.initiative_bonus);

  // Senses: race vision vs feature-effect senses — larger wins per type.
  const senses: DerivedStats["senses"] = {
    darkvision: Math.max(resolved.race?.vision?.darkvision ?? 0, featureEffects.senses.darkvision, applied.senses.darkvision),
    blindsight: Math.max(featureEffects.senses.blindsight, applied.senses.blindsight),
    tremorsense: Math.max(featureEffects.senses.tremorsense, applied.senses.tremorsense),
    truesight: Math.max(featureEffects.senses.truesight, applied.senses.truesight),
  };

  // Spellcasting (per class, multiclass-aware). Data-driven: each class's caster
  // type / ability / preparation / table come from its (or its subclass's)
  // spellcasting block via resolveSpellcasting — no hardcoded class knowledge.
  const spellcastingClasses: SpellcastingClassInfo[] = [];
  const slotInputs: CasterClassInput[] = [];
  const limitInputs: LimitClassInput[] = [];
  for (const c of resolved.classes) {
    if (!c.entity) continue;
    const profile = resolveSpellcasting(c);
    if (!profile) continue;
    const ab = effectiveSpellcastingAbility(c.entity.slug, profile.ability, overrides);
    const dc = saveDC(scores[ab], proficiencyBonus) + applied.spell_save_dc;
    const atk = attackBonus(scores[ab], proficiencyBonus) + applied.spell_attack;
    spellcastingClasses.push({
      classSlug: c.entity.slug,
      className: c.entity.name,
      ability: ab,
      defaultAbility: profile.ability,
      saveDC: dc,
      attackBonus: atk,
      casterType: profile.casterType,
      preparation: profile.preparation,
    });
    slotInputs.push({ casterType: profile.casterType, level: c.level });
    limitInputs.push({ classSlug: c.entity.slug, level: c.level, profile, abilityScore: scores[ab] });
  }

  // Back-compat single object: first casting class (or null).
  const spellcasting: DerivedStats["spellcasting"] = spellcastingClasses.length > 0
    ? {
        ability: spellcastingClasses[0].ability,
        saveDC: spellcastingClasses[0].saveDC,
        attackBonus: spellcastingClasses[0].attackBonus,
      }
    : null;

  // Own-ability spellcasting: feat-granted spells (Magic Initiate etc.) carry
  // their OWN spellcasting ability and are not owned by a class (classSlug null).
  // Compute a per-ability DC/attack for every ability such a spell uses, with the
  // SAME helpers as the per-class path above. This is deliberately NOT gated on a
  // class caster existing: a non-caster (empty spellcastingClasses) with a feat
  // spell still gets a real DC/attack (R2/R3-M9). Only spells carrying `ability`
  // (feat spells) contribute; class spells derive their ability from classSlug.
  const abilitySpellcasting: DerivedStats["abilitySpellcasting"] = {};
  for (const s of resolved.spells) {
    const ab = s.ability;
    if (!ab || abilitySpellcasting[ab]) continue;
    abilitySpellcasting[ab] = {
      saveDC: saveDC(scores[ab], proficiencyBonus) + applied.spell_save_dc,
      attackBonus: attackBonus(scores[ab], proficiencyBonus) + applied.spell_attack,
    };
  }

  const derivedSlots = deriveSpellSlots(slotInputs);
  const spellLimits: SpellLimitInfo[] = computeSpellLimits(limitInputs);

  // `immunities` / `vulnerabilities` pass [] for grants: no feature-effect source exists for them.
  // `suppress` is the ONLY consumer of `overrides.defenses`: it subtracts, per bucket, every composed
  // entry whose canonical value a note listed under `remove`. It runs AFTER the merge on purpose:
  // suppressing before it would let a weaker source silently resurrect a value the note removed.
  const defenses = {
    resistances: suppress(resolved, "resistances", composeDefenseEntries(
      resolved.definition.defenses?.resistances ?? [],
      applied.defenses.resistances,
      featureEffects.resistances,
    )),
    immunities: suppress(resolved, "immunities", composeDefenseEntries(
      resolved.definition.defenses?.immunities ?? [],
      applied.defenses.immunities,
      [],
    )),
    vulnerabilities: suppress(resolved, "vulnerabilities", composeDefenseEntries(
      resolved.definition.defenses?.vulnerabilities ?? [],
      applied.defenses.vulnerabilities,
      [],
    )),
    condition_immunities: suppress(resolved, "condition_immunities", composeDefenseEntries(
      resolved.definition.defenses?.condition_immunities ?? [],
      applied.defenses.condition_immunities,
      featureEffects.condition_immunities,
    )),
  };

  return {
    totalLevel,
    proficiencyBonus,
    scores,
    mods,
    saves,
    proficiencies: profsForApply,
    skills,
    passives,
    senses,
    hp: {
      max: hpMax,
      current: resolved.state.hp.current,
      temp: resolved.state.hp.temp,
    },
    hpBreakdown,
    ac,
    speed,
    initiative: init,
    spellcasting,
    spellcastingClasses,
    abilitySpellcasting,
    derivedSpellSlots: derivedSlots.standard,
    pactMagic: derivedSlots.pact,
    spellLimits,
    warnings,
    defenses,
    acBreakdown: acBreakdownDerived,
    acInformational: acInformationalDerived,
    savesInformational,
    spellcastingInformational,
    speedInformational,
    // Always ≥ 1; non-stacking (Math.max) extra attacks fold in pc.feature-effects.
    attacksPerAction: 1 + featureEffects.extraAttack,
    // Consolidated post-apply over the built attack rows: the d20 condition
    // penalty (always), plus display-only annotations conditionally spread so
    // untouched rows keep `critRange`/`attackNotes` ABSENT (not 20 / not []).
    // crit-range: folded weapon crit threshold, only when an effect lowered it.
    // attackNotes: reroll-damage / attack-rule captions, only when non-empty.
    attacks: (derivedEquipment?.attacks ?? []).map((a) => {
      const riders = [...(a.damageRiders ?? []), ...featureEffects.damageBonuses];
      return {
        ...a,
        toHit: a.toHit + conditionEffects.d20_test_penalty,
        ...(featureEffects.critRange < 20 ? { critRange: featureEffects.critRange } : {}),
        ...(featureEffects.attackNotes.length ? { attackNotes: featureEffects.attackNotes } : {}),
        ...(riders.length ? { damageRiders: riders } : {}),
      };
    }),
    equippedSlots: derivedEquipment?.equippedSlots ?? {},
    carriedWeight: derivedEquipment?.carriedWeight ?? 0,
    attunementUsed: derivedEquipment?.attunementUsed ?? 0,
    attunementLimit: derivedEquipment?.attunementLimit ?? (overrides.attunement_limit ?? 3),
    conditionEffects,
    rollModifiers: featureEffects.rollModifiers,
  };
}
