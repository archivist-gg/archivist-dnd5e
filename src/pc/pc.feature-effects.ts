import type { FeatureEffect, SenseType } from "@archivist-gg/dnd5e/types/feature-effect";
import type { Ability } from "@archivist-gg/dnd5e";
// R4-G3a §6.2.3: ABILITY_NAME_TO_KEY / normalizeAbility were PRIVATE here; they moved to
// dnd/constants.ts so roll-scope.ts can share the one vocabulary (no second copy, no cycle:
// src/dnd/* imports nothing from src/pc/*).
import { normalizeAbility } from "@archivist-gg/dnd5e/dnd/constants";
import { warnOnce } from "@archivist-gg/dnd5e/dnd/warn-once";
import type { DamageRider, DefenseGrant, FeatureSource, ResolvedCharacter, ResolvedFeature, ResolvedPool, RollKind, RollModifierEntry, SaveOutcomeEntry } from "./pc.types";
import type { OptionalFeatureEntity } from "@archivist-gg/dnd5e/types/optional-feature.types";
import { bareEntitySlug } from "../entities/slug";
import { toProfSlug } from "./pc.proficiency-normalize";
import { normalizeRollScope } from "./roll-scope";

/**
 * A melee-attack ability override from a `weapon-ability` effect. `weaponSlugs`
 * (bare, namespace-stripped) scopes the override to matching weapon types only;
 * empty/absent `weaponSlugs` = GLOBAL (applies to every melee weapon). The
 * `"spellcasting"` sentinel is NOT stored here — it is resolved against the
 * caster ability in recalc and prepended as a global.
 */
export interface WeaponAbilityOverride {
  ability: Ability;
  weaponSlugs?: string[];
}

/**
 * Aggregated passive feature effects (effects-application engine).
 * One pure scan over resolved.features[].feature.effects[]. Merge semantics
 * mirror pc.conditions mergePartial: numbers add, each sense range takes max,
 * lists union case-insensitively. apply-condition is action time and
 * intentionally not aggregated; `damage-bonus` folds into damageBonuses (additive
 * on-hit riders); `while`-gated immune-condition entries are skipped entirely
 * (conditional effects are a named deferral).
 */
export interface FeatureEffectTotals {
  initiative_bonus: number;
  hp_per_level_bonus: number;
  /** One term per hp-per-level-bonus effect, labeled with the owning feature's name. */
  hp_per_level_terms: { label: string; value: number }[];
  speed_walk_bonus: number;
  /**
   * Absolute walk-speed FLOOR from `speed-bonus` effects with `set:true` (e.g.
   * a "base speed becomes 60" feature). Max across all set effects; 0 = none.
   * recalc applies it as Math.max(set, race + additive bonuses) so it never
   * lowers an already-higher speed and is independent of the additive bonus.
   */
  speed_walk_set: number;
  /** Max range per sense type granted by effects; 0 = none for that type. */
  senses: Record<SenseType, number>;
  /** One term per ac-bonus effect, labeled with the owning feature's name. `condition` is the
   *  effect's situational qualifier, carried verbatim onto the ACTerm and never evaluated. */
  ac_terms: { value: number; requires_armor: boolean; label: string; condition?: string }[];
  /**
   * The four defense buckets a feature effect can grant, as DefenseGrant ENTRIES (R4-G3a §3.2.1).
   * Deduped by value case-insensitively, first spelling wins, trimmed · exactly the contract
   * `pushUnique` had when these were `string[]` · but the SECOND granting feature's NAME is merged
   * into `sources` rather than discarded. `immunity` and `vulnerability` fold REGARDLESS of
   * `condition` (following `resistance`: dropping a real immunity is worse than showing it
   * unqualified); `immune-condition` keeps its `while` skip. Values stay in the AUTHORED spelling ·
   * toDefenseSlug runs in pc.recalc.ts, where composeDefenseEntries turns these into DefenseEntry.
   */
  resistances: DefenseGrant[];
  immunities: DefenseGrant[];
  vulnerabilities: DefenseGrant[];
  condition_immunities: DefenseGrant[];
  /**
   * skills, tools and languages are canonical slugs (toProfSlug: lowercase, U+2019
   * folded to ASCII, whitespace collapsed to hyphens). armor and weapons entries
   * are only `.toLowerCase()`d, NOT slugified, so an authored value keeps its
   * spaces. recalc folds armor into armor.categories ONLY; it folds every weapons
   * value into weapons.categories and additionally routes a non-category value
   * into weapons.specific. saves are canonical ability keys, and are the one
   * bucket a closed vocabulary genuinely guarantees: normalizeAbility returns null
   * for anything else and the effect is dropped.
   *
   * What is INTENDED and what is ENFORCED differ here, and the gap is silent.
   * INTENDED: skills/tools/languages land on ALL_SKILL_SLUGS / ALL_TOOLS /
   * ALL_LANGUAGES, over which toProfSlug is the identity; armor values are
   * CATEGORY words ("heavy"/"shield"); weapons values are a category word
   * ("simple"/"martial", or an entity-level "martial-melee" form) or an authored
   * weapon NAME. ENFORCED at runtime: nothing. feature-effect-schema's proficiency
   * arm is `value: z.string().min(1)`, an OPEN string, and classifyProficiencyEffect
   * does no membership test. The only guard is
   * tests/srd-canonical/overlay-effect-slugs.test.ts, and it sees OVERLAY-AUTHORED
   * data only · there skill/tool/language are checked against those three lists and
   * weapon against the live gate, while armor and saving-throw are unchecked even
   * there. Vault homebrew reaching this at runtime is checked by nothing.
   *
   * An off-vocabulary value does not crash and does not disappear · it becomes a
   * value that can never coincide with the canonical one. Measured: an authored
   * `{proficiency_type:"tool", value:"Playing Card Set"}` normalizes to
   * "playing-card-set", which is NOT in ALL_TOOLS (that list carries the 2024
   * spelling "playing-cards"). It still folds, and still renders as its own row
   * labeled "Playing Card Set", but everything keyed on the canonical slug · the
   * first-seen-wins dedupe in computeEffectiveProficiencies, an
   * `overrides.tools.remove` suppression, the builder's already-satisfied
   * exclusion · misses it, so the character ends up able to hold both.
   *
   * `skillExpertise` is NOT a seventh bucket · it is a SUBSET of `skills`, in the
   * same canonical slug form, carrying the values whose effect set
   * `expertise: true`. An expertise skill is pushed to BOTH, so every consumer
   * that only knows about proficiency keeps working and recalc's `expSet` gains
   * one source. SKILLS ONLY (spec §7.2): a tool or language effect carrying
   * `expertise: true` folds as a plain proficiency and never lands here, because
   * nothing in the product has a tool or language tri-state to render it with.
   */
  proficiencies: { skills: string[]; skillExpertise: string[]; tools: string[]; languages: string[]; saves: Ability[]; armor: string[]; weapons: string[] };
  /**
   * Melee-attack ability overrides (Hexblade "Lies", MCDM Illrigger scoped
   * "Lies", etc.), in fold order. Each carries an optional `weaponSlugs` scope
   * (bare slugs) — absent/empty = GLOBAL (every melee weapon). The
   * `"spellcasting"` sentinel is excluded here (no caster context in the fold);
   * recalc resolves it and prepends the resolved global so it wins over concrete
   * globals. recalc threads this list into attack computation, where a
   * scoped-match wins over a global for the matching weapon. [] = no override.
   */
  weaponAbilities: WeaponAbilityOverride[];
  /**
   * Order-preserving list of structured advantage/disadvantage entries from
   * `roll-modifier` effects. Pass-through (no dedupe/merge); each entry is
   * labeled with the owning feature's name.
   */
  rollModifiers: RollModifierEntry[];
  /**
   * Order-preserving list of `save-outcome` entries (R4-G3a §5.3), labeled with the owning
   * feature's name. Pass-through (no dedupe/merge); `ability: "any"` becomes an ABSENT ability,
   * which the save chip reads as "every save".
   */
  saveOutcomes: SaveOutcomeEntry[];
  /**
   * Lowest weapon-attack crit threshold (natural roll that scores a critical
   * hit) granted by `crit-range` effects. Folds via Math.min from init 20, so
   * 20 = no expansion. spell-only (`applies_to:"spell"`) entries do NOT lower
   * it. recalc maps this onto each AttackRow as `critRange` only when < 20.
   */
  critRange: number;
  /**
   * Max extra attacks per Attack action granted by `extra-attack` effects.
   * Non-stacking (D&D Extra Attack features don't stack): folds via Math.max
   * from init 0, so 0 = no extra attacks. recalc maps this onto
   * DerivedStats.attacksPerAction as `1 + extraAttack`.
   */
  extraAttack: number;
  /**
   * Order-preserving display-only captions surfaced from `reroll-damage` and
   * `attack-rule` effects (e.g. "Reroll 2s", "No disadvantage firing in melee").
   * recalc post-applies this list onto each AttackRow as `attackNotes` only when
   * non-empty, so untouched attack rows keep `attackNotes: undefined`.
   */
  attackNotes: string[];
  /**
   * Additive on-hit damage riders from `damage-bonus` effects with
   * `applies_to` weapon/all (spell-only ignored — no spell surface). Each is
   * labeled with the owning feature's name. recalc merges these onto every
   * weapon AttackRow's `damageRiders`.
   */
  damageBonuses: DamageRider[];
}

export function emptyFeatureEffectTotals(): FeatureEffectTotals {
  return {
    initiative_bonus: 0,
    hp_per_level_bonus: 0,
    hp_per_level_terms: [],
    speed_walk_bonus: 0,
    speed_walk_set: 0,
    senses: { darkvision: 0, blindsight: 0, tremorsense: 0, truesight: 0 },
    ac_terms: [],
    resistances: [],
    immunities: [],
    vulnerabilities: [],
    condition_immunities: [],
    proficiencies: { skills: [], skillExpertise: [], tools: [], languages: [], saves: [], armor: [], weapons: [] },
    weaponAbilities: [],
    rollModifiers: [],
    saveOutcomes: [],
    critRange: 20,
    extraAttack: 0,
    attackNotes: [],
    damageBonuses: [],
  };
}

function pushUnique(list: string[], value: string): void {
  const key = value.trim().toLowerCase();
  if (!key) return;
  if (!list.some((v) => v.trim().toLowerCase() === key)) list.push(value.trim());
}

/**
 * `pushUnique` for the four defense buckets, now that they hold DefenseGrant entries (R4-G3a §3.2.1).
 *
 * The dedupe contract is UNCHANGED · keyed on the trimmed, case-folded value, first spelling wins,
 * stored trimmed · so "Fire" then "fire" is still one entry spelled "Fire".
 *
 * What is NOT the same: the second feature's NAME is MERGED into `sources` instead of being dropped
 * with the duplicate value. That matters because computeFeatureEffects folds EVERY feature into ONE
 * `out`: discarding here would lose the second granting feature before composeDefenseEntries in
 * pc.recalc.ts ever saw it, and the chip would credit only the first. `condition` is first-wins for
 * the same reason a duplicate value is · it is a display qualifier, not a rule the engine evaluates.
 */
function pushDefenseGrant(list: DefenseGrant[], value: string, source: string, condition?: string): void {
  const key = value.trim().toLowerCase();
  if (!key) return;
  const existing = list.find((g) => g.value.trim().toLowerCase() === key);
  if (existing) {
    if (!existing.sources.includes(source)) existing.sources.push(source);
    if (!existing.condition && condition) existing.condition = condition;
    return;
  }
  list.push({ value: value.trim(), sources: [source], ...(condition ? { condition } : {}) });
}

/**
 * Optional fold inputs. `activeBuffs` is the set of currently-toggled buff
 * ids/slugs (from Character.state.active_buffs + selected pool boons). An
 * `activatable` feature's effects fold ONLY while its id is in this set; a buff
 * is OFF by default, so callers passing no opts see activatable features fold to
 * nothing (correct — a buff is off until toggled). Non-activatable features fold
 * unconditionally regardless of opts.
 */
export interface FeatureEffectsOpts {
  activeBuffs?: Set<string>;
}

/** Does this feature's effects fold right now? An activatable feature folds ONLY
 *  while its id is in the active set; a buff is off until toggled. Shared by
 *  computeFeatureEffects and the display-side proficiency collector so the fold
 *  and the display can never disagree about boons (spec fence F3). */
export function foldsNow(rf: ResolvedFeature, activeBuffs: Set<string>): boolean {
  if (rf.feature.activatable !== true) return true;
  const id = rf.feature.id;
  return !!id && activeBuffs.has(id);
}

/** The ONE assembly of everything whose effects fold: authored features plus
 *  pool-granted and pool-selected boons, with the active-buff set.
 *
 *  Returning BOTH halves is load-bearing: a caller handed only the feature list
 *  would drop activeBuffs and computeFeatureEffects would skip every activatable
 *  boon · exactly the display/gate divergence this helper exists to close.
 *
 *  The guards defend against CAST-BUILT FIXTURES, not against the type: `features`,
 *  `pools` and `state` are all non-optional on ResolvedCharacter, but `tests/` is
 *  typechecked by nothing. Only fixtures that actually reach this function count,
 *  and today that is THREE entry points: recalc, the display-side walk
 *  (computeEffectiveProficiencies → collectProficiencyGrants), and this
 *  function's own direct tests. All three guards are LIVE. Counts below were
 *  measured by deleting each guard and running the suite · re-derive them the
 *  same way rather than trusting the numbers, which drift as tests are added:
 *    · `pools ?? []` is exercised by `emptyResolved()` in
 *      tests/pc-recalc-feature-effects.test.ts, which omits pools and IS fed to
 *      recalc, and by `dwarf()` in tests/pc-proficiency-effective.test.ts. This
 *      guard predates the extraction; it was already here. Deleting it: 149 tests
 *      red across 13 files.
 *    · `state?.` is exercised by the "survives a cast-built fixture with no pools
 *      and no state" case in tests/pc-feature-effects.test.ts, which calls this
 *      function directly with `{ features: [...] } as never`, and again by
 *      `dwarf()`. Deleting it: 11 red across 2 files.
 *    · `features ?? []` is exercised by `dwarf()` in
 *      tests/pc-proficiency-effective.test.ts, which omits `features` and reaches
 *      here through the display walk. Deleting it: 7 red, all in that file.
 *      ⚠️ This bullet used to read "NOT exercised today, and is the one kept
 *      purely for the display-side callers". That was TRUE when written and was
 *      falsified LATER IN THIS SAME PHASE by the tasks that wired the display
 *      path, because nobody re-read it. A guard's own justification is the thing
 *      most likely to go stale under you · re-run the deletion before restating
 *      any of these three.
 *  Do not "simplify" any of the three away. */
export function assembleEffectFeatures(
  resolved: ResolvedCharacter,
): { features: ResolvedFeature[]; activeBuffs: Set<string> } {
  const activeBuffs = new Set(resolved.state?.active_buffs ?? []);
  const buffFeatures: ResolvedFeature[] = [];
  const pushBoon = (item: { slug: string; entity?: OptionalFeatureEntity | null }, pool: ResolvedPool): void => {
    const e = item.entity;
    if (!e || (e.effects?.length ?? 0) === 0) return;
    buffFeatures.push({
      feature: { id: item.slug, name: e.name, activatable: e.activatable ?? false, effects: e.effects },
      // source is inert for the fold; attribute to the pool's owning class
      // (never a hardcoded class) so the generic engine carries no homebrew name.
      source: { kind: "class", slug: resolved.classes?.[pool.classIndex]?.entity?.slug ?? pool.id, level: pool.anchorLevel },
    });
  };
  for (const pool of resolved.pools ?? []) {
    for (const sel of pool.selected ?? []) pushBoon(sel, pool);
    for (const g of pool.grants ?? []) pushBoon(g, pool);
  }
  return { features: [...(resolved.features ?? []), ...buffFeatures], activeBuffs };
}

/** Spec R4-G1a D2. Whether an effect changes the character it is written on. `subject` is absent on every SRD
 *  effect (=== "self"); the converter emits "self" today and will emit other creatures later (Hound of Ill Omen
 *  imposes disadvantage on a TARGET). A non-self effect never folds onto the PC: not here, not in
 *  collectProficiencyEffectGrants, not in unarmoredACBreakdown, not in recalc's weapon-ability scan. Its FEATURE
 *  still resolves and renders (it is not buildOnly); R4-G3a §4 gives it a row-local caption.
 *
 *  R4-G3a §4.4: a subject that is neither absent nor "self" warns ONCE per distinct subject string
 *  (`warnOnce`, keyed on the subject). The converter's vocabulary here is open, so an unexpected
 *  spelling ("Self", "target creature") silently stops folding today; the warning names it without
 *  changing the answer. Never a refusal: the return value is unchanged. */
export function foldsOnSelf(eff: { subject?: string }): boolean {
  if (eff.subject === undefined || eff.subject === "self") return true;
  warnOnce(eff.subject, `archivist: unrecognised effect subject "${eff.subject}" (only "self" folds)`);
  return false;
}
/** The effects of a feature that fold on the character: every reader of `feature.effects` for a derived stat goes through this. */
export function selfEffectsOf(f: { effects?: FeatureEffect[] }): FeatureEffect[] {
  return (f.effects ?? []).filter(foldsOnSelf);
}

export function computeFeatureEffects(
  features: ResolvedFeature[],
  opts?: FeatureEffectsOpts,
): FeatureEffectTotals {
  const out = emptyFeatureEffectTotals();
  for (const rf of features) {
    // Activatable-buff gating lives in foldsNow (the one shared predicate); no
    // opts means an empty active set, so a buff is off by default.
    if (!foldsNow(rf, opts?.activeBuffs ?? new Set())) continue;
    for (const eff of selfEffectsOf(rf.feature)) {
      applyEffect(out, eff, rf.feature.name ?? "Feature");
    }
  }
  return out;
}

/** The ONE interpreter of `kind: "proficiency"` effects (spec fence F3).
 *
 *  Two consumers with different needs, so the return carries BOTH forms:
 *  `applyEffect` pushes `value` (normalized) into FeatureEffectTotals, while the
 *  display collector reads `raw` for armor/weapons · composeGrantEntries stores
 *  the raw authored string as ProficiencyEntry.value (spec §4.8 #1) and computes
 *  its dedupe key separately. Tools/languages read `value`.
 *
 *  `saves` is discriminated because FeatureEffectTotals.proficiencies.saves is
 *  Ability[], not string[] (fence F1). A null return means "not a proficiency
 *  effect, or an unresolvable ability".
 *
 *  `expertise` is REQUIRED and always a boolean, never absent: the authored key
 *  is optional, so folding it here once means no consumer has to tell
 *  `undefined` from `false`. It is reported for EVERY bucket · deciding that
 *  only skills act on it belongs to the fold (spec §7.2), not to the
 *  classification. */
export type ProficiencyClassification =
  | { bucket: "skills" | "tools" | "languages" | "armor" | "weapons"; value: string; raw: string; expertise: boolean }
  | { bucket: "saves"; value: Ability; raw: string; expertise: boolean };

export function classifyProficiencyEffect(eff: FeatureEffect): ProficiencyClassification | null {
  if (eff.kind !== "proficiency") return null;
  const raw = eff.value;
  const expertise = eff.expertise === true;
  switch (eff.proficiency_type) {
    case "skill":
      return { bucket: "skills", value: toProfSlug(raw), raw, expertise };
    case "tool":
      return { bucket: "tools", value: toProfSlug(raw), raw, expertise };
    case "language":
      return { bucket: "languages", value: toProfSlug(raw), raw, expertise };
    case "armor":
      // Armor grants are CATEGORIES ("heavy"/"shield"), not per-item slugs: recalc
      // folds them into proficiencies.armor.categories only. Armor is deliberately
      // NOT routed to .specific · nothing in the product gates on armor proficiency.
      // Stored lowercase (bare word) to match the form class/race/feat grants use;
      // the matcher compares them against armor.category.
      return { bucket: "armor", value: raw.toLowerCase(), raw, expertise };
    case "weapon":
      // Weapon grants are EITHER a category word ("simple"/"martial", or an
      // entity-level "martial-melee" form) OR an authored weapon NAME. Stored
      // lowercase (bare word) to match the form class/race/feat grants use; recalc
      // folds every value into weapons.categories (matched against
      // weapon.category's base, "martial-melee" → "martial") and ADDITIONALLY
      // routes a non-category value into weapons.specific.
      // `.specific` holds per-item identifiers AND authored weapon names · the gate
      // matches it by slug equality or normKey against weapon.name, so a display
      // spelling like "battleaxes" resolves. Category words stay out of it.
      return { bucket: "weapons", value: raw.toLowerCase(), raw, expertise };
    default: {
      const ab = normalizeAbility(raw);
      return ab ? { bucket: "saves", value: ab, raw, expertise } : null;
    }
  }
}

/** One proficiency an effect grants, tagged with the source it came from.
 *
 *  BOTH forms are carried because the two display consumers need different ones
 *  and, since the tool/language canonicalization landed, they no longer coincide:
 *  armor/weapons read `raw` (composeGrantEntries stores the raw authored string
 *  as ProficiencyEntry.value and keys its dedupe on toProfSlug separately), while
 *  tools/languages read `value`, the canonical slug the effective-proficiency
 *  matcher matches its vocabulary and suppressions on. Reaching for the wrong
 *  field is silently wrong, not harmlessly identical.
 *
 *  `sourceSlug` is the source's slug VERBATIM (namespace and all), because the
 *  consumer resolves it against the resolved character's entities to get a
 *  display name. */
export interface EffectProficiencyGrant {
  value: string;
  raw: string;
  sourceKind: FeatureSource["kind"];
  sourceSlug: string;
  /**
   * Set (to `true`) only when the granting effect carried `expertise: true`, and
   * ABSENT otherwise, so a plain grant keeps the exact four-key shape the two
   * display consumers already read. Reported for every bucket, unlike the fold,
   * which routes skills only (spec §7.2) · a future tools/languages tri-state
   * would read this rather than re-deriving it from the raw effects.
   */
  expertise?: boolean;
}

export type EffectProficiencyGrants =
  Record<"skills" | "tools" | "languages" | "saves" | "armor" | "weapons", EffectProficiencyGrant[]>;

/** Every proficiency an effect grants, tagged with the FeatureSource it came from.
 *
 *  Deliberately NOT deduped: composeGrantEntries collects distinct SOURCES per
 *  value, so collapsing on value alone here would silently drop the second
 *  granting entity and blank half the provenance.
 *
 *  `skills` and `saves` are collected because classifyProficiencyEffect's bucket
 *  union has SIX members and this function indexes the record by it · drop either
 *  key and `out[c.bucket].push(...)` is a type error, and a hand-built record
 *  missing one crashes on the first such effect. They have NO display consumer:
 *  effect-granted skills already reach the sheet via recalc's skill union and
 *  saves via its save set, and the Proficiencies panel has only four rows. No
 *  test asserts either bucket, and `toGrants` in pc.proficiency-grants.ts reads
 *  only the other four. That is deliberate, not an oversight.
 *
 *  Reads the same three rules as the fold, and NOTHING else: foldsNow decides
 *  what is active, selfEffectsOf decides whose numbers an effect changes and
 *  classifyProficiencyEffect decides what a proficiency effect means (spec fence
 *  F3), so the display can never disagree with the engine.
 *
 *  Reads only effects that fold on self (`selfEffectsOf`), the same predicate as
 *  the fold, so a non-self proficiency is neither granted nor displayed. */
export function collectProficiencyEffectGrants(
  features: ResolvedFeature[],
  activeBuffs: Set<string>,
): EffectProficiencyGrants {
  const out: EffectProficiencyGrants = {
    skills: [], tools: [], languages: [], saves: [], armor: [], weapons: [],
  };
  for (const rf of features) {
    if (!foldsNow(rf, activeBuffs)) continue;
    for (const eff of selfEffectsOf(rf.feature)) {
      const c = classifyProficiencyEffect(eff);
      if (!c) continue;
      out[c.bucket].push({
        value: c.value, raw: c.raw, sourceKind: rf.source.kind, sourceSlug: rf.source.slug,
        ...(c.expertise ? { expertise: true } : {}),
      });
    }
  }
  return out;
}

function applyEffect(out: FeatureEffectTotals, eff: FeatureEffect, label: string): void {
  switch (eff.kind) {
    case "initiative-bonus":
      out.initiative_bonus += eff.value;
      break;
    case "hp-per-level-bonus":
      out.hp_per_level_bonus += eff.value;
      out.hp_per_level_terms.push({ label, value: eff.value });
      break;
    case "speed-bonus":
      // Only walk reaches DerivedStats.speed; other modes have no derived surface yet.
      // `set:true` is an absolute floor (e.g. "base speed becomes 60"), tracked
      // separately (max) from the additive bonus; recalc Math.max-es the two.
      if (eff.mode === "walk") {
        if (eff.set) out.speed_walk_set = Math.max(out.speed_walk_set, eff.value);
        else out.speed_walk_bonus += eff.value;
      }
      break;
    case "sense":
      out.senses[eff.type] = Math.max(out.senses[eff.type], eff.range);
      break;
    case "resistance":
      pushDefenseGrant(out.resistances, eff.damage_type, label, eff.condition);
      break;
    case "immunity":
      pushDefenseGrant(out.immunities, eff.damage_type, label, eff.condition);
      break;
    case "vulnerability":
      pushDefenseGrant(out.vulnerabilities, eff.damage_type, label, eff.condition);
      break;
    case "immune-condition":
      // `while` is the PAYLOAD-gating field here (a `while`-gated entry is a conditional immunity,
      // a named deferral), and `condition` is the immunity's own NAME · not a qualifier · so this
      // arm passes no condition through.
      if (!eff.while) pushDefenseGrant(out.condition_immunities, eff.condition, label);
      break;
    case "proficiency": {
      const c = classifyProficiencyEffect(eff);
      if (!c) break;
      if (c.bucket === "saves") {
        // pushUnique's trim/case-fold coincides exactly with the previous
        // `.includes` here: normalizeAbility only ever returns a canonical
        // lowercase key.
        pushUnique(out.proficiencies.saves as string[], c.value);
      } else {
        pushUnique(out.proficiencies[c.bucket], c.value);
      }
      // SKILLS ONLY (spec §7.2). The expertise skill is now in BOTH lists: the
      // plain push above keeps every proficiency-only consumer working, and this
      // one is the second membership recalc's `expSet` reads. Tools carry the
      // authored flag (the 2014 Rogue grants thieves'-tools expertise) but have
      // no tri-state anywhere in the product, so routing them here would put a
      // value in the skill-expertise set that no skill key can ever match.
      if (c.expertise && c.bucket === "skills") pushUnique(out.proficiencies.skillExpertise, c.value);
      break;
    }
    case "ac-bonus":
      out.ac_terms.push({
        value: eff.value, requires_armor: eff.requires_armor === true, label, condition: eff.condition,
      });
      break;
    case "weapon-ability": {
      // The "spellcasting" sentinel is resolved in recalc (the fold lacks caster
      // context) — never pushed here. For a concrete ability, capture its scope:
      // ABSENT or unresolved "chosen" (the resolver left the pick unfilled) stays
      // GLOBAL; a concrete slug/list scopes the override to those weapon types.
      // A plain-string `.map` would throw and `["chosen"]` would wrongly drop the
      // override, so guard both before mapping to bare slugs.
      if (eff.ability !== "spellcasting") {
        const w = eff.weapons;
        const weaponSlugs = !w || w === "chosen" ? undefined
          : Array.isArray(w) ? w.map(bareEntitySlug) : [bareEntitySlug(w)];
        out.weaponAbilities.push({ ability: eff.ability, weaponSlugs });
      }
      break;
    }
    case "roll-modifier": {
      // R4-G3a §6: the R-T1a guard that dropped 41 of the 227 corpus sites is GONE. All four
      // `mode` members fold with `mode` preserved (the plugin renders ADV / DIS / RR / +D4 from
      // ROLL_MODE_TAG); `roll: "any"` FANS OUT here into the three concrete roll types, so no
      // reader ever needs a fourth `roll` member; and a prose `scope` becomes one entry per
      // canonical value. `normalizeRollScope` returning undefined means "not a scope we map":
      // the RAW scope passes through and matches no chip, exactly as before (§6.2.3).
      const rolls: RollKind[] = eff.roll === "any" ? ["ability-check", "saving-throw", "attack"] : [eff.roll];
      const scopes: (string | undefined)[] = normalizeRollScope(eff.scope, rolls[0]) ?? [eff.scope];
      for (const roll of rolls) for (const scope of scopes)
        out.rollModifiers.push({ mode: eff.mode, roll, scope, condition: eff.condition, label });
      break;
    }
    case "save-outcome":
      // R4-G3a §5.3: display-only pass-through. `ability: "any"` maps to an ABSENT ability rather
      // than six duplicate entries: the save chip already reads an absent scope as "every chip".
      out.saveOutcomes.push({
        ability: eff.ability === "any" ? undefined : eff.ability,
        on_success: eff.on_success, on_failure: eff.on_failure,
        appliesTo: eff.applies_to ?? undefined, condition: eff.condition, label,
      });
      break;
    case "crit-range":
      // Lowest threshold across weapon/all crit-range effects wins. A spell-only
      // crit-range does NOT lower the weapon crit threshold (no spell surface here).
      if ((eff.applies_to ?? "weapon") !== "spell") out.critRange = Math.min(out.critRange, eff.min_roll);
      break;
    case "extra-attack":
      // Non-stacking: Extra Attack features don't add together (two count:1
      // effects → 1 extra attack, not 2). Highest count wins.
      out.extraAttack = Math.max(out.extraAttack, eff.count);
      break;
    case "reroll-damage":
      // Display-only caption. v1 does not filter by applies_to (unlike crit-range);
      // a spell-only reroll still surfaces a note here.
      out.attackNotes.push(`Reroll ${eff.max_reroll}s${eff.once_per_die ? " (once/die)" : ""}`);
      break;
    case "attack-rule":
      if (eff.flag === "no-ranged-in-melee-disadvantage") out.attackNotes.push("No disadvantage firing in melee");
      break;
    case "damage-bonus":
      // Additive on-hit damage rider (dice or flat string). weapon/all fold onto
      // weapon attack rows in recalc; spell-only has no surface yet. `condition`
      // is read but not evaluated in v1 (carried on the source's prose).
      if ((eff.applies_to ?? "weapon") !== "spell") {
        out.damageBonuses.push({ amount: eff.amount, damage_type: eff.damage_type, source: label });
      }
      break;
    default:
      // Six kinds fold nothing here, by design: apply-condition (display-only), unarmored-ac (inert HERE, live in
      // unarmoredACBreakdown), and FOUR of the seven R4-G1a arms (temp-hp, heal, ability-score-increase,
      // extra-action) · `immunity` and `vulnerability` left this arm in R4-G3a §3 and now fold into their own
      // defense buckets above, and `save-outcome` left it in §5.3 for its own case just above.
      // A non-self effect never reaches this switch at all (foldsOnSelf).
      break;
  }
}
