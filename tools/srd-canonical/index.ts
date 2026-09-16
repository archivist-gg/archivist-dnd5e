#!/usr/bin/env tsx
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
import { loadConfig } from "./config";
import { readOpen5eKind, deriveSlugSet, type Open5eKind } from "./sources/open-srd";
import { readStructuredRules, type StructuredRulesKind, type StructuredEntry } from "./sources/structured-rules";
import { readActivationData } from "./sources/activation";
import { loadOverlay } from "./sources/overlay";
import { mergeKind, buildCanonicalSlug, type MergeRule, type CanonicalEntry } from "./merger";
import { projectToRuntime } from "./to-runtime";
import { writeMd, writeCompendiumIndex } from "./to-md";
import { SYNTHETIC_ITEM_SEEDS, type SyntheticItemSeed } from "./data/synthetic-item-seeds";
import { SYNTHETIC_ARMOR_SEEDS, type SyntheticArmorSeed } from "./data/synthetic-armor-seeds";
import { SYNTHETIC_FEAT_SEEDS, buildSeedCanonicalFeat } from "./data/synthetic-feat-seeds";

import { raceMergeRule, toRaceCanonical } from "./merger-rules/race-merge";
import { classMergeRule, toClassCanonical } from "./merger-rules/class-merge";
import { subclassMergeRule, toSubclassCanonical } from "./merger-rules/subclass-merge";
import { featMergeRule, toFeatCanonical } from "./merger-rules/feat-merge";
import { backgroundMergeRule, toBackgroundCanonical } from "./merger-rules/background-merge";
import { weaponMergeRule, toWeaponCanonical } from "./merger-rules/weapon-merge";
import { armorMergeRule, toArmorCanonical } from "./merger-rules/armor-merge";
import {
  itemMergeRule,
  toItemCanonical,
  enrichItemsWithVariantBonuses,
  enrichItemsWithFoundryEffects,
  enrichItemsWithCuratedConditions,
  enrichItemsWithDamageRiders,
  setBaseResolutionPredicate,
} from "./merger-rules/item-merge";
import { readFoundryItemsIndex } from "./sources/foundry-items";
import { spellMergeRule, toSpellCanonical } from "./merger-rules/spell-merge";
import { creatureMergeRule, toCreatureCanonical } from "./merger-rules/creature-merge";
import { conditionMergeRule, toConditionCanonical, buildConditionsFromStructured } from "./merger-rules/condition-merge";
import { mergeOptionalFeatures } from "./merger-rules/optional-feature-merge";
import { expandVariants, type BaseItem, type VariantRule, type ItemEntryTemplate } from "./expand-variants";
import { sanitizeEmitted } from "./sanitize";
import { slugifyName } from "./sources/slug-normalize";
import {
  buildBaseEntityIndex,
  remapVariantBaseItem,
  buildBaseResolutionPredicate,
  type BaseEntity,
} from "./base-item-remap";

/**
 * Map an Open5e kind name to the runtime/MD kind name. Open5e uses plural
 * collection names; the runtime projector and MD writer use singular entity
 * names. Subclasses are routed off "classes" via subclass_of, so they don't
 * appear in the main loop here.
 */
const OPEN5E_KIND_TO_ENTITY: Record<Open5eKind, string> = {
  classes: "class",
  species: "race",
  feats: "feat",
  backgrounds: "background",
  spells: "spell",
  magicitems: "item",
  weapons: "weapon",
  armor: "armor",
  creatures: "monster",
  conditions: "condition",
};

const ALL_KINDS: Open5eKind[] = [
  "classes", "species", "feats", "backgrounds",
  "spells", "magicitems", "weapons", "armor",
  "creatures", "conditions",
];

const KIND_MAP: Partial<Record<Open5eKind, StructuredRulesKind>> = {
  classes: "classes",
  species: "races",
  feats: "feats",
  backgrounds: "backgrounds",
  spells: "spells",
  magicitems: "magicitems",
  weapons: "weapons",
  armor: "armor",
  conditions: "conditions",
};

// Per-kind merge rule + canonical mapper. The mapper is invoked on each
// CanonicalEntry produced by mergeKind. Optional features are dispatched
// separately because Open5e does not expose them.
const RULES_BY_KIND: Record<Open5eKind, { rule: MergeRule; toCanonical: (entry: CanonicalEntry) => unknown } | null> = {
  classes: { rule: classMergeRule, toCanonical: toClassCanonical },
  species: { rule: raceMergeRule, toCanonical: toRaceCanonical },
  feats: { rule: featMergeRule, toCanonical: toFeatCanonical },
  backgrounds: { rule: backgroundMergeRule, toCanonical: toBackgroundCanonical },
  spells: { rule: spellMergeRule, toCanonical: toSpellCanonical },
  magicitems: { rule: itemMergeRule, toCanonical: toItemCanonical },
  weapons: { rule: weaponMergeRule, toCanonical: toWeaponCanonical },
  armor: { rule: armorMergeRule, toCanonical: toArmorCanonical },
  creatures: { rule: creatureMergeRule, toCanonical: toCreatureCanonical },
  conditions: { rule: conditionMergeRule, toCanonical: toConditionCanonical },
};

// Subclasses are routed off the "classes" Open5e kind via subclass_of.
// Entries with `subclass_of !== null` are split off the classes pass and
// run through subclassMergeRule + toSubclassCanonical.

/**
 * Read the structured-rules optionalfeatures.json directly. The standard
 * structured-rules reader is gated on an Open5e-derived slug set, which
 * does not apply here — Open5e has no optional-feature endpoint, so the
 * overlay's slug map drives membership inside mergeOptionalFeatures.
 */
function readOptionalFeaturesRaw(rootPath: string, edition: "2014" | "2024"): StructuredEntry[] {
  const filePath = path.join(rootPath, "optionalfeatures.json");
  if (!fs.existsSync(filePath)) return [];
  const raw = JSON.parse(fs.readFileSync(filePath, "utf8")) as { optionalfeature?: StructuredEntry[] };
  const all = raw.optionalfeature ?? [];
  return all.filter(e => {
    if (!e.source) return false;
    const isXSource = e.source.startsWith("X");
    return edition === "2024" ? isXSource : !isXSource;
  });
}

/**
 * Read SRD-flagged base items (weapons / armor / shields) directly from
 * `items-base.json`. Variants in `magicvariants.json` target bases via
 * a mix of flag fields, type codes, and explicit name+source pairs;
 * this loader passes through the rich shape so {@link expandVariants}
 * can reconcile.
 */
function readBaseItemsRaw(rootPath: string, edition: "2014" | "2024"): BaseItem[] {
  const filePath = path.join(rootPath, "items-base.json");
  if (!fs.existsSync(filePath)) return [];
  const raw = JSON.parse(fs.readFileSync(filePath, "utf8")) as { baseitem?: Array<Record<string, unknown>> };
  const all = raw.baseitem ?? [];
  const flagKey = edition === "2014" ? "srd" : "srd52";
  const out: BaseItem[] = [];
  for (const e of all) {
    if (e[flagKey] !== true) continue;
    const name = e.name as string;
    const source = e.source as string | undefined;
    let kind: "weapon" | "armor" | "shield" | null = null;
    if (e.weapon === true) kind = "weapon";
    else if (e.armor === true) kind = "armor";
    else if ((typeof e.type === "string") && (e.type === "S" || e.type.startsWith("S|"))) kind = "shield";
    if (!kind) continue;
    out.push({
      name,
      slug: slugifyName(name),
      base_item_type: kind,
      type: typeof e.type === "string" ? e.type : undefined,
      source,
      weaponCategory: typeof e.weaponCategory === "string" ? e.weaponCategory : undefined,
      weapon: e.weapon === true,
      armor: e.armor === true,
      shield: kind === "shield",
      sword: e.sword === true,
      axe: e.axe === true,
      arrow: e.arrow === true,
      bolt: e.bolt === true,
      dmgType: typeof e.dmgType === "string" ? e.dmgType : undefined,
      weight: typeof e.weight === "number" ? e.weight : undefined,
    });
  }
  return out;
}

/**
 * Read SRD-flagged variant rules from `magicvariants.json`. The standard
 * structured-rules reader filters by `e.source`, but variant entries
 * carry their source under `inherits.source`. Gate on the per-entry SRD
 * flag stored under `inherits.srd` (2014) or `inherits.srd52` (2024).
 */
function readMagicVariantsRaw(rootPath: string, edition: "2014" | "2024"): VariantRule[] {
  const filePath = path.join(rootPath, "magicvariants.json");
  if (!fs.existsSync(filePath)) return [];
  const raw = JSON.parse(fs.readFileSync(filePath, "utf8")) as { magicvariant?: Array<Record<string, unknown>> };
  const all = raw.magicvariant ?? [];
  const flagKey = edition === "2014" ? "srd" : "srd52";
  const out: VariantRule[] = [];
  for (const e of all) {
    const inherits = e.inherits as Record<string, unknown> | undefined;
    if (!inherits || inherits[flagKey] !== true) continue;
    out.push({
      name: e.name as string,
      type: typeof e.type === "string" ? e.type : undefined,
      requires: Array.isArray(e.requires) ? (e.requires as Array<Record<string, unknown>>) : undefined,
      inherits,
    });
  }
  return out;
}

/**
 * Read the shared prose templates from `items-base.json#itemEntry`.
 *
 * A magic-variant rule whose `inherits.entries` is a `{#itemEntry Name|SOURCE}` pointer carries
 * no prose of its own — the pointer is the entire description. Without this table those items
 * ship a template directive where their rules text should be. The table is the referenced
 * entry's OWN text, so resolving against it invents nothing.
 */
function readItemEntryTemplatesRaw(rootPath: string): ItemEntryTemplate[] {
  const filePath = path.join(rootPath, "items-base.json");
  if (!fs.existsSync(filePath)) return [];
  const raw = JSON.parse(fs.readFileSync(filePath, "utf8")) as { itemEntry?: Array<Record<string, unknown>> };
  const out: ItemEntryTemplate[] = [];
  for (const e of raw.itemEntry ?? []) {
    if (typeof e.name !== "string" || typeof e.source !== "string") continue;
    if (!Array.isArray(e.entriesTemplate)) continue;
    out.push({ name: e.name, source: e.source, entriesTemplate: e.entriesTemplate });
  }
  return out;
}

async function main() {
  const cfg = loadConfig();
  console.log("[canonical] starting build", { editions: cfg.editions });

  for (const edition of cfg.editions) {
    const overlayPath = path.join(cfg.overlayDir, edition === "2014" ? "srd-5e.yaml" : "srd-2024.yaml");
    const overlay = await loadOverlay(overlayPath);
    const classFeatureCount = Object.keys(overlay.class_features ?? {}).length;
    console.log(`[canonical] ${edition} overlay: loaded ${classFeatureCount} class-feature entries`);

    // Captured during the magicitems kind pass; consumed below by the variant
    // expansion to drop duplicates of Open5e canonical items (I5). Open5e
    // already exposes per-base magic items like "Flame Tongue (Longsword)";
    // the variant pipeline emits the parallel "Flame Tongue Longsword".
    let openMagicItemNameSlugs = new Set<string>();

    // Pre-compute the variant-expansion grid early so the magicitems pass can
    // backfill structured bonuses onto Open5e entries that ship a narrative
    // "+N" description but no `bonusWeapon`/`bonusAc` (CB-2). The same
    // `expanded` list is reused below for the dedup + emit pass.
    const baseItemsForExpansion = readBaseItemsRaw(cfg.structuredRulesPath, edition);
    const variantRulesForExpansion = readMagicVariantsRaw(cfg.structuredRulesPath, edition);
    const foundryItemsIndex = readFoundryItemsIndex(cfg.structuredRulesPath, edition);
    console.log(`[canonical] ${edition} foundry-items: ${foundryItemsIndex.size} indexed`);
    const itemEntryTemplates = readItemEntryTemplatesRaw(cfg.structuredRulesPath);
    console.log(`[canonical] ${edition} itemEntry templates: ${itemEntryTemplates.length} loaded`);
    const expandedVariants = expandVariants(baseItemsForExpansion, variantRulesForExpansion, edition, itemEntryTemplates);

    // P2 D5: build the base-resolution predicate from the real weapon/armor/
    // shield bases available pre-loop (+ the injected Shield seed) and inject it
    // into the item-merge structured fallback BEFORE the magicitems pass runs.
    // ALL_KINDS runs magicitems BEFORE weapons/armor, so no post-loop base index
    // exists yet when magic items merge; the predicate lets the fallback drop
    // spurious bases (Horn) while keeping real ones (Mace).
    const basePredicate = buildBaseResolutionPredicate([
      ...baseItemsForExpansion.map(b => b.name),
      "Shield",
    ]);
    setBaseResolutionPredicate(basePredicate);

    // P2 D3: accumulate the generated weapon + armor base entities (INCLUDING the
    // injected Shield) across the loop; after the loop this builds the
    // per-edition base-entity index used to remap the variant grid's base_item
    // links. One index per edition · never mixed.
    const baseEntitiesThisEdition: BaseEntity[] = [];

    for (const kind of ALL_KINDS) {
      const open5e = await readOpen5eKind({
        kind,
        edition,
        apiBase: cfg.open5eApi,
        cacheDir: cfg.open5eCacheDir,
        refresh: cfg.refreshOpen5e,
      });
      const slugSet = deriveSlugSet(open5e);
      console.log(`[canonical] ${edition} ${kind}: ${open5e.length} entries`);

      const structuredKind = KIND_MAP[kind];
      const structured = structuredKind
        ? await readStructuredRules({ kind: structuredKind, edition, rootPath: cfg.structuredRulesPath, slugSet })
        : [];
      const activationKind = structuredKind ?? kind;
      const activation = await readActivationData({ kind: activationKind, edition, rootPath: cfg.structuredRulesPath, slugSet });

      const ruleEntry = RULES_BY_KIND[kind];
      if (!ruleEntry) {
        console.log(`[canonical]   no merge rule for ${kind} (skipped)`);
        continue;
      }

      // Conditions: Open5e exposes 0 entries for SRD documents, so the
      // standard mergeKind path (which iterates over open5e) emits nothing.
      // Build CanonicalEntries directly from the structured-rules dump and
      // run them through toConditionCanonical. The Open5e-fed mergeKind path
      // remains the primary read for every other kind.
      if (kind === "conditions") {
        const merged = buildConditionsFromStructured(structured, edition);
        const canonical = merged.map(toConditionCanonical);
        console.log(`[canonical]   merged: ${canonical.length} canonical entries`);

        emitForKind({
          canonical: canonical as unknown as Array<Record<string, unknown> & { name: string; slug: string }>,
          entityKind: OPEN5E_KIND_TO_ENTITY[kind],
          kind,
          edition,
          canonicalOutDir: cfg.canonicalOutDir,
          runtimeOutDir: cfg.runtimeOutDir,
          bundleOutDir: cfg.bundleOutDir,
        });
        continue;
      }

      // Classes endpoint also serves subclass entries (subclass_of !== null).
      // Split the two so each goes through its own merge rule.
      let classOpen5e = open5e;
      let subclassOpen5e: typeof open5e = [];
      if (kind === "classes") {
        classOpen5e = open5e.filter(e => !(e as { subclass_of?: unknown }).subclass_of);
        subclassOpen5e = open5e.filter(e => Boolean((e as { subclass_of?: unknown }).subclass_of));
        console.log(`[canonical]   split: ${classOpen5e.length} classes, ${subclassOpen5e.length} subclasses`);
      }

      // Singular canonical type token (feeds both the slug and frontmatter
      // `entity_type` via emitForKind) — keeps slug-type-token === entity_type.
      const entityKind = OPEN5E_KIND_TO_ENTITY[kind];
      const merged = mergeKind(ruleEntry.rule, { edition, kind, entityKind, open5e: classOpen5e, structured, activation, overlay });
      const canonical = merged.map(ruleEntry.toCanonical);
      console.log(`[canonical]   merged: ${canonical.length} canonical entries`);

      if (kind === "magicitems") {
        openMagicItemNameSlugs = new Set(canonical.map(c => slugifyName((c as { name: string }).name)));
        // Backfill bonus/tier/attunement-required onto Open5e magic-items
        // whose variant-pipeline counterpart slugify-matches by name. Open5e
        // pre-expands rule-shaped variants like "Defender" into per-base
        // entries ("Defender (Longsword)") whose narrative description carries
        // the "+N" verbiage but whose structured payload has no `bonusWeapon`
        // / `bonusAc` (CB-2). The variant pipeline computes those bonuses
        // from the underlying rule's `inherits`; lift them onto the matching
        // Open5e entry before the dedup pass drops the variant copy.
        const enrichedCount = enrichItemsWithVariantBonuses(
          canonical as Parameters<typeof enrichItemsWithVariantBonuses>[0],
          expandedVariants,
        );
        console.log(`[canonical]   enriched: ${enrichedCount} magic-items with variant-derived bonuses`);
        enrichItemsWithFoundryEffects(
          canonical as Parameters<typeof enrichItemsWithFoundryEffects>[0],
          foundryItemsIndex,
        );
        enrichItemsWithCuratedConditions(
          canonical as Parameters<typeof enrichItemsWithCuratedConditions>[0],
        );
        enrichItemsWithDamageRiders(
          canonical as Parameters<typeof enrichItemsWithDamageRiders>[0],
        );
        console.log(`[canonical]   conditional-bonus enrichment applied`);
      }

      // P2 D4: inject the synthetic base-armor seed(s) into the armor pass so
      // they flow through the SAME `canonical` array that feeds the emit AND the
      // D3 index capture below. 2014 adds the base Shield (Open5e omits it);
      // 2024 is a no-op (empty/absent seed list -> `?? []`).
      if (kind === "armor") {
        canonical.push(
          ...(SYNTHETIC_ARMOR_SEEDS[edition] ?? []).map(s => buildSeedCanonicalArmor(s, edition)),
        );
      }

      // R4-P4: inject the synthetic feat seed(s). Mirrors the armor seed block
      // directly above: push into the SAME `canonical` array that feeds
      // emitForKind, so the seed flows through the canonical write, the runtime
      // projection and the bundle MD with no separate path. 2014 adds the
      // Ability Score Improvement feat entity SRD 5.1 never shipped; 2024 is a
      // natural no-op (no "2024" key -> `?? []`).
      if (kind === "feats") {
        canonical.push(
          ...(SYNTHETIC_FEAT_SEEDS[edition] ?? []).map(s => buildSeedCanonicalFeat(s, edition)),
        );
      }

      // P2 D3: record this pass's weapon/armor base entities (INCLUDING the just
      // injected Shield) for the post-loop per-edition base-entity index.
      if (kind === "weapons" || kind === "armor") {
        for (const c of canonical) {
          baseEntitiesThisEdition.push({
            name: (c as { name: string }).name,
            type: kind === "armor" ? "armor" : "weapon",
            edition,
          });
        }
      }

      emitForKind({
        canonical: canonical as Array<Record<string, unknown> & { name: string; slug: string }>,
        entityKind,
        kind,
        edition,
        canonicalOutDir: cfg.canonicalOutDir,
        runtimeOutDir: cfg.runtimeOutDir,
        bundleOutDir: cfg.bundleOutDir,
      });

      if (kind === "classes" && subclassOpen5e.length > 0) {
        const subMerged = mergeKind(subclassMergeRule, { edition, kind: "subclass", entityKind: "subclass", open5e: subclassOpen5e, structured: [], activation: new Map(), overlay });
        const subCanonical = subMerged.map(toSubclassCanonical);
        console.log(`[canonical]   subclass merged: ${subCanonical.length} canonical entries`);
        emitForKind({
          canonical: subCanonical as unknown as Array<Record<string, unknown> & { name: string; slug: string }>,
          entityKind: "subclass",
          kind: "subclasses",
          edition,
          canonicalOutDir: cfg.canonicalOutDir,
          runtimeOutDir: cfg.runtimeOutDir,
          bundleOutDir: cfg.bundleOutDir,
        });
      }
    }

    // P2 D3: build THIS edition's base-entity index from the weapon/armor bases
    // generated above (incl. the injected Shield). Throws on a normalized-name
    // collision within one (edition,type): a genuine data collision must fail
    // the build, so it is deliberately not swallowed.
    const baseIndex = buildBaseEntityIndex(baseEntitiesThisEdition);

    // Optional-feature kind is overlay-driven (no Open5e endpoint exists).
    const optionalStructured = readOptionalFeaturesRaw(cfg.structuredRulesPath, edition);
    const optionalCanonical = mergeOptionalFeatures({ edition, structured: optionalStructured, overlay });
    console.log(`[canonical] ${edition} optional-features: ${optionalCanonical.length} canonical entries`);

    emitForKind({
      canonical: optionalCanonical as unknown as Array<Record<string, unknown> & { name: string; slug: string }>,
      entityKind: "optional-feature",
      kind: "optional-features",
      edition,
      canonicalOutDir: cfg.canonicalOutDir,
      runtimeOutDir: cfg.runtimeOutDir,
      bundleOutDir: cfg.bundleOutDir,
    });

    // Magic-variant expansion: cross every SRD-flagged variant rule with
    // every eligible SRD base item to emit the full grid of "+1 Weapon",
    // "Frost Brand Longsword", etc. Variants come from the structured-rules
    // dump (Open5e exposes a few rolled-out variants but no rule-level dump),
    // so this step runs from raw structured-rules without an Open5e join.
    // The runtime file `item.{edition}.json` is shared with the magicitems
    // pass — the expanded entries are appended onto it rather than via
    // {@link emitForKind} (which would overwrite the file).
    //
    // The expanded grid was pre-computed above (see `expandedVariants`) so
    // the magicitems pass could backfill structured bonuses onto Open5e
    // pre-expanded entries; reuse it here.
    const expanded = expandedVariants;
    console.log(`[canonical] ${edition} magic-variants: ${variantRulesForExpansion.length} rules × ${baseItemsForExpansion.length} bases → ${expanded.length} expanded items`);

    // Dedup against Open5e canonical-name slugs (I5). When a variant-expanded
    // entry slugifies to the same key as an Open5e magic item (e.g.
    // "Flame Tongue Longsword" vs "Flame Tongue (Longsword)"), the Open5e
    // form wins and the variant is dropped.
    const filtered = expanded.filter(e => !openMagicItemNameSlugs.has(slugifyName(e.name)));
    const dropped = expanded.length - filtered.length;
    console.log(`[canonical] ${edition} variant dedup: kept ${filtered.length}, dropped ${dropped} duplicates of Open5e items`);

    // P2 D3: rewrite each surviving variant's base_item link to the actual
    // registered base entity name (e.g. "Plate Armor" -> "Plate", and a now
    // resolvable Shield) using THIS edition's base index. Falls back to the
    // original link when the base is unindexed. The mutated `filtered` then flows
    // unchanged into all three emits (canonical / runtime / MD) below.
    for (const v of filtered) {
      v.base_item = remapVariantBaseItem(v.base_item, baseIndex);
    }

    if (filtered.length > 0) {
      const compendium = edition === "2014" ? "SRD 5e" : "SRD 2024";

      // Same sanitiser, same reason as emitForKind: the two JSON outputs are cleaned here, the
      // MD writer cleans on its own path after its cross-reference pass.
      const emittedVariants = filtered.map(
        e => sanitizeEmitted(e as unknown as Record<string, unknown>, `${compendium}/magicitems-variants/${e.name}`),
      );

      // 1. Full canonical JSON — separate file from magicitems for traceability.
      fs.mkdirSync(cfg.canonicalOutDir, { recursive: true });
      const variantCanonicalFile = path.join(cfg.canonicalOutDir, `magicitems-variants.${edition}.json`);
      fs.writeFileSync(variantCanonicalFile, JSON.stringify(emittedVariants, null, 2));

      // 2. Runtime — append to the existing item.{edition}.json instead of overwriting.
      fs.mkdirSync(cfg.runtimeOutDir, { recursive: true });
      const itemRuntimeFile = path.join(cfg.runtimeOutDir, `item.${edition}.json`);
      const existingRuntime = fs.existsSync(itemRuntimeFile)
        ? (JSON.parse(fs.readFileSync(itemRuntimeFile, "utf8")) as unknown[])
        : [];
      const variantRuntime = emittedVariants.map(e => projectToRuntime("item", e));
      fs.writeFileSync(itemRuntimeFile, JSON.stringify([...existingRuntime, ...variantRuntime], null, 2));

      // 3. Vault MD per entry — kind=item routes to Magic Items folder.
      const variantBundleDir = path.join(cfg.bundleOutDir, compendium);
      for (const entry of filtered) {
        writeMd(variantBundleDir, {
          kind: "item",
          edition,
          compendium,
          data: entry as unknown as Record<string, unknown> & { name: string; slug: string },
        });
      }
      console.log(`[canonical]   variant emit: canonical(${variantCanonicalFile}) runtime(append +${variantRuntime.length}) md(${filtered.length} files)`);
    }

    // Synthetic item seeds (2024 only): the 10 generic Spell Scrolls + 7
    // Unidentified placeholders authored in data/synthetic-item-seeds.ts. These
    // have NO Open5e / structured provenance, so they can never flow through the
    // kind loop; they are emitted here with the SAME append semantics as the
    // magic-variant grid above — canonical goes to its own traceable file,
    // runtime is APPENDED onto item.{edition}.json (emitForKind would overwrite
    // it), and one MD per seed lands in the vault bundle. The generator owns the
    // canonical 3-part slug (buildCanonicalSlug → `srd-2024_item_...`) and the
    // `edition` stamp so neither is hardcoded in the seed source.
    if (edition === "2024" && SYNTHETIC_ITEM_SEEDS.length > 0) {
      const seedCompendium = "SRD 2024";
      const seedCanonical = SYNTHETIC_ITEM_SEEDS.map(seed => buildSeedCanonicalItem(edition, seed));
      // The seeds are authored in this repo, so the sanitiser is a no-op on them today. It runs
      // anyway: every route to a committed artifact goes through it, or the guarantee is only
      // true of the routes someone remembered.
      const emittedSeeds = seedCanonical.map(
        e => sanitizeEmitted(e, `${seedCompendium}/synthetic-item-seeds/${String(e.name)}`),
      );

      // 1. Full canonical JSON — separate file from magicitems for traceability.
      fs.mkdirSync(cfg.canonicalOutDir, { recursive: true });
      const seedCanonicalFile = path.join(cfg.canonicalOutDir, `synthetic-item-seeds.${edition}.json`);
      fs.writeFileSync(seedCanonicalFile, JSON.stringify(emittedSeeds, null, 2));

      // 2. Runtime — append to the existing item.{edition}.json instead of overwriting.
      fs.mkdirSync(cfg.runtimeOutDir, { recursive: true });
      const seedItemRuntimeFile = path.join(cfg.runtimeOutDir, `item.${edition}.json`);
      const existingSeedRuntime = fs.existsSync(seedItemRuntimeFile)
        ? (JSON.parse(fs.readFileSync(seedItemRuntimeFile, "utf8")) as unknown[])
        : [];
      const seedRuntime = emittedSeeds.map(e => projectToRuntime("item", e));
      fs.writeFileSync(seedItemRuntimeFile, JSON.stringify([...existingSeedRuntime, ...seedRuntime], null, 2));

      // 3. Vault MD per seed — kind=item routes to Magic Items folder.
      const seedBundleDir = path.join(cfg.bundleOutDir, seedCompendium);
      for (const entry of seedCanonical) {
        writeMd(seedBundleDir, {
          kind: "item",
          edition,
          compendium: seedCompendium,
          data: entry as Record<string, unknown> & { name: string; slug: string },
        });
      }
      console.log(`[canonical]   synthetic-seed emit: canonical(${seedCanonicalFile}) runtime(append +${seedRuntime.length}) md(${seedCanonical.length} files)`);
    }

    // Compendium index per edition (single _compendium.md at the bundle root).
    const compendium = edition === "2014" ? "SRD 5e" : "SRD 2024";
    // Version stamp is sourced from the dnd5e package's own package.json — a
    // package-local artifact — so the generator never reaches into the obsidian
    // plugin manifest.
    const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, "..", "..", "package.json"), "utf8")) as { version: string };
    writeCompendiumIndex(path.join(cfg.bundleOutDir, compendium), compendium, edition, pkg.version);
    console.log(`[canonical] ${edition} wrote _compendium.md`);
  }

  // Aggregate the entire bundle directory into a single path → content map and
  // write it to .compendium-bundle/index.json. The plugin's compendium-init
  // module imports this JSON at build time and copies it into the user's vault
  // on first install / version upgrade.
  const bundleIndex: Record<string, string> = {};
  function walkAndIndex(dir: string, prefix = ""): void {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const sub = path.join(dir, entry.name);
      const rel = prefix + entry.name;
      if (entry.isDirectory()) walkAndIndex(sub, rel + "/");
      else if (entry.name.endsWith(".md")) bundleIndex[rel] = fs.readFileSync(sub, "utf8");
    }
  }
  walkAndIndex(cfg.bundleOutDir);
  fs.writeFileSync(path.join(cfg.bundleOutDir, "index.json"), JSON.stringify(bundleIndex));
  console.log(`[canonical] wrote bundle index: ${Object.keys(bundleIndex).length} files`);

  console.log("[canonical] done");
}

/**
 * Emit per-kind outputs:
 *  1. Full canonical JSON (committed for reproducibility).
 *  2. Slim runtime JSON (committed, embedded in plugin).
 *  3. One MD file per entry under .compendium-bundle/{compendium}/{folder}/.
 */
function emitForKind(opts: {
  canonical: Array<Record<string, unknown> & { name: string; slug: string }>;
  entityKind: string;
  kind: string;
  edition: "2014" | "2024";
  canonicalOutDir: string;
  runtimeOutDir: string;
  bundleOutDir: string;
}): void {
  const { canonical, entityKind, kind, edition, canonicalOutDir, runtimeOutDir, bundleOutDir } = opts;
  const compendium = edition === "2014" ? "SRD 5e" : "SRD 2024";

  // Upstream-tooling markup never reaches a committed artifact. The MD writer sanitises on its
  // own path, AFTER its cross-reference pass, so the bundle keeps the wikilinks and backtick
  // roll tags that pass produces; here the raw canonical records are cleaned for the two JSON
  // outputs. See tools/srd-canonical/sanitize.ts.
  const emitted = canonical.map(c => sanitizeEmitted(c, `${compendium}/${kind}/${c.name}`));

  // 1. Full canonical JSON.
  fs.mkdirSync(canonicalOutDir, { recursive: true });
  const canonicalFile = path.join(canonicalOutDir, `${kind}.${edition}.json`);
  fs.writeFileSync(canonicalFile, JSON.stringify(emitted, null, 2));

  // 2. Slim runtime JSON.
  fs.mkdirSync(runtimeOutDir, { recursive: true });
  const runtimeEntries = emitted.map(c => projectToRuntime(entityKind, c));
  const runtimeFile = path.join(runtimeOutDir, `${entityKind}.${edition}.json`);
  fs.writeFileSync(runtimeFile, JSON.stringify(runtimeEntries, null, 2));

  // 3. Vault MD per entry.
  const bundleDir = path.join(bundleOutDir, compendium);
  for (const entry of canonical) {
    writeMd(bundleDir, {
      kind: entityKind,
      edition,
      compendium,
      data: entry,
    });
  }
  console.log(`[canonical]   emit: canonical(${canonicalFile}) runtime(${runtimeFile}) md(${canonical.length} files)`);
}

/**
 * Build the canonical item record for one synthetic seed. The seed source
 * (data/synthetic-item-seeds.ts) holds only the authored payload; the generator
 * owns the derived `slug` (canonical 3-part `srd-2024_item_<name>`) and the
 * `edition` stamp. Fields are inserted in the shipped order so the canonical +
 * runtime projection stay byte-faithful to what the offline injection produced
 * (slug, name, edition, source, [rarity], description, type, [scroll_level] |
 * [unidentified, masked_category]).
 */
function buildSeedCanonicalItem(
  edition: "2014" | "2024",
  seed: SyntheticItemSeed,
): Record<string, unknown> {
  const entry: Record<string, unknown> = {
    slug: buildCanonicalSlug(edition, "item", seed.name),
    name: seed.name,
    edition,
    source: seed.source,
  };
  if (seed.rarity !== undefined) entry.rarity = seed.rarity;
  entry.description = seed.description;
  entry.type = seed.type;
  if (seed.scroll_level !== undefined) entry.scroll_level = seed.scroll_level;
  if (seed.unidentified !== undefined) entry.unidentified = seed.unidentified;
  if (seed.masked_category !== undefined) entry.masked_category = seed.masked_category;
  return entry;
}

/**
 * Build the canonical armor record for one synthetic base-armor seed (P2 D4).
 * Mirrors the exact shape of pipeline-generated armor canonical entities (see
 * toArmorCanonical / ArmorCanonical) so the injected base joins the armor emit,
 * runtime projection, and the D3 base-entity index byte-faithfully: the same
 * field set/order as the real SRD-2024 Shield, only edition/source/slug differ.
 * The generator owns the derived `slug` (canonical 3-part `srd-5e_armor_<name>`);
 * name/source/category/ac/stealth_disadvantage come from the seed. NB: canonical
 * armor entities carry NO `entity_type` field (frontmatter entity_type is set by
 * writeMd's `kind` arg, and the runtime armor keep-set omits it), so none is
 * emitted here.
 */
function buildSeedCanonicalArmor(
  seed: SyntheticArmorSeed,
  edition: "2014" | "2024",
): Record<string, unknown> {
  return {
    slug: buildCanonicalSlug(edition, "armor", seed.name),
    name: seed.name,
    edition,
    source: seed.source,
    category: seed.category,
    ac: { base: seed.ac.base, add_dex: seed.ac.add_dex },
    stealth_disadvantage: seed.stealth_disadvantage,
  };
}

main().catch(e => { console.error(e); process.exit(1); });
