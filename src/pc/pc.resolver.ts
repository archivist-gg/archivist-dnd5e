import type { EntityRegistry } from "@archivist-gg/core";
import type { ClassEntity } from "@archivist-gg/dnd5e/class/class.types";
import type { RaceEntity } from "@archivist-gg/dnd5e/race/race.types";
import type { SubclassEntity } from "@archivist-gg/dnd5e/subclass/subclass.types";
import type { BackgroundEntity } from "@archivist-gg/dnd5e/background/background.types";
import type { FeatEntity } from "@archivist-gg/dnd5e/feat/feat.types";
import type { Feature, Choice } from "@archivist-gg/dnd5e";
import type { Spell } from "@archivist-gg/dnd5e/spell/spell.types";
import type {
  Character,
  ResolvedCharacter,
  ResolvedClass,
  ResolvedFeature,
  ResolvedSpell,
  FeatureSource,
  LevelChoices,
} from "./pc.types";
import { normalizeKnownSpell, resolveSpellcasting } from "./pc.spellcasting";
import { resolveAllPools } from "./pc.pools";
import { bareEntitySlug } from "./pc.decision-engine";

export interface ResolveResult {
  character: ResolvedCharacter;
  warnings: string[];
}

const SLUG_RE = /^\[\[(.+?)\]\]$/;

export function stripSlug(ref: string | null): string | null {
  if (!ref) return null;
  const m = ref.match(SLUG_RE);
  return m ? m[1] : ref;
}

export class PCResolver {
  constructor(private readonly entities: EntityRegistry) {}

  /** Exposed so recalc() can apply equipment bonuses (Pass A / Pass B). */
  get registry(): EntityRegistry {
    return this.entities;
  }

  resolve(character: Character): ResolveResult {
    const warnings: string[] = [];

    const lookup = <T>(rawRef: string | null, type: string): T | null => {
      const slug = stripSlug(rawRef);
      if (!slug) return null;
      const reg = this.entities.getByTypeAndSlug(type, slug);
      if (!reg) {
        warnings.push(`Slug [[${slug}]] not found in compendium as ${type}.`);
        return null;
      }
      // Custom-created entities (e.g. the custom-background builder) omit `slug`
      // from their body data — saveEntity generates it for the registration only,
      // so reg.data.slug is undefined. Backfill the canonical reg.slug so downstream
      // consumers (bareEntitySlug, FeatureSource.slug) never see undefined. SRD
      // entities carry a body slug and are returned unchanged.
      const data = reg.data as { slug?: string };
      return (data.slug == null ? { ...data, slug: reg.slug } : data) as T;
    };

    const race = lookup<RaceEntity>(character.race, "race");
    const background = lookup<BackgroundEntity>(character.background, "background");

    const classes: ResolvedClass[] = character.class.map((c) => ({
      entity: lookup<ClassEntity>(c.name, "class"),
      level: c.level,
      subclass: lookup<SubclassEntity>(c.subclass, "subclass"),
      choices: c.choices,
    }));

    const featSlugs = collectFeatSlugs(character);
    const feats: FeatEntity[] = [];
    for (const slug of featSlugs) {
      const f = lookup<FeatEntity>(`[[${slug}]]`, "feat");
      if (f) feats.push(f);
    }

    const totalLevel = classes.reduce((sum, c) => sum + c.level, 0);
    const features = collectResolvedFeatures(race, classes, background, feats);
    const extraFeatures = collectChosenGrantedFeatures(character, classes, this.entities, race, background);
    features.push(...extraFeatures);

    // Primary caster slug (for bare-slug spells that don't name their class).
    // Caster-ness is now data-driven (resolveSpellcasting), preserving the
    // stripped class-ref slug used elsewhere for spell attribution.
    const primaryCasterSlug = classes
      .map((c, i) => (c.entity && resolveSpellcasting(c) ? stripSlug(character.class[i].name) : null))
      .find((slug): slug is string => slug != null) ?? null;

    const spells: ResolvedSpell[] = [];
    for (const raw of character.spells.known ?? []) {
      const n = normalizeKnownSpell(raw);
      const reg = this.entities.getByTypeAndSlug("spell", n.slug);
      if (!reg) {
        warnings.push(`Spell [[${n.slug}]] not found in compendium.`);
        continue;
      }
      const entity = reg.data as unknown as Spell;
      const isCantrip = (entity.level ?? 0) === 0;
      const classSlug = n.classSlug ?? primaryCasterSlug;
      const prep = isCantrip || n.alwaysPrepared ? true : (n.preparedFlag ?? false);
      spells.push({ entity, slug: n.slug, classSlug, source: n.source, prepared: prep, alwaysPrepared: n.alwaysPrepared });
    }

    // 2024 Weapon Mastery: union the chosen weapon picks (bare slugs onto the
    // resolved character) and fold their display NAMES onto the Weapon-Mastery
    // feature card. Locate the feature STRUCTURALLY (id/choices live on
    // rf.feature — Gate-2 MF-2), never by display name; APPEND to chosenInline
    // on the freshly-created wrapper so the shared registry entity is untouched.
    const chosenMasteries = collectChosenWeaponMasteries(character);
    if (chosenMasteries.full.length > 0) {
      const target = features.find(
        (rf) =>
          rf.feature.id === "weapon-mastery" ||
          rf.feature.choices?.some(
            (ch) => ch.kind === "select-entity" && ch.id === "weapon-mastery" && ch.entity_type === "weapon",
          ),
      );
      if (target) {
        const names = chosenMasteries.full.map(
          (fullSlug) => this.entities.getByTypeAndSlug("weapon", fullSlug)?.name ?? fullSlug,
        );
        const entry = { label: "Mastered weapons", description: names.join(", ") };
        target.chosenInline = target.chosenInline ? [...target.chosenInline, entry] : [entry];
      }
    }

    const resolvedCharacter: ResolvedCharacter = {
      definition: character,
      race,
      classes,
      background,
      feats,
      totalLevel,
      features,
      spells,
      pools: [],
      weaponMasteries: chosenMasteries.bare,
      state: character.state,
    };
    resolvedCharacter.pools = resolveAllPools(resolvedCharacter, this.entities);

    return { character: resolvedCharacter, warnings };
  }
}

/**
 * 2024 Weapon Mastery: unions the persisted `weapon-mastery` picks across every
 * class/level `ClassEntry.choices[level]["weapon-mastery"]`. Returns both the
 * ORIGINAL full picked slugs (`full` — used for exact-match display-name lookup)
 * and their BARE-normalized form (`bare` — e.g. "srd-2024_greatsword" →
 * "greatsword"), each de-duplicated in first-seen order. Bare-authored picks
 * normalize to themselves. Non-string / non-array picks are ignored.
 */
export function collectChosenWeaponMasteries(character: Character): { bare: string[]; full: string[] } {
  const full = new Set<string>();
  for (const cls of character.class ?? []) {
    for (const lvl of Object.values(cls.choices ?? {})) {
      const pick = (lvl as Record<string, unknown>)["weapon-mastery"];
      if (Array.isArray(pick)) for (const s of pick) if (typeof s === "string") full.add(s);
    }
  }
  return { full: [...full], bare: [...new Set([...full].map(bareEntitySlug))] };
}

/**
 * Walks class.choices for `feat` entries and adds background feat slugs.
 * Returns bare slugs (no `[[ ]]`).
 */
export function collectFeatSlugs(character: Character): string[] {
  const slugs = new Set<string>();
  for (const c of character.class) {
    for (const [, choiceBlock] of Object.entries(c.choices)) {
      const feat = (choiceBlock as { feat?: string })?.feat;
      if (typeof feat === "string") {
        const s = stripSlug(feat);
        if (s) slugs.add(s);
      }
    }
  }
  return [...slugs];
}

/** Selected select-entity values (optional-features) and selected inline
 *  options carrying effects[] become synthesized resolved features (SP2 Plan 3 §9).
 *  The actions/resources engines consume these synthesized features, and the
 *  effects-application pass (pc.feature-effects.ts → recalc) consumes their
 *  effects[]. Scope: class/subclass level choices, plus race/background origin
 *  choices (origin_choices keys are namespaced "race:<id>" / "background:<id>"). */
export function collectChosenGrantedFeatures(
  character: Character,
  classes: ResolvedClass[],
  registry: { getByTypeAndSlug(type: string, slug: string): { data: Record<string, unknown> } | undefined },
  race: RaceEntity | null = null,
  background: BackgroundEntity | null = null,
): ResolvedFeature[] {
  const out: ResolvedFeature[] = [];
  classes.forEach((c, i) => {
    if (!c.entity) return;
    const entity = c.entity;
    const entry = character.class[i];
    if (!entry) return;
    for (const [lvlStr, atLevel] of Object.entries(entry.choices)) {
      const lvl = Number(lvlStr);
      if (!Number.isFinite(lvl) || lvl > entry.level) continue;
      const features = (entity.features_by_level ?? {})[lvl] ?? [];
      const subFeatures = c.subclass ? ((c.subclass.features_by_level ?? {})[lvl] ?? []) : [];
      for (const feature of [...features, ...subFeatures]) {
        walkChoiceGrants(feature.choices, atLevel, (granted, suppress) => {
          out.push({
            feature: granted,
            source: { kind: "class", slug: entity.slug, level: lvl },
            ...(suppress ? { renderSuppressed: true } : {}),
          });
        }, registry);
      }
    }
  });

  // Origin (race/background) grants. origin_choices keys are "<ns>:<choiceId>";
  // strip the namespace so walkChoiceGrants can match on bare choice ids.
  const oc = character.origin_choices ?? {};
  const originAt = (ns: string): Record<string, unknown> => {
    const at: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(oc)) {
      if (key.startsWith(`${ns}:`)) at[key.slice(ns.length + 1)] = val;
    }
    return at;
  };
  if (race) {
    const atRace = originAt("race");
    const emitRace = (granted: Feature, suppress?: boolean): void => {
      out.push({
        feature: granted,
        source: { kind: "race", slug: race.slug },
        ...(suppress ? { renderSuppressed: true } : {}),
      });
    };
    walkChoiceGrants(race.choices, atRace, emitRace, registry);
    for (const trait of race.traits ?? []) {
      walkChoiceGrants(trait.choices, atRace, emitRace, registry);
    }
  }
  if (background) {
    const atBg = originAt("background");
    const emitBg = (granted: Feature, suppress?: boolean): void => {
      out.push({
        feature: granted,
        source: { kind: "background", slug: background.slug },
        ...(suppress ? { renderSuppressed: true } : {}),
      });
    };
    walkChoiceGrants(background.choices, atBg, emitBg, registry);
    if (background.feature) {
      walkChoiceGrants((background.feature as { choices?: Choice[] }).choices, atBg, emitBg, registry);
    }
  }
  return out;
}

function walkChoiceGrants(
  choices: Choice[] | undefined,
  atLevel: Record<string, unknown>,
  emit: (f: Feature, suppress?: boolean) => void,
  registry: { getByTypeAndSlug(type: string, slug: string): { data: Record<string, unknown> } | undefined },
): void {
  for (const ch of choices ?? []) {
    const sel = atLevel[ch.id];
    if (ch.kind === "select-entity" && ch.entity_type === "optional-feature") {
      const slugs = Array.isArray(sel) ? sel : typeof sel === "string" ? [sel] : [];
      for (const slug of slugs) {
        const reg = registry.getByTypeAndSlug("optional-feature", stripSlug(String(slug)) ?? String(slug));
        if (!reg) continue;
        const d = reg.data as {
          name?: string; slug?: string; description?: string;
          effects?: unknown[]; action_cost?: string;
        };
        emit({
          id: d.slug ?? String(slug),
          name: d.name ?? String(slug),
          description: d.description,
          effects: d.effects as Feature["effects"],
          ...(d.action_cost ? { action: d.action_cost as Feature["action"] } : {}),
        });
      }
    }
    if (ch.kind === "select-inline") {
      const branch = typeof sel === "string" ? ch.options.find((o) => o.value === sel) : undefined;
      if (branch?.effects?.length) {
        // Task 4: resolve a scoped "Lies"-style weapon-ability at synthesis. A
        // nested select-entity{weapon} choice (e.g. `lies-weapon`) names the
        // chosen weapon type; bind `weapons:"chosen"` to that pick so recalc can
        // scope the melee override to the matching weapon. CLONE ONLY the
        // chosen-with-pick effect — every other effect passes through BY
        // REFERENCE (byte-identical), and branch.effects (a shared registry
        // array) is NEVER mutated in place.
        const wc = branch.choices?.find(
          (c) => c.kind === "select-entity" && c.entity_type === "weapon",
        );
        const picked = wc ? atLevel?.[wc.id] : undefined;
        const effects = branch.effects.map((e) =>
          e.kind === "weapon-ability" && e.weapons === "chosen" && typeof picked === "string"
            ? { ...e, weapons: [bareEntitySlug(picked)] }
            : e,
        );
        // #3: the chosen-option synthetic is render-suppressed (suppress=true) —
        // its prose is folded onto the PARENT feature (chosenInline) so the sheet
        // does not double-list it. It STAYS in resolved.features so its effects
        // still fold in recalc. select-entity emits stay visible (no suppress).
        emit({ id: `${ch.id}-${branch.value}`, name: branch.label, description: branch.description, effects }, true);
      }
      if (branch?.choices) walkChoiceGrants(branch.choices, atLevel, emit, registry);
    }
  }
}

/**
 * #3: Resolve the chosen select-inline option prose for a feature at a given
 * level, so it can be folded onto the PARENT feature's ResolvedFeature wrapper
 * for render. Returns one entry per select-inline choice whose recorded pick
 * names a known option; an empty-pick option (no description) yields
 * `{ label, description: undefined }`. Returns undefined when the feature has no
 * resolved inline pick (so the wrapper omits the field). Reads the shared
 * registry `Feature` but never mutates it — the caller attaches the result to a
 * freshly-created wrapper object.
 */
function resolveChosenInline(
  feature: Feature,
  atLevel: LevelChoices | undefined,
): { label: string; description?: string }[] | undefined {
  if (!atLevel) return undefined;
  const picks: { label: string; description?: string }[] = [];
  for (const ch of feature.choices ?? []) {
    if (ch.kind !== "select-inline") continue;
    const sel = atLevel[ch.id];
    if (typeof sel !== "string") continue;
    const opt = ch.options.find((o) => o.value === sel);
    if (!opt) continue;
    picks.push({ label: opt.label, description: opt.description });
  }
  return picks.length ? picks : undefined;
}

/** A pure class/subclass ASI-slot feature (the "increase an ability score OR take a feat" slot)
 *  has no playable surface of its own — the DISPLAY layer hides it via buildOnly, mirroring the
 *  feat buildOnly (spec §4/§4b). The ability bump is read from the choice ledger at recalc, not
 *  from this feature (it has no effects), so buildOnly is purely a render fact. */
function isAsiSlotFeature(feature: Feature): boolean {
  return (
    feature.id === "ability-score-improvement" &&
    !(feature.effects?.length) &&
    !(feature.resources?.length) &&
    !feature.action &&
    !(feature.sub_features?.length) &&
    !(feature.attacks?.length)
  );
}

export function collectResolvedFeatures(
  race: RaceEntity | null,
  classes: ResolvedClass[],
  background: BackgroundEntity | null,
  feats: FeatEntity[],
): ResolvedFeature[] {
  const out: ResolvedFeature[] = [];

  for (const c of classes) {
    if (!c.entity) continue;
    const slug = c.entity.slug;
    const byLevel = c.entity.features_by_level ?? {};
    for (const [lvlStr, feats0] of Object.entries(byLevel)) {
      const lvl = parseInt(lvlStr, 10);
      if (Number.isNaN(lvl) || lvl > c.level) continue;
      for (const feat of feats0) {
        // #3: fold any chosen select-inline option prose onto this (freshly
        // created) wrapper — never onto the shared registry `feat` entity.
        const chosenInline = resolveChosenInline(feat, c.choices?.[lvl]);
        out.push({
          feature: feat,
          source: { kind: "class", slug, level: lvl } satisfies FeatureSource,
          ...(chosenInline ? { chosenInline } : {}),
          ...(isAsiSlotFeature(feat) ? { buildOnly: true } : {}),
        });
      }
    }
    // Entity-level class resources (declared on the class, not on a feature) —
    // surfaced so the seed and rest see them like feature-level resources. The
    // `resources` array is shared with the registry entity (read-only
    // downstream), so no copy is needed.
    if (c.entity.resources?.length) {
      out.push({
        feature: { name: c.entity.name, resources: c.entity.resources },
        source: { kind: "class", slug, level: 1 } satisfies FeatureSource,
      });
    }
    if (c.subclass) {
      const sSlug = c.subclass.slug;
      const sByLevel = c.subclass.features_by_level ?? {};
      for (const [lvlStr, feats0] of Object.entries(sByLevel)) {
        const lvl = parseInt(lvlStr, 10);
        if (Number.isNaN(lvl) || lvl > c.level) continue;
        for (const feat of feats0) {
          // #3: same parent-fold for subclass features (picks recorded under the
          // same per-level choices ledger as class features).
          const chosenInline = resolveChosenInline(feat, c.choices?.[lvl]);
          out.push({
            feature: feat,
            source: { kind: "subclass", slug: sSlug, level: lvl } satisfies FeatureSource,
            ...(chosenInline ? { chosenInline } : {}),
            ...(isAsiSlotFeature(feat) ? { buildOnly: true } : {}),
          });
        }
      }
      // Entity-level subclass resources.
      if (c.subclass.resources?.length) {
        out.push({
          feature: { name: c.subclass.name, resources: c.subclass.resources },
          source: { kind: "subclass", slug: sSlug, level: 1 } satisfies FeatureSource,
        });
      }
    }
  }

  if (race) {
    const traits = race.traits ?? [];
    for (const feat of traits) {
      out.push({ feature: feat, source: { kind: "race", slug: race.slug } });
    }
  }

  if (background) {
    const bgFeature = background.feature;
    if (bgFeature) {
      out.push({ feature: bgFeature, source: { kind: "background", slug: background.slug } });
    }
  }

  for (const feat of feats) {
    const bundled = (feat as unknown as { features?: Feature[] }).features ?? [];
    const entityEffects = feat.effects ?? [];
    if (bundled.length > 0) {
      bundled.forEach((f, i) => {
        // Entity-level feat effects ride the first bundled feature. Shallow
        // copy — registry entities are shared and must not be mutated.
        const feature = i === 0 && entityEffects.length > 0
          ? { ...f, effects: [...(f.effects ?? []), ...entityEffects] }
          : f;
        out.push({ feature, source: { kind: "feat", slug: feat.slug } });
      });
    } else {
      const name = feat.name ?? feat.slug;
      const foldedDesc = [feat.description, ...(feat.benefits ?? [])].filter(Boolean).join("\n\n") || undefined;
      const buildOnly =
        (feat.choices ?? []).some((c) => c.kind === "ability-points" && c.points >= 2) &&
        !(feat.effects?.length) && !(feat.resources?.length) && bundled.length === 0;
      out.push({
        feature: {
          name,
          ...(foldedDesc ? { description: foldedDesc } : {}),
          ...(feat.resources ? { resources: feat.resources } : {}),
          ...(entityEffects.length > 0 ? { effects: entityEffects } : {}),
        },
        source: { kind: "feat", slug: feat.slug },
        ...(buildOnly ? { buildOnly: true } : {}),
      });
    }
  }

  return out;
}
