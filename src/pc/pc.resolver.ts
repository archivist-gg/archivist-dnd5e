import type { EntityRegistry, RegisteredEntity } from "@archivist-gg/core";
import type { ClassEntity } from "@archivist-gg/dnd5e/class/class.types";
import type { RaceEntity } from "@archivist-gg/dnd5e/race/race.types";
import type { SubclassEntity } from "@archivist-gg/dnd5e/subclass/subclass.types";
import type { BackgroundEntity } from "@archivist-gg/dnd5e/background/background.types";
import type { FeatEntity } from "@archivist-gg/dnd5e/feat/feat.types";
import type { Feature, Choice, Ability } from "@archivist-gg/dnd5e";
import type { Spell } from "@archivist-gg/dnd5e/spell/spell.types";
import type { Resource } from "@archivist-gg/dnd5e/types/resource";
import { isValidMaxFormula } from "../dnd/resource-formula";
import { ABILITY_KEYS } from "@archivist-gg/dnd5e/dnd/constants";
import type {
  Character,
  ChoiceValue,
  ResolvedCharacter,
  ResolvedClass,
  ResolvedFeature,
  ResolvedSpell,
  FeatureSource,
  FeatVia,
  LevelChoices,
} from "./pc.types";
import { normalizeKnownSpell, resolveSpellcasting, effectiveSpellcastingAbility, attributeUnclassedSpell, type AttributionCaster } from "./pc.spellcasting";
import { resolveAllPools } from "./pc.pools";
import { resolveFeatureResources, resolveResourceIndex } from "./pc.resources";
import { resolveEntityForEntry, isItemEntity } from "./pc.slotting";
import { wikilinkTailSlug } from "./pc.decision-engine";
import { bareEntitySlug } from "../entities/slug";
import { withResolvedActionCost } from "../schemas/feature-alias";
import { collectAdditionalSpells } from "./pc.additional-spells";
// R4-G7 §7.5: the sheet reads RAW registry entities, so the parser's own `components` / `duration`
// normalisers are mirrored at resolve time, at every site that casts registry data to `Spell`.
import { mirrorSpellShapes } from "../spell/spell.parser";

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

/**
 * Resolve a background's `origin_feat` wikilink into a real FeatEntity + a display
 * name, using ONLY the EntityRegistry (no DOM). Lifted from the builder's
 * background-step so the resolver pipeline and the builder share ONE resolution
 * (R2-m7, [[always-retire-shims-edit-all]]). Handles both path-style refs
 * ("[[SRD 2024/Feats/Alert]]") and bare-slug refs ("[[my-feat]]"), plus the 2024
 * parenthetical-variant refs ("[[SRD 2024/Feats/Magic Initiate (Cleric)]]") that
 * resolve to the BASE feat ("magic-initiate") while keeping the full variant
 * string as the display name. Returns null when the ref is empty or resolves to no
 * feat (an unresolvable ref folds nothing into the pipeline).
 *
 * R4-G4 §8: this is a SEVEN-TIER cascade, first hit wins, and the granting
 * BACKGROUND's slug arrives as `ownerSlug` so the compendium-scoped tiers can read
 * its prefix. It replaces the old two-tier "exact slug, else FIRST tail match"
 * lookup, whose two defects were measured on the shipped corpora: a tail match on a
 * DIFFERENT real feat pre-empted the parenthetical strip (PHB 2024
 * "Magic Initiate; Cleric", tail `magic-initiate-cleric`, beat SRD 2024
 * "Magic Initiate" for every 2024 Acolyte / Sage, order-independently), and where
 * several same-NAMED feats exist the registry order decided which one won
 * (`EntityRegistry.search` sorts by lowercased name, so equal names fall through to
 * insertion order).
 */
export function resolveOriginFeat(
  entities: EntityRegistry,
  originFeatRef: string | null | undefined,
  ownerSlug?: string | null,
): { feat: FeatEntity; display: string } | null {
  if (!originFeatRef) return null;
  // Canonical 2024 backgrounds carry PATH-style wikilinks; the slugified tail is
  // the bare feat slug ("alert"). `wikilinkTailSlug` also yields the bare slug for
  // slug-style refs ("[[my-feat]]" → "my-feat"), so it handles both shapes.
  const slug = wikilinkTailSlug(originFeatRef);
  // `inner` is the wikilink BODY, the vault-relative path the ref names; `rawTail`
  // its last segment, and `base` that tail with ONE trailing parenthetical stripped
  // ("Magic Initiate (Cleric)" → "Magic Initiate"). `baseInner` is `inner` with the
  // tail swapped for `base`, so the stripped variant can be looked up BY PATH too.
  const inner = originFeatRef.replace(/^\[\[/, "").replace(/\]\]$/, "").trim();
  const rawTail = inner.split("/").pop()?.trim() ?? "";
  const base = rawTail.replace(/\s*\([^()]*\)\s*$/, "").trim();
  const baseSlug = base && base !== rawTail ? wikilinkTailSlug(`[[${base}]]`) : null;
  const baseInner = baseSlug ? inner.slice(0, inner.length - rawTail.length) + base : null;
  // The background's compendium prefix: `<prefix>_<entity_type>_<name>`. Measured
  // 2026-09-05 over the converter corpus + the shipped bundle: 17,038 / 17,038 entity
  // documents carrying both a slug and a compendium satisfy `prefix === slugify(compendium)`;
  // homebrew satisfies it by construction, through the plugin's `buildHomebrewSlug`.
  // A ref on an owner whose slug carries no `_` yields a null prefix, and tiers 4-5 no-op.
  const prefix = ownerSlug?.includes("_") ? ownerSlug.slice(0, ownerSlug.indexOf("_")) : null;
  const feats = entities.search("", "feat", Number.POSITIVE_INFINITY);
  // The PATH tiers read `filePath`. The first disjunct covers the `compendiumRoot` =
  // vault-root edge (the file sits at exactly the ref's path); the second covers every
  // rooted install ("Compendium/SRD 2024/Feats/Alert.md" for "SRD 2024/Feats/Alert").
  const byPath = (p: string) => feats.find((f) => f.filePath === `${p}.md` || f.filePath.endsWith(`/${p}.md`));
  const sameCompendiumTail = (s: string) => (prefix ? feats.find((f) => f.slug.startsWith(`${prefix}_feat_`) && f.slug.endsWith(`_${s}`)) : undefined);
  const anyTail = (s: string) => feats.find((f) => f.slug.endsWith(`_${s}`));
  const tiers: Array<() => RegisteredEntity | undefined> = [
    () => feats.find((f) => f.slug === slug),                       // 1 exact slug
    () => byPath(inner),                                             // 2 PATH
    () => (baseInner ? byPath(baseInner) : undefined),               // 3 PATH, parenthetical stripped
    () => sameCompendiumTail(slug),                                  // 4 same-compendium tail
    () => (baseSlug ? sameCompendiumTail(baseSlug) : undefined),     // 5 same-compendium tail, stripped
    () => anyTail(slug),                                             // 6 any tail
    () => (baseSlug ? anyTail(baseSlug) : undefined),                // 7 any tail, stripped
  ];
  let reg: RegisteredEntity | undefined;
  let hitTier = 0;
  for (let i = 0; i < tiers.length && !reg; i++) { reg = tiers[i](); hitTier = i + 1; }
  if (!reg) return null;
  // A paren-strip tier resolved the BASE feat, so the display stays honest about which
  // VARIANT the background grants ("Magic Initiate (Cleric)", not "Magic Initiate").
  const variantName = baseSlug && (hitTier === 3 || hitTier === 5 || hitTier === 7) ? rawTail : undefined;
  // Backfill the canonical registry slug when the body data omits it (custom
  // entities) — mirrors resolve()'s lookup() so the slug-dedupe and downstream
  // FeatureSource.slug never see undefined. SRD feats carry a body slug unchanged.
  const data = reg.data as { slug?: string };
  const feat = (data.slug == null ? { ...data, slug: reg.slug } : data) as unknown as FeatEntity;
  return { feat, display: variantName ?? feat.name ?? slug };
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

    // R4-G7 T8 RIDER-23: each class-slot pick keeps its slot, keyed by the RESOLVED feat slug (the ref may be a path or a
    // bare slug) and named by the resolved class entity's slug, the identity the sheet's class arm looks the name up by.
    const feats: FeatEntity[] = [];
    const featVia = new Map<string, FeatVia>();
    for (const pick of collectFeatPicks(character)) {
      const f = lookup<FeatEntity>(`[[${pick.slug}]]`, "feat");
      if (!f) continue;
      feats.push(f);
      const classSlug = classes[pick.classIndex]?.entity?.slug ?? stripSlug(character.class[pick.classIndex]?.name ?? null);
      if (classSlug && pick.level !== null && !featVia.has(f.slug)) featVia.set(f.slug, { kind: "class", slug: classSlug, level: pick.level });
    }

    // D2-3(ii): a 2024 background's FIXED origin feat flows through the SAME feat
    // pipeline as chosen feats — resolved here (before collectResolvedFeatures so it
    // rides `feats` into resolved.features) so it both RENDERS as a real Feats row
    // AND APPLIES its effects (e.g. Criminal→Alert initiative, Soldier→Savage
    // Attacker reroll note). De-duped by slug (R2-m4): a feat taken as BOTH the
    // origin feat and a class ASI slot yields exactly ONE entry. 2014 backgrounds
    // carry origin_feat:null → no-op. Double-apply guard (R2-m3/R3-M11): the 4 SRD
    // origin feats carry no grants_asi/proficiency, and the background's ability/
    // proficiency grants are DISTINCT grants (not the feat's), so a background-then-
    // feat double-apply is not reachable by SRD data; the slug-dedupe below is the
    // only concrete guard needed (defensive ASI folding is untested-by-SRD, deferred).
    // Resolved once and retained: the origin feat both rides `feats` into
    // resolved.features (renders + applies effects) AND, below, supplies its
    // spell picks to the feat→spell application pass (3d).
    const originFeat = background?.origin_feat
      ? resolveOriginFeat(this.entities, background.origin_feat, background.slug)
      : null;
    // R4-G3b §8: the stamp lives OUTSIDE the de-dup guard below (Gate 0 B4) · the guard's body does not run
    // when the same feat is also a class-slot pick, and the origin arm must still find it.
    const originFeatSlug = originFeat?.feat.slug;
    if (originFeat && !feats.some((f) => f.slug === originFeat.feat.slug)) {
      feats.push(originFeat.feat);
    }
    // RIDER-23: the origin feat's slot is the background, unless the same feat is ALSO a class-slot pick: the de-dup above
    // keeps ONE row, and that row keeps the class slot it was listed at first.
    if (originFeat && background && !featVia.has(originFeat.feat.slug)) {
      featVia.set(originFeat.feat.slug, { kind: "background", slug: background.slug });
    }

    const totalLevel = classes.reduce((sum, c) => sum + c.level, 0);
    const features = collectResolvedFeatures(race, classes, background, feats, featVia);
    const extraFeatures = collectChosenGrantedFeatures(character, classes, this.entities, race, background);
    features.push(...extraFeatures);
    features.push(...collectAdditionalFeatures(character, this.entities, warnings));

    // The caster classes in class-entry order, for known spells that don't name their class. Caster-ness is data-driven
    // (resolveSpellcasting), preserving the stripped class-ref slug used elsewhere for spell attribution; each carries
    // its profile's `spellList` for the attribution guard.
    const casters: AttributionCaster[] = [];
    classes.forEach((c, i) => {
      const profile = c.entity ? resolveSpellcasting(c) : null;
      const classSlug = profile ? stripSlug(character.class[i].name) : null;
      if (profile && classSlug != null) casters.push({ classSlug, spellList: profile.spellList });
    });

    const spells: ResolvedSpell[] = [];
    for (const raw of character.spells.known ?? []) {
      const n = normalizeKnownSpell(raw);
      const reg = this.entities.getByTypeAndSlug("spell", n.slug);
      if (!reg) {
        warnings.push(`Spell [[${n.slug}]] not found in compendium.`);
        continue;
      }
      const entity = mirrorSpellShapes(reg.data as unknown as Spell);
      const isCantrip = (entity.level ?? 0) === 0;
      // R4-G7 T8 RIDER-19: an explicit `class:` wins; an un-classed spell stays with the first caster unless that
      // caster's own list is observable and does not name it (Armor of Agathys goes to the Warlock of a Paladin-first
      // sheet, so the sheet's Pact Magic block lists it). The rule and its guards live in `attributeUnclassedSpell`.
      const classSlug = n.classSlug ?? attributeUnclassedSpell(entity.classes, casters, this.entities);
      const prep = isCantrip || n.alwaysPrepared ? true : (n.preparedFlag ?? false);
      // R4-G3b §5.2.7: `persisted` marks a row that LIVES in character.spells.known, so the sheet's
      // remove / toggle controls act on something real. It is stamped here and by no other producer.
      spells.push({ entity, slug: n.slug, classSlug, source: n.source, prepared: prep, alwaysPrepared: n.alwaysPrepared, persisted: true });
    }

    // Feat→spell application pass (3d). Feats such as Magic Initiate let the
    // player pick spells (from a class list) plus a spellcasting ability; those
    // picks live in the choice ledger but never became resolved spells. Turn each
    // picked spell into a ResolvedSpell{ source:"feat", alwaysPrepared:true,
    // classSlug:null, ability }. Two pick sources share ONE walk (change 2):
    //   · the ORIGIN feat  → picks under `origin_choices["background:feat:<id>"]`;
    //   · class-slot feats  → picks under `choices[lvl]["feat:<id>"]` (ASI slot).
    const oc = character.origin_choices ?? {};
    if (originFeat) {
      const read = (childId: string): ChoiceValue | undefined => oc[`background:feat:${childId}`];
      spells.push(...collectFeatGrantedSpells(originFeat.feat, read, this.entities, warnings));
    }
    for (const entry of character.class) {
      for (const atLevel of Object.values(entry.choices ?? {})) {
        const featRef = (atLevel as Record<string, unknown>).feat;
        if (typeof featRef !== "string") continue;
        const slug = stripSlug(featRef);
        if (!slug) continue;
        const reg = this.entities.getByTypeAndSlug("feat", slug);
        if (!reg) continue;
        const feat = reg.data as unknown as FeatEntity;
        const read = (childId: string): ChoiceValue | undefined =>
          (atLevel as Record<string, ChoiceValue>)[`feat:${childId}`];
        spells.push(...collectFeatGrantedSpells(feat, read, this.entities, warnings));
      }
    }

    // Item→spell application pass (P4-T3). A Spell Scroll (any item carrying the T1
    // `scroll_level` marker) whose equipment entry names a chosen spell via
    // `overrides.spell` becomes a castable ResolvedSpell{ source:"item" }. Runs AFTER
    // the feat pass and BEFORE dedupe so the segmented dedupe sees the item copies.
    // The casting ability is the character's OWN spellcasting ability when they have
    // one (first caster class wins), matching how a scroll cast by a caster uses their
    // own DC. `entryIndex` carries the originating equipment index for instance identity.
    const ownSpellcastingAbility = classes
      .map((c) => {
        if (!c.entity) return null;             // narrow c.entity for c.entity.slug (Gate 1 C-1)
        const p = resolveSpellcasting(c);
        return p ? effectiveSpellcastingAbility(c.entity.slug, p.ability, character.overrides) : null;
      })
      .find((a): a is Ability => a != null) ?? null;
    spells.push(...collectItemGrantedSpells(character, ownSpellcastingAbility, this.entities, warnings));

    // R4-G3b §5: additional_spells grants from the RAW race / feat / class / subclass roots, resolved AFTER the persisted,
    // feat and item copies so the character's own copy wins the dedupe (placement (B); background + optional-feature
    // roots have zero in-slice carriers and are G8's).
    spells.push(...collectAdditionalSpells({ race, feats, classes, totalLevel, ownAbility: ownSpellcastingAbility,
      alreadyCollected: spells, entities: this.entities, warnings }));

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

    // R4-G4 §3.2.1: the FEATURE half of the resource index is derived BEFORE pools so that
    // `resolvePool` can intersect the members' `consumes.resource` against the ids the character
    // actually owns; the full index, which `resolveResourceIndex` widens with the pool picks' own
    // `uses` (§12), is stored after pools resolve, below.
    const featureResources = resolveFeatureResources(features);

    const resolvedCharacter: ResolvedCharacter = {
      definition: character,
      race,
      classes,
      background,
      feats,
      ...(originFeatSlug ? { originFeatSlug } : {}),
      totalLevel,
      features,
      spells: dedupeResolvedSpells(spells),
      pools: [],
      resources: featureResources,
      weaponMasteries: chosenMasteries.bare,
      state: character.state,
    };
    resolvedCharacter.pools = resolveAllPools(resolvedCharacter, this.entities, featureResources);
    resolvedCharacter.resources = resolveResourceIndex(resolvedCharacter);

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
 * R4-G7 T8 RIDER-23 · every `choices[<level>].feat` pick with the slot it was taken at: the index of its class entry and
 * the level key as a number (`null` when the key is not an integer). De-duplicated by slug in first-seen order (class
 * entries in order, level keys ascending as `Object.entries` yields integer keys), so a feat picked twice keeps its FIRST
 * slot. Slugs are bare (no `[[ ]]`). The resolver's one walk of class.choices for `feat` entries: the slug-only wrapper that
 * mapped it had no production caller after RIDER-23 and was retired in wave D fix round 1.
 */
export function collectFeatPicks(character: Character): { slug: string; classIndex: number; level: number | null }[] {
  const picks = new Map<string, { slug: string; classIndex: number; level: number | null }>();
  character.class.forEach((c, classIndex) => {
    for (const [lvl, choiceBlock] of Object.entries(c.choices)) {
      const feat = (choiceBlock as { feat?: string })?.feat;
      if (typeof feat === "string") {
        const s = stripSlug(feat);
        const level = /^\d+$/.test(lvl) ? Number(lvl) : null;
        if (s && !picks.has(s)) picks.set(s, { slug: s, classIndex, level });
      }
    }
  });
  return [...picks.values()];
}

/**
 * Feat→spell application (3d). Walks a feat's OWN `choices` to find its spell
 * picks and turns each into a ResolvedSpell. A feat's spells sit behind a
 * `spell-list` select-inline whose CHOSEN branch nests `select-entity{spell}`
 * picks; the chosen spellcasting ability comes from the feat's
 * `spellcasting-ability` select-inline. `read(childId)` yields the persisted pick
 * for a child choice id (origin feat: `origin_choices["background:feat:<id>"]`;
 * class-slot feat: `choices[lvl]["feat:<id>"]`). Unresolvable spell slugs warn and
 * are skipped, mirroring the known-spell loop. classSlug stays null: a feat spell
 * is not owned by a class for DC/ability; the carried `ability` drives its casting.
 */
export function collectFeatGrantedSpells(
  feat: FeatEntity,
  read: (childId: string) => ChoiceValue | undefined,
  entities: EntityRegistry,
  warnings: string[],
): ResolvedSpell[] {
  const ability = readChosenSpellAbility(read);
  const slugs: string[] = [];
  collectSpellPickSlugs(feat.choices, read, slugs);
  const out: ResolvedSpell[] = [];
  for (const rawSlug of slugs) {
    const slug = stripSlug(rawSlug) ?? rawSlug;
    const reg = entities.getByTypeAndSlug("spell", slug);
    if (!reg) {
      warnings.push(`Feat spell [[${slug}]] not found in compendium.`);
      continue;
    }
    const entity = mirrorSpellShapes(reg.data as unknown as Spell);
    out.push({ entity, slug, classSlug: null, source: "feat", prepared: true, alwaysPrepared: true, ability });
  }
  return out;
}

/**
 * Item→spell application (P4-T3). Walks the character's equipment for entries whose
 * resolved item is a spell scroll (carries the T1 `scroll_level` marker) AND names a
 * chosen spell via `overrides.spell`, turning each into a
 * ResolvedSpell{ source:"item", classSlug:null, prepared:true, alwaysPrepared:true }.
 * The casting `ability` is the character's OWN spellcasting ability when they have
 * one (`ownAbility`, the first caster class's ability), else the per-instance
 * `overrides.spell_ability`, else undefined (a no-ability scroll is left ability-less:
 * the plugin surfaces it without a DC; an ability is NEVER fabricated here).
 * `entryIndex` records the originating equipment index so the segmented dedupe keeps
 * two scrolls of one spell (and a scroll of a class-known spell) as their own rows.
 * Unresolvable spell slugs warn and are skipped, mirroring the known-spell + feat loops.
 * In-memory only: no KnownSpellObject{source:"item"} is injected (its strict schema
 * omits `ability`).
 */
export function collectItemGrantedSpells(
  character: Character,
  ownAbility: Ability | null,
  entities: EntityRegistry,
  warnings: string[],
): ResolvedSpell[] {
  const out: ResolvedSpell[] = [];
  (character.equipment ?? []).forEach((entry, entryIndex) => {
    const spellRef = entry.overrides?.spell;
    if (!spellRef) return;
    const { entity: itemEntity } = resolveEntityForEntry(entry.item, entities);
    const scrollLevel = isItemEntity(itemEntity) ? itemEntity.scroll_level : undefined;
    if (scrollLevel == null) return;
    const slug = stripSlug(spellRef) ?? spellRef;
    const reg = entities.getByTypeAndSlug("spell", slug);
    if (!reg) {
      warnings.push(`Scroll spell [[${slug}]] not found in compendium.`);
      return;
    }
    const entity = mirrorSpellShapes(reg.data as unknown as Spell);
    // DC-ability precedence: a per-instance override wins, then the character's own
    // class ability, then the character-level spellcasting_ability fallback. When all
    // are absent the scroll stays ability-less (never fabricated).
    const ability = entry.overrides?.spell_ability ?? ownAbility ?? character.overrides?.spellcasting_ability;
    out.push({ entity, slug, classSlug: null, source: "item", prepared: true, alwaysPrepared: true, ability, entryIndex });
  });
  return out;
}

/**
 * Collapses duplicate resolved spells (3d Minor #2 carry-forward + P4-T3 segmented
 * dedupe). A spell can be emitted more than once: it may be BOTH in
 * `character.spells.known` AND a feat pick, or a feat may be taken as both origin +
 * class-slot, or an `additional_spells` grant (R4-G3b §5) may name a spell the character
 * already knows. A class-sourced copy owns a real DC via its `classSlug`, so it always
 * wins over a feat copy of the same slug; otherwise the FIRST-SEEN copy holds the slot.
 * Which copy holds the slot is not the whole answer, though: `alwaysPrepared` is OR-merged
 * onto the winner in BOTH collision orders (R4-G3b §5.2.8), so a hand-added Bless that a
 * subclass later grants stops counting against the prepared limit instead of counting
 * forever. `persisted` crosses the merge as well, in both orders (fix 1b): removability is
 * MEMBERSHIP in `character.spells.known`, so the flag belongs to the SLUG, not to whichever
 * copy won. Nothing else crosses: the winner keeps its own `source` / `classSlug` /
 * `entryIndex`. Insertion order
 * is preserved (a later class copy replaces an earlier feat copy in place), so the
 * Spells section never renders duplicate rows while a legitimately class-known copy is
 * never lost. Item-source spells carry INSTANCE identity: they key by
 * `slug + "#" + entryIndex`, so two scrolls of one spell stay two rows and a scroll of
 * a class-known spell keeps its OWN item row, never collapsing into / being collapsed
 * by a class/feat copy. The class/feat slug-only merge is unchanged.
 */
export function dedupeResolvedSpells(spells: ResolvedSpell[]): ResolvedSpell[] {
  const byKey = new Map<string, ResolvedSpell>();
  for (const s of spells) {
    const key = s.source === "item" ? `${s.slug}#${s.entryIndex}` : s.slug;
    const existing = byKey.get(key);
    if (!existing) { byKey.set(key, s); continue; }
    // R4-G3b §5.2.8: an alwaysPrepared grant colliding with a non-flagged copy ORs the flag onto the winner, in
    // BOTH orders, so an existing sheet never keeps counting a granted spell against its prepared limit.
    // `persisted` survives the merge in both orders too (fix 1b): removability is MEMBERSHIP in
    // character.spells.known, not a `source` (§5.2.7), and a hand-added spell can be `source: "feat"`
    // (addKnownSpell persists a source), so branch (ii) below would otherwise drop the flag off a row the
    // user really can remove. Branch (i) keeps the winner `existing` and with it that row's own flag; branch
    // (ii) REPLACES the winner with `s`, so the flag has to be carried across explicitly.
    if (existing.source === "feat" && s.source !== "feat") {
      byKey.set(key, { ...s, alwaysPrepared: s.alwaysPrepared || existing.alwaysPrepared, prepared: s.prepared || existing.alwaysPrepared, ...(existing.persisted || s.persisted ? { persisted: true } : {}) });
    } else if (s.alwaysPrepared && !existing.alwaysPrepared) {
      byKey.set(key, { ...existing, alwaysPrepared: true, prepared: true });
    }
  }
  return [...byKey.values()];
}

/** Reads the feat's chosen spellcasting ability (`spellcasting-ability` pick),
 *  validated against the ability keys; null when unset or invalid (a "(Cleric)"
 *  variant may pre-seed it in 3f). */
function readChosenSpellAbility(read: (childId: string) => ChoiceValue | undefined): Ability | null {
  const pick = read("spellcasting-ability");
  return typeof pick === "string" && (ABILITY_KEYS as readonly string[]).includes(pick)
    ? (pick as Ability)
    : null;
}

/** Walks a feat's choice tree collecting the slugs picked for every
 *  `select-entity{entity_type:"spell"}`, descending into the CHOSEN branch of a
 *  `select-inline` (the spell-list). Mirrors the decision-engine's branch
 *  recursion so the same nested shape is honored. */
function collectSpellPickSlugs(
  choices: Choice[] | undefined,
  read: (childId: string) => ChoiceValue | undefined,
  out: string[],
): void {
  for (const ch of choices ?? []) {
    if (ch.kind === "select-entity" && ch.entity_type === "spell") {
      const sel = read(ch.id);
      const picks = Array.isArray(sel) ? sel : typeof sel === "string" ? [sel] : [];
      for (const p of picks) if (typeof p === "string" && p.length > 0) out.push(p);
    } else if (ch.kind === "select-inline") {
      const sel = read(ch.id);
      const branch = typeof sel === "string" ? ch.options.find((o) => o.value === sel) : undefined;
      if (branch?.choices) collectSpellPickSlugs(branch.choices, read, out);
    }
  }
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

/**
 * `character.additional_features` → ResolvedFeatures (the DM-grant path).
 *
 * Deliberately NOT routed through `walkChoiceGrants`: that converter emits
 * `{id, name, description, effects, action}` and DROPS `uses`, which is correct there because a pool
 * pick's tracker is built separately by `resolveResourceIndex`'s pools loop. A campaign grant has no
 * pool, so nothing would ever build its tracker — the feature would render as a card with no counter.
 * This walk therefore converts `uses` into the feature's own `resources[]`, which
 * `resolveFeatureResources` already indexes, and the grant gets a tracker with no pool involved.
 *
 * A prose `uses.max` (the 4 shipped carriers that have one) yields no resource rather than a broken
 * tracker, matching the pools loop's rule; the feature still renders.
 */
export function collectAdditionalFeatures(
  character: Character,
  entities: EntityRegistry,
  warnings: string[],
): ResolvedFeature[] {
  const out: ResolvedFeature[] = [];
  for (const entry of character.additional_features ?? []) {
    const slug = stripSlug(entry) ?? entry;
    const reg = entities.getByTypeAndSlug("optional-feature", slug);
    if (!reg) {
      warnings.push(`Granted feature [[${slug}]] not found in compendium as optional-feature.`);
      continue;
    }
    const d = reg.data as {
      name?: string; slug?: string; description?: string; effects?: unknown[];
      action_cost?: string | null; passive?: boolean; activatable?: boolean;
      duration?: unknown; consumes?: unknown;
      rendering_hint?: string; surface?: "band" | "tab";
      uses?: { max: number | string; recharge: string; recovery?: unknown[] } | null;
    };
    const feature: Feature = {
      id: d.slug ?? slug,
      name: d.name ?? slug,
      description: d.description,
      ...(d.effects?.length ? { effects: d.effects as Feature["effects"] } : {}),
      ...(d.action_cost ? { action: d.action_cost as Feature["action"] } : {}),
      ...(d.passive !== undefined ? { passive: d.passive } : {}),
      ...(d.activatable !== undefined ? { activatable: d.activatable } : {}),
      ...(d.duration ? { duration: d.duration as Feature["duration"] } : {}),
      ...(d.consumes ? { consumes: d.consumes as Feature["consumes"] } : {}),
    };
    const uses = d.uses;
    if (uses) {
      const maxFormula = String(uses.max);
      if (isValidMaxFormula(maxFormula)) {
        feature.resources = [{
          id: d.slug ?? slug,
          name: d.name ?? slug,
          max_formula: maxFormula,
          reset: uses.recharge as Resource["reset"],
          ...(uses.recovery?.length ? { recovery: uses.recovery as Resource["recovery"] } : {}),
          // Presentation rides the resource, so the band and the tab read one object.
          ...(d.rendering_hint ? { rendering_hint: d.rendering_hint } : {}),
          ...(d.surface ? { surface: d.surface } : {}),
        }];
      } else {
        warnings.push(`Granted feature "${slug}" has a prose uses.max (${JSON.stringify(uses.max)}); no tracker.`);
      }
    }
    out.push({ feature, source: { kind: "campaign", slug } });
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

/** A pure class/subclass ASI-slot feature (the "increase an ability score OR take a feat" slot) has no playable
 *  surface of its own: the DISPLAY layer hides it via buildOnly, mirroring the feat buildOnly (spec §4/§4b). The
 *  ability bump is read from the choice ledger at recalc, never from this feature. R4-G3b §3: the converter emits the
 *  slot's mechanic a SECOND time as two `abilities: "chosen"` effects, which the recognizer already pays through the
 *  feat decision, so those effects do not make the slot a surface. The test keys on `kind` + `abilities` ONLY, never on
 *  selfEffectsOf/subject (this module does not import pc.feature-effects; the G1a-D2 non-self fence passes because a
 *  `resistance` is not an ASI encoding). A FIXED-LIST bump on an ASI-id feature IS a surface and stays visible. */
function isAsiSlotFeature(feature: Feature): boolean {
  return (
    feature.id === "ability-score-improvement" &&
    !(feature.effects ?? []).some((e) => !(e.kind === "ability-score-increase" && e.abilities === "chosen")) &&
    !(feature.resources?.length) &&
    !feature.action &&
    !(feature.sub_features?.length) &&
    !(feature.attacks?.length)
  );
}

/** The fold runs per class list and per subclass list, so every member's source is a levelled arm [G2-B-3]. */
type LevelledFeature = ResolvedFeature & { source: Extract<FeatureSource, { level: number }> };

/**
 * R4-G7 §7.1, the user ruling R-G7-4: the resolve-time fold of a REPEATED feature id. Within ONE class list
 * (and, separately, within ONE subclass list) the copies collected at or below the character's level fold into
 * ONE wrapper, so the sheet lists a progression family once instead of once per level.
 *
 * The kept wrapper is the HIGHEST-level copy: its identity (`name`, `description`, `action`, `action_cost`), its
 * `source` and its SLOT in the list (R4-G7 T8 RIDER-11). THREE payloads merge across the folded copies in ASCENDING level order:
 *   · `effects` are CONCATENATED, so a lower copy's effect is never lost (the Storm Herald shape carries its
 *     effects on the middle copy only);
 *   · `resources` keep the FIRST declaration of each resource `id`, which is `resolveFeatureResources`'s own
 *     duplicate rule, so a family that declares its resource on the LOWEST copy only keeps it (the PHB 2014
 *     Cleric's `channel-divinity` declares it at level 2 alone) and `feature_uses`, keyed by the RESOURCE id,
 *     is untouched by the fold;
 *   · `chosenInline` values are CONCATENATED, so every level's inline pick still renders on the one wrapper.
 *
 * DECISIONS and CARDS are not merged, they are CARRIED: the wrapper takes `foldedFrom`, one entry per folded
 * LOWER copy (ascending, whether or not it carries choices), with that copy's own name and prose. The decision
 * engine runs EVERY copy through one branch at its own level, the wrapper's included: its authored choices, else
 * `recognizeDecision`'s synthesized decision under the suppression filter, else an informational card, else
 * nothing. So a repeated feature keeps a row at every level it was gained at, of the same shape the un-folded
 * copy had; and the engine reads a feature's per-level choices off
 * `resolved.features` (NOT off `features_by_level`), at `visitProficiencyChoices` and at `buildDecisionLedger`,
 * and takes the level from the wrapper, so without that field a lower copy's persisted pick would be neither
 * collected nor offered (MEASURED: a Rogue 6 with `expertise` at 1 and 6 lost its two level-1 picks). The TOP
 * copy's own `choices` stay on `feature.choices`, so the pair is visited exactly once each.
 *
 * NEVER folded: a feature without an `id`, an `isAsiSlotFeature` copy (`buildOnly`: the ASI slots at 4 and 8
 * stay two wrappers) and the entity-level resources pseudo-feature, which its caller pushes to `out` directly
 * and never hands to this function. A class copy and a subclass copy that share an id never fold across each
 * other, because the caller folds the two lists separately. Nothing is mutated: every folded wrapper is a
 * fresh object over the shared registry `Feature`.
 */
function foldRepeated(list: LevelledFeature[]): ResolvedFeature[] {
  const byId = new Map<string, LevelledFeature[]>();
  for (const rf of list) {
    const id = rf.feature.id;
    if (!id || rf.buildOnly) continue;                               // id-less, ASI slots: never folded
    const arr = byId.get(id);
    if (arr) arr.push(rf); else byId.set(id, [rf]);
  }
  // R4-G7 T8 RIDER-11 (F-FOLDORD): the output walks the INPUT order and a folding family is emitted at its TOP
  // copy's slot (object identity, never "the last occurrence": the caller feeds ascending levels, a test may not),
  // so the wrapper sits where the copy whose level its badge wears sat in the un-folded list. Every lower copy's
  // slot is dropped. The T2 walk emitted it at the LOWEST copy's slot, ahead of the features gained in between.
  const out: ResolvedFeature[] = [];
  for (const rf of list) {
    // The two carve-outs are re-tested HERE as well as at the collect above: an ASI slot beside two folding
    // copies of its own id must keep its own wrapper rather than resolve to their folded one.
    if (!rf.feature.id || rf.buildOnly) { out.push(rf); continue; }
    const arr = byId.get(rf.feature.id);
    if (!arr || arr.length === 1) { out.push(rf); continue; }
    const sorted = [...arr].sort((a, b) => a.source.level - b.source.level);
    const top = sorted[sorted.length - 1];
    if (rf !== top) continue;                                        // a lower copy: folded into the top's slot
    const effects = sorted.flatMap((c) => c.feature.effects ?? []);
    // The predicate MUTATES `seen` (`&& seen.add(...)`, which returns the Set, i.e. truthy): first declaration
    // of each resource id wins, and the filter and the bookkeeping stay one expression.
    const seen = new Set<string>();
    const resources = sorted.flatMap((c) => (c.feature.resources ?? []).filter((r) => !seen.has(r.id) && seen.add(r.id)));
    const chosenInline = sorted.flatMap((c) => (c.chosenInline ? [c.chosenInline] : []));
    // EVERY folded copy BELOW the top one, ascending, with its OWN card identity; the top copy's stays on
    // `feature`. A copy that carries no choices is still carried, because the builder emits its per-level card.
    const cardProse = (f: Feature): string | undefined => f.description ?? (f.entries?.length ? f.entries.join("\n\n") : undefined);
    const foldedFrom = sorted.slice(0, -1).map((c) => ({
      level: c.source.level,
      name: c.feature.name,
      ...(cardProse(c.feature) ? { description: cardProse(c.feature) } : {}),
      ...(c.feature.choices?.length ? { choices: c.feature.choices } : {}),
    }));
    out.push({
      ...top,
      feature: { ...top.feature, ...(effects.length ? { effects } : {}), ...(resources.length ? { resources } : {}) },
      ...(chosenInline.length ? { chosenInline: chosenInline.flat() } : {}),
      ...(foldedFrom.length ? { foldedFrom } : {}),
    });
  }
  return out;
}

export function collectResolvedFeatures(
  race: RaceEntity | null,
  classes: ResolvedClass[],
  background: BackgroundEntity | null,
  feats: FeatEntity[],
  // R4-G7 T8 RIDER-23: each feat's granting slot, keyed by feat slug; a feat absent from the map keeps the bare source.
  featVia: ReadonlyMap<string, FeatVia> = new Map(),
): ResolvedFeature[] {
  const out: ResolvedFeature[] = [];

  for (const c of classes) {
    if (!c.entity) continue;
    const slug = c.entity.slug;
    const byLevel = c.entity.features_by_level ?? {};
    // R4-G7 §7.1: the two lists are collected FIRST and folded separately, so a class copy and a subclass
    // copy that share an id never fold across each other. `out` keeps today's order: class features, the
    // entity-level class resources, subclass features, the entity-level subclass resources.
    const classFeatures: LevelledFeature[] = [];
    const subclassFeatures: LevelledFeature[] = [];
    for (const [lvlStr, feats0] of Object.entries(byLevel)) {
      const lvl = parseInt(lvlStr, 10);
      if (Number.isNaN(lvl) || lvl > c.level) continue;
      for (const feat of feats0) {
        // #3: fold any chosen select-inline option prose onto this (freshly
        // created) wrapper — never onto the shared registry `feat` entity.
        const chosenInline = resolveChosenInline(feat, c.choices?.[lvl]);
        // R4-G3a Task 12: the sheet resolves RAW registry entities, so `action_cost` is aliased
        // HERE as well as in the parser. Same object back when nothing applies. Read once, so the
        // ASI-slot test (which reads `action`) and the pushed feature see the same shape.
        const feature = withResolvedActionCost(feat);
        classFeatures.push({
          feature,
          source: { kind: "class", slug, level: lvl } satisfies FeatureSource,
          ...(chosenInline ? { chosenInline } : {}),
          ...(isAsiSlotFeature(feature) ? { buildOnly: true } : {}),
        });
      }
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
          // Task 12 again: same resolve-time alias on the subclass half.
          const feature = withResolvedActionCost(feat);
          subclassFeatures.push({
            feature,
            source: { kind: "subclass", slug: sSlug, level: lvl } satisfies FeatureSource,
            ...(chosenInline ? { chosenInline } : {}),
            ...(isAsiSlotFeature(feature) ? { buildOnly: true } : {}),
          });
        }
      }
    }
    const foldedClass = foldRepeated(classFeatures);
    const foldedSubclass = foldRepeated(subclassFeatures);
    out.push(...foldedClass);
    // Entity-level class resources (declared on the class, not on a feature),
    // surfaced so the seed and rest see them like feature-level resources. The
    // `resources` array is shared with the registry entity (read-only
    // downstream), so no copy is needed. Pushed DIRECTLY, never through the fold
    // (it carries no `feature.id` and is not a progression copy) [G2-B-3].
    if (c.entity.resources?.length) {
      out.push({
        feature: { name: c.entity.name, resources: c.entity.resources },
        source: { kind: "class", slug, level: 1 } satisfies FeatureSource,
      });
    }
    out.push(...foldedSubclass);
    // Entity-level subclass resources.
    if (c.subclass?.resources?.length) {
      out.push({
        feature: { name: c.subclass.name, resources: c.subclass.resources },
        source: { kind: "subclass", slug: c.subclass.slug, level: 1 } satisfies FeatureSource,
      });
    }
  }

  if (race) {
    const traits = race.traits ?? [];
    for (const feat of traits) {
      // R4-G3a Task 12: the five shipped `action_cost` carriers are all race traits, and the sheet
      // reaches them through this push on the RAW registry entity. `parseRace`, which the alias
      // first shipped in, never runs on this path.
      out.push({ feature: withResolvedActionCost(feat), source: { kind: "race", slug: race.slug } });
    }
  }

  if (background) {
    const bgFeature = background.feature;
    if (bgFeature) {
      // R4-G3b §5.2.10: the sixth `withResolvedActionCost` site. Zero shipped background features spell
      // `action_cost` today; the wrap is here so an authored one routes like the race / class / subclass
      // features beside it instead of silently losing its economy. The type argument is EXPLICIT because
      // `BackgroundEntity.feature` is declared `{name, description, resources?}` and shares no property
      // with the helper's weak constraint, so inference would refuse it; the value is a `Feature` either
      // way (that is what `ResolvedFeature.feature` holds) and `<Feature>` is checked, not asserted.
      out.push({ feature: withResolvedActionCost<Feature>(bgFeature), source: { kind: "background", slug: background.slug } });
    }
  }

  for (const feat of feats) {
    const via = featVia.get(feat.slug);
    const featSource: FeatureSource = { kind: "feat", slug: feat.slug, ...(via ? { via } : {}) };
    const bundled = (feat as unknown as { features?: Feature[] }).features ?? [];
    const entityEffects = feat.effects ?? [];
    // R4-G4 §8: this `if (bundled.length > 0)` arm is DEAD on both shipped corpora. Measured
    // 2026-09-05 over the converter output and the shipped compendium bundle: 0 of 306 feat
    // documents (287 + 19) carry a top-level `features` key, so `bundled` is always empty and
    // the `else` arm below (the ONE synthesized feature per feat) is the live arm every shipped
    // feat takes. The arm is kept for a homebrew feat that bundles features; G4 changes nothing
    // else about it (§15: no T12 bundled-feat branch change beyond this docblock).
    if (bundled.length > 0) {
      bundled.forEach((f, i) => {
        // Entity-level feat effects AND the entity-level action cost (R4-G3a §10.2.3) ride the
        // first bundled feature. The shallow copy at `i === 0` is now UNCONDITIONAL: registry
        // entities are shared across every character and must not be mutated, so the action carry
        // can never be an in-place write. Declared wins · `??`, never an overwriting spread.
        const feature = i === 0
          ? { ...f, action: f.action ?? feat.action_cost, ...(entityEffects.length > 0 ? { effects: [...(f.effects ?? []), ...entityEffects] } : {}) }
          : f;
        out.push({ feature, source: featSource });
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
          // R4-G3a §10.2.3: a feat's ENTITY-level action cost (SRD 2024 Boon of the Night Spirit)
          // reaches the synthesized feature, so the row routes off Passive onto its own economy.
          ...(feat.action_cost ? { action: feat.action_cost } : {}),
          ...(entityEffects.length > 0 ? { effects: entityEffects } : {}),
        },
        source: featSource,
        ...(buildOnly ? { buildOnly: true } : {}),
      });
    }
  }

  return out;
}
