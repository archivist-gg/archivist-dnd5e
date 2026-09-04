import type { EntityRegistry, RegisteredEntity } from "@archivist-gg/core";
import type { ClassEntity } from "@archivist-gg/dnd5e/class/class.types";
import type { RaceEntity } from "@archivist-gg/dnd5e/race/race.types";
import type { SubclassEntity } from "@archivist-gg/dnd5e/subclass/subclass.types";
import type { BackgroundEntity } from "@archivist-gg/dnd5e/background/background.types";
import type { FeatEntity } from "@archivist-gg/dnd5e/feat/feat.types";
import type { Feature, Choice, Ability } from "@archivist-gg/dnd5e";
import type { Spell } from "@archivist-gg/dnd5e/spell/spell.types";
import { ABILITY_KEYS } from "@archivist-gg/dnd5e/dnd/constants";
import type {
  Character,
  ChoiceValue,
  ResolvedCharacter,
  ResolvedClass,
  ResolvedFeature,
  ResolvedSpell,
  FeatureSource,
  LevelChoices,
} from "./pc.types";
import { normalizeKnownSpell, resolveSpellcasting, effectiveSpellcastingAbility } from "./pc.spellcasting";
import { resolveAllPools } from "./pc.pools";
import { resolveEntityForEntry, isItemEntity } from "./pc.slotting";
import { wikilinkTailSlug } from "./pc.decision-engine";
import { bareEntitySlug } from "../entities/slug";
import { withResolvedActionCost } from "../schemas/feature-alias";
import { collectAdditionalSpells } from "./pc.additional-spells";

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
 */
export function resolveOriginFeat(
  entities: EntityRegistry,
  originFeatRef: string | null,
): { feat: FeatEntity; display: string } | null {
  if (!originFeatRef) return null;
  // Canonical 2024 backgrounds carry PATH-style wikilinks; the slugified tail is
  // the bare feat slug ("alert"). `wikilinkTailSlug` also yields the bare slug for
  // slug-style refs ("[[my-feat]]" → "my-feat"), so it handles both shapes.
  const slug = wikilinkTailSlug(originFeatRef);
  const feats = entities.search("", "feat", Number.POSITIVE_INFINITY);
  // Prefer an EXACT full-slug match (covers bare-slug homebrew refs like
  // "[[my-feat]]"), so a homebrew "homebrew_alert" can't shadow "srd-2024_alert"
  // via the loose tail match. Fall back to the "<compendium>_<bare>" suffix match
  // for compendium feats. First tail match wins (acceptable).
  const lookup = (s: string): RegisteredEntity | undefined =>
    feats.find((f) => f.slug === s) ?? feats.find((f) => f.slug.endsWith(`_${s}`));
  let reg = lookup(slug);
  // Variant fallback: canonical 2024 Acolyte/Sage carry parenthesized refs like
  // "[[SRD 2024/Feats/Magic Initiate (Cleric)]]" whose tail slugifies to
  // "magic-initiate-cleric", but the only real feat is "srd-2024_magic-initiate".
  // Strip ONE trailing parenthetical from the RAW tail, re-slugify, and retry —
  // resolving to the BASE feat while still naming the VARIANT in the display.
  let variantName: string | undefined;
  if (!reg) {
    const rawTail = originFeatRef.replace(/^\[\[/, "").replace(/\]\]$/, "").split("/").pop()?.trim() ?? "";
    const base = rawTail.replace(/\s*\([^()]*\)\s*$/, "").trim();
    if (base && base !== rawTail) {
      const baseReg = lookup(wikilinkTailSlug(`[[${base}]]`));
      if (baseReg) {
        reg = baseReg;
        variantName = rawTail; // honest about which variant the background grants
      }
    }
  }
  if (!reg) return null;
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

    const featSlugs = collectFeatSlugs(character);
    const feats: FeatEntity[] = [];
    for (const slug of featSlugs) {
      const f = lookup<FeatEntity>(`[[${slug}]]`, "feat");
      if (f) feats.push(f);
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
      ? resolveOriginFeat(this.entities, background.origin_feat)
      : null;
    // R4-G3b §8: the stamp lives OUTSIDE the de-dup guard below (Gate 0 B4) · the guard's body does not run
    // when the same feat is also a class-slot pick, and the origin arm must still find it.
    const originFeatSlug = originFeat?.feat.slug;
    if (originFeat && !feats.some((f) => f.slug === originFeat.feat.slug)) {
      feats.push(originFeat.feat);
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
    const entity = reg.data as unknown as Spell;
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
    const entity = reg.data as unknown as Spell;
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
        // R4-G3a Task 12: the sheet resolves RAW registry entities, so `action_cost` is aliased
        // HERE as well as in the parser. Same object back when nothing applies. Read once, so the
        // ASI-slot test (which reads `action`) and the pushed feature see the same shape.
        const feature = withResolvedActionCost(feat);
        out.push({
          feature,
          source: { kind: "class", slug, level: lvl } satisfies FeatureSource,
          ...(chosenInline ? { chosenInline } : {}),
          ...(isAsiSlotFeature(feature) ? { buildOnly: true } : {}),
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
          // Task 12 again: same resolve-time alias on the subclass half.
          const feature = withResolvedActionCost(feat);
          out.push({
            feature,
            source: { kind: "subclass", slug: sSlug, level: lvl } satisfies FeatureSource,
            ...(chosenInline ? { chosenInline } : {}),
            ...(isAsiSlotFeature(feature) ? { buildOnly: true } : {}),
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
    const bundled = (feat as unknown as { features?: Feature[] }).features ?? [];
    const entityEffects = feat.effects ?? [];
    if (bundled.length > 0) {
      bundled.forEach((f, i) => {
        // Entity-level feat effects AND the entity-level action cost (R4-G3a §10.2.3) ride the
        // first bundled feature. The shallow copy at `i === 0` is now UNCONDITIONAL: registry
        // entities are shared across every character and must not be mutated, so the action carry
        // can never be an in-place write. Declared wins · `??`, never an overwriting spread.
        const feature = i === 0
          ? { ...f, action: f.action ?? feat.action_cost, ...(entityEffects.length > 0 ? { effects: [...(f.effects ?? []), ...entityEffects] } : {}) }
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
          // R4-G3a §10.2.3: a feat's ENTITY-level action cost (SRD 2024 Boon of the Night Spirit)
          // reaches the synthesized feature, so the row routes off Passive onto its own economy.
          ...(feat.action_cost ? { action: feat.action_cost } : {}),
          ...(entityEffects.length > 0 ? { effects: entityEffects } : {}),
        },
        source: { kind: "feat", slug: feat.slug },
        ...(buildOnly ? { buildOnly: true } : {}),
      });
    }
  }

  return out;
}
