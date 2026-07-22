import type { FeatureEffect, SenseType } from "@archivist-gg/dnd5e/types/feature-effect";
import type { Ability } from "@archivist-gg/dnd5e";
import { ABILITY_KEYS } from "@archivist-gg/dnd5e/dnd/constants";
import type { DamageRider, ResolvedFeature, RollModifierEntry } from "./pc.types";
import { bareEntitySlug } from "../entities/slug";

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
  /** One term per ac-bonus effect, labeled with the owning feature's name. */
  ac_terms: { value: number; requires_armor: boolean; label: string }[];
  resistances: string[];
  condition_immunities: string[];
  /**
   * skills are kebab-case lowercase slugs (matching skill slugs). armor/weapons
   * are lowercase CATEGORY words ("heavy"/"shield", "simple"/"martial") — the
   * same form class/race/feat grants use; recalc folds them into the matcher's
   * `.categories` bucket, NOT `.specific` (which is per-item slugs). tools/languages
   * keep their display spelling; saves are canonical ability keys.
   */
  proficiencies: { skills: string[]; tools: string[]; languages: string[]; saves: Ability[]; armor: string[]; weapons: string[] };
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
    condition_immunities: [],
    proficiencies: { skills: [], tools: [], languages: [], saves: [], armor: [], weapons: [] },
    weaponAbilities: [],
    rollModifiers: [],
    critRange: 20,
    extraAttack: 0,
    attackNotes: [],
    damageBonuses: [],
  };
}

const ABILITY_NAME_TO_KEY: Record<string, Ability> = {
  strength: "str",
  dexterity: "dex",
  constitution: "con",
  intelligence: "int",
  wisdom: "wis",
  charisma: "cha",
};

function normalizeAbility(value: string): Ability | null {
  const k = value.trim().toLowerCase();
  if ((ABILITY_KEYS as readonly string[]).includes(k)) return k as Ability;
  return ABILITY_NAME_TO_KEY[k] ?? null;
}

function pushUnique(list: string[], value: string): void {
  const key = value.trim().toLowerCase();
  if (!key) return;
  if (!list.some((v) => v.trim().toLowerCase() === key)) list.push(value.trim());
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

export function computeFeatureEffects(
  features: ResolvedFeature[],
  opts?: FeatureEffectsOpts,
): FeatureEffectTotals {
  const out = emptyFeatureEffectTotals();
  for (const rf of features) {
    // Activatable buffs fold their effects only while toggled on (their id is in
    // the active set). Off by default — no opts / not in the set ⇒ skipped.
    if (rf.feature.activatable === true) {
      const id = rf.feature.id;
      if (!id || !opts?.activeBuffs?.has(id)) continue;
    }
    for (const eff of rf.feature.effects ?? []) {
      applyEffect(out, eff, rf.feature.name ?? "Feature");
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
      pushUnique(out.resistances, eff.damage_type);
      break;
    case "immune-condition":
      if (!eff.while) pushUnique(out.condition_immunities, eff.condition);
      break;
    case "proficiency": {
      if (eff.proficiency_type === "skill") {
        pushUnique(out.proficiencies.skills, eff.value.toLowerCase().replace(/\s+/g, "-"));
      } else if (eff.proficiency_type === "tool") {
        pushUnique(out.proficiencies.tools, eff.value);
      } else if (eff.proficiency_type === "language") {
        pushUnique(out.proficiencies.languages, eff.value);
      } else if (eff.proficiency_type === "armor") {
        // Armor/weapon grants are CATEGORIES ("heavy"/"shield", "simple"/"martial"),
        // not per-item slugs. Stored lowercase (bare word) to match the form
        // class/race/feat grants use; recalc folds these into
        // proficiencies.armor.categories, where the matcher compares them against
        // armor.category (`.specific` is for per-item slugs only).
        pushUnique(out.proficiencies.armor, eff.value.toLowerCase());
      } else if (eff.proficiency_type === "weapon") {
        // Weapon categories ("simple"/"martial") fold into weapons.categories,
        // matched against weapon.category's base ("martial-melee" → "martial").
        pushUnique(out.proficiencies.weapons, eff.value.toLowerCase());
      } else {
        const ab = normalizeAbility(eff.value);
        if (ab && !out.proficiencies.saves.includes(ab)) out.proficiencies.saves.push(ab);
      }
      break;
    }
    case "ac-bonus":
      out.ac_terms.push({ value: eff.value, requires_armor: eff.requires_armor === true, label });
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
    case "roll-modifier":
      // Order-preserving pass-through: one entry per effect, labeled with the
      // owning feature's name for the chip tooltip. No dedupe/merge.
      out.rollModifiers.push({ mode: eff.mode, roll: eff.roll, scope: eff.scope, condition: eff.condition, label });
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
      // apply-condition and future kinds: not derived-stat effects.
      break;
  }
}
