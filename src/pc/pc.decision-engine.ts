import type { Choice, InlineOption, EntityFilter, Ability } from "@archivist-gg/dnd5e/types/choice";
import { ALL_SKILL_SLUGS, ALL_LANGUAGES, ALL_TOOLS } from "@archivist-gg/dnd5e/types/choice";
import { ABILITY_KEYS } from "@archivist-gg/dnd5e/dnd/constants";
import type { ResolvedCharacter, ChoiceValue, FeatureSource } from "./pc.types";
import type { EntityRegistry, RegisteredEntity } from "@archivist-gg/core";
import { recognizeDecision } from "./decision-recognizer";
import { resolveOriginFeat } from "./pc.resolver";
import { humanizeProficiency, toProfSlug } from "./pc.proficiency-normalize";
import {
  collectProficiencyGrants,
  type ProficiencyEntry,
  type ProficiencyOrigin,
} from "./pc.proficiency-grants";
import { bareEntitySlug, slugify } from "../entities/slug";
import { flattenAsiOrFeat } from "./pc.asi-flatten";

export interface DecisionRegistry {
  search(query: string, entityType: string, limit: number): RegisteredEntity[];
  getByTypeAndSlug(entityType: string, slug: string): RegisteredEntity | undefined;
}

export interface ResolvedOption {
  value: string;
  label: string;
  entity?: RegisteredEntity;
  /** The option's own prose (a select-inline InlineOption may supply one — e.g. each
   *  Combat Mastery describes what it does). Surfaced by the strip near the chips. */
  description?: string;
  /** True when a `from` slug has no entity behind it — render visible-but-inert. */
  missing?: boolean;
}

/**
 * Status contract: over-selection (n > need) reports `resolved` — the engine
 * never reports an error for too many picks; the picker UI owns cap enforcement.
 * Likewise for ability-points `max_per`: the engine only sums total points
 * allocated, so per-ability caps are picker-enforced, not reflected here.
 */
export type DecisionStatus = "resolved" | "partial" | "unresolved" | "informational";

export interface DecisionItem {
  key: string;                 // choice.id (persistence key)
  source: FeatureSource;
  level: number;               // 0 for origin (race/background) decisions
  featureName: string;
  /**
   * The source feature/trait's own description (race trait, background feature,
   * class feature) — threaded through from the walk that emits the item so the
   * decision strip can render it as a quiet markdown block at the top of the
   * row's nest (smoke r7). Top-level rows only; a child inherits NOTHING from
   * its parent — it carries the sub-choice option's own `description` (when the
   * authored InlineOption supplies one) or none.
   */
  description?: string;
  /**
   * When `status === "informational"` this is a placeholder sentinel and MUST
   * NOT be rendered — informational items render from `featureName` only
   * (Task 16 contract). For every other status it is the real choice to render.
   */
  choice: Choice;
  options: ResolvedOption[];
  selected: ChoiceValue | undefined;
  status: DecisionStatus;
  /**
   * True when this choice has nothing left to grant: every proficiency it could
   * have offered is one the character ALREADY holds, so the exclusion filter
   * (spec §5) emptied its pool. Such a row is complete, not an open obligation
   * the user has no way to discharge.
   *
   * Deliberately NOT a bare `options.length === 0`. Three other shapes reach
   * zero options and are genuinely still open: a `domain:"save"` choice (no
   * pool exists at all), a select-entity whose registry holds no candidates
   * (an empty vault), and an authored `from: []`. Emptied-BY-EXCLUSION is the
   * only one where the character is already whole, so the flag is scoped to
   * select-proficiency in the language/tool domains (fence F4 keeps it off
   * skills and saves) AND requires the pool to have been non-empty BEFORE
   * exclusion ran.
   *
   * `false` for every other item, informational ones included.
   */
  satisfied: boolean;
  /**
   * Populated only for the selected branch of a select-inline (the
   * revealed-on-selection rule): a child decision becomes visible once its
   * parent option is chosen. An unresolved child downgrades the parent's
   * status to "partial".
   */
  children?: DecisionItem[];
}

export interface DecisionLedger {
  classes: Array<{ classIndex: number; levels: Array<{ level: number; items: DecisionItem[] }> }>;
  origin: DecisionItem[];      // race + background decisions (Plan 4 consumes)
}

export interface DecisionContext {
  registry: DecisionRegistry;
  /** OPTIONAL visibility predicate. When supplied, ambiguous bare-slug lookups
   *  seed VISIBLE entities first, so a hidden compendium can never shadow a
   *  visible one that shares a bare slug. Absent (the engine's own tests, any
   *  caller that has no notion of hidden compendiums) means deterministic order
   *  only — never a behaviour change, because the seeding is total-ordered
   *  either way. Threaded plugin-side by the four builder ctx constructors. */
  isEntityVisible?(e: RegisteredEntity): boolean;
}

/** The language/tool slugs a character ALREADY HOLDS, folded through
 *  {@link toProfSlug} so both sides of every comparison are canonical.
 *
 *  Computed ONCE per ledger in {@link buildDecisionLedger} and threaded to every
 *  buildItem call, including the two recursive ones (spec §5.1). The keys are the
 *  `select-proficiency` domain names verbatim, so `effective[choice.domain]`
 *  needs no mapping table between the two vocabularies. Skills and saves are
 *  deliberately absent · fence F4, see the exclusion block in buildItem. */
interface EffectiveSets { language: Set<string>; tool: Set<string> }

/** Module-level dedup set for the degraded-starting-equipment warning: a class
 *  whose `starting_equipment` is in an outdated/unstructured shape warns ONCE per
 *  unique slug (not on every builder render), so the regression is surfaced
 *  without spamming the console. */
const warnedDegradedEquipment = new Set<string>();

/** Module-level dedup set for the ambiguous-bare-slug warning: a bare slug that
 *  two registered entities of the same type share warns ONCE per unique bare
 *  slug (not on every ledger build), so the collision is surfaced without
 *  spamming the console. Same idiom as {@link warnedDegradedEquipment}. */
const warnedAmbiguousBare = new Set<string>();

// ── helpers ────────────────────────────────────────────────────────────────

/** "[[SRD 2024/Classes/Fighter]]" → "fighter" (tail segment, slugified).
 *
 *  The tail goes through the SAME `slugify` that mints registry slugs, so an
 *  apostrophe is DELETED rather than hyphenated ("Mage's Bane" → "mages-bane",
 *  where the old hand-rolled regex minted "mage-s-bane" and missed every time).
 *  Only ever call this on a human NAME tail — never on a full `<prefix>_<name>`
 *  slug, which slugify would destroy (see {@link resolveEntityRef}). */
export function wikilinkTailSlug(link: string): string {
  const inner = link.replace(/^\[\[/, "").replace(/\]\]$/, "");
  const tail = inner.split("/").pop() ?? inner;
  return slugify(tail);
}

function matchesFilter(e: RegisteredEntity, where: EntityFilter, ownerBare: string): boolean {
  const d = e.data as {
    feature_type?: string; category?: string; parent_class?: string; available_to?: string[];
    classes?: string[]; level?: number; edition?: string;
  };
  if (where.feature_type && d.feature_type !== where.feature_type) return false;
  if (where.category && d.category !== where.category) return false;
  // Spell axis: a spell entity's class list is `classes`; an absent level is a
  // cantrip (0); edition dedupes cross-edition duplicates (e.g. Sacred Flame).
  if (where.list && !((d.classes ?? []).includes(where.list))) return false;
  if (where.level !== undefined && (d.level ?? 0) !== where.level) return false;
  if (where.edition && d.edition !== where.edition) return false;
  // Weapon class: a weapon entity's `category` is compound (e.g. "martial-melee"),
  // so "martial"/"simple" prefix-matches both melee and ranged. Case-insensitive
  // for resilience against authored casing; excludes "natural".
  if (where.weapon_category) {
    const cat = (d.category ?? "").toLowerCase();
    if (!cat.startsWith(`${where.weapon_category}-`) && cat !== where.weapon_category) return false;
  }
  // Armor class: an armor entity's `category` holds the class directly
  // ("light"|"medium"|"heavy"|"shield"); exact (case-insensitive) match.
  if (where.armor_category) {
    if ((d.category ?? "").toLowerCase() !== where.armor_category) return false;
  }
  if (where.parent_class === "self") {
    if (!d.parent_class || wikilinkTailSlug(d.parent_class) !== ownerBare) return false;
  }
  if (where.available_to === "self") {
    const list = d.available_to ?? [];
    if (!list.some((l) => wikilinkTailSlug(l) === ownerBare)) return false;
  }
  return true;
}

/** Test-only export of {@link matchesFilter} (Task B2). */
export const __matchesFilterForTest = matchesFilter;

/** Map a starting-equipment category grant to a nested select-entity child.
 *  Weapons filter by weapon_category; armor by armor_category; "shield" → an
 *  armor entity in the shield class. The "shield" branch is tested BEFORE the
 *  generic "armor" branch because a shield is an armor entity_type but a
 *  distinct category.
 *
 *  Grant-category vocabulary (Task E1 authors within this; stay inside it):
 *    - `simple-weapon`, `martial-weapon` — `*-melee-*`/`*-ranged-*` variants
 *      COLLAPSE to weapon_category only (the engine has no melee/ranged axis,
 *      so `martial-melee-weapon` matches both martial-melee AND martial-ranged).
 *    - `light-armor`, `medium-armor`, `heavy-armor` — class-restricted armor.
 *    - `any-armor` (or a bare `armor`) — ALL armor, no class restriction.
 *    - `shield` — shields only.
 *  Unknown/unrecognized category falls through to a simple-weapon filter (v1
 *  default); authors should stay within the vocabulary above. */
function categoryToEntitySelect(category: string, id: string): Choice {
  const c = category.toLowerCase();
  if (c === "shield") {
    return { kind: "select-entity", id, label: "Choose a shield", count: 1, entity_type: "armor", where: { armor_category: "shield" } };
  }
  if (c.includes("armor")) {
    // Only set armor_category when a specific class is named. For "any-armor"
    // (or a bare "armor") emit a select-entity with NO `where` so enumerateOptions
    // returns ALL armor of the type (an absent filter = all-of-type).
    const klass: "light" | "medium" | "heavy" | null =
      c.includes("light") ? "light" : c.includes("medium") ? "medium" : c.includes("heavy") ? "heavy" : null;
    return klass
      ? { kind: "select-entity", id, label: `Choose ${klass} armor`, count: 1, entity_type: "armor", where: { armor_category: klass } }
      : { kind: "select-entity", id, label: "Choose armor", count: 1, entity_type: "armor" };
  }
  const wc: "simple" | "martial" = c.includes("martial") ? "martial" : "simple";
  return { kind: "select-entity", id, label: `Choose a ${c.replace(/-/g, " ")}`, count: 1, entity_type: "weapon", where: { weapon_category: wc } };
}

function enumerateOptions(choice: Choice, ctx: DecisionContext, ownerBare: string): ResolvedOption[] {
  switch (choice.kind) {
    case "select-inline":
      return choice.options.map((o) => ({ value: o.value, label: o.label, description: o.description }));
    case "select-entity": {
      if (choice.from) {
        // Seed the bare-slug index from a TOTALLY ordered pool and keep the
        // FIRST entity per bare slug. Name alone ties on thousands of duplicated
        // names across compendiums, so the slug breaks the tie; without both the
        // winner fell out of registry INSERTION order (last-wins), which made an
        // ambiguous `from` slug resolve differently between two loads of the
        // same vault. When the caller supplies `isEntityVisible`, visible
        // entities seed first so a hidden compendium can never shadow a visible
        // entity that shares a bare slug.
        const pool = ctx.registry.search("", choice.entity_type, Number.POSITIVE_INFINITY)
          .slice()
          .sort((a, b) => a.name.localeCompare(b.name) || a.slug.localeCompare(b.slug));
        const byBare = new Map<string, RegisteredEntity>();
        const seed = (e: RegisteredEntity) => {
          const bare = bareEntitySlug(e.slug);
          if (byBare.has(bare)) {
            if (!warnedAmbiguousBare.has(bare)) {
              warnedAmbiguousBare.add(bare);
              console.warn(`Archivist: bare slug "${bare}" matches multiple ${choice.entity_type} entities; using "${byBare.get(bare)!.slug}"`);
            }
            return;
          }
          byBare.set(bare, e);
        };
        for (const e of pool) if (ctx.isEntityVisible?.(e) ?? true) seed(e);
        for (const e of pool) if (!(ctx.isEntityVisible?.(e) ?? true)) seed(e);
        return choice.from.map((slug) => {
          const e = ctx.registry.getByTypeAndSlug(choice.entity_type, slug) ?? byBare.get(slug);
          return e ? { value: e.slug, label: e.name, entity: e } : { value: slug, label: slug, missing: true };
        });
      }
      const all = ctx.registry.search("", choice.entity_type, Number.POSITIVE_INFINITY);
      const filtered = choice.where ? all.filter((e) => matchesFilter(e, choice.where!, ownerBare)) : all;
      return filtered.map((e) => ({ value: e.slug, label: e.name, entity: e }));
    }
    case "select-proficiency": {
      // domain:"save" is the one arm that deliberately stays at []: saving-throw
      // proficiencies come from class `saving_throws`, never from a decision, so
      // there is no pool to enumerate. Mirrors collectChosenProficiencies' bucket
      // fold, which skips "save" for the same reason.
      const pool = choice.from
        ?? (choice.domain === "skill" ? [...ALL_SKILL_SLUGS]
            : choice.domain === "language" ? [...ALL_LANGUAGES]
            : choice.domain === "tool" ? [...ALL_TOOLS]
            : []);
      // Label only, no toProfSlug: humanizeProficiency already renders the one
      // non-canonical runtime pool right, because it turns "-" into a space and
      // then capitalizes after whitespace, so the Dwarf triple ["smith's tools",
      // ...] reads "Smith's Tools" either way. Folding here would be redundant,
      // not corrective; persisted non-canonical VALUES are handled at ledger-build.
      return pool.map((v) => ({ value: v, label: humanizeProficiency(v) }));
    }
    case "ability-points": {
      const pool = choice.pool ?? (["str", "dex", "con", "int", "wis", "cha"] as Ability[]);
      return pool.map((a) => ({ value: a, label: a.toUpperCase() }));
    }
  }
}

function selectionCount(choice: Choice, selected: ChoiceValue | undefined): number {
  if (selected === undefined) return 0;
  if (choice.kind === "ability-points") {
    if (typeof selected !== "object" || Array.isArray(selected)) return 0;
    return Object.values(selected).reduce((s: number, v) => s + (typeof v === "number" ? v : 0), 0);
  }
  if (Array.isArray(selected)) return selected.length;
  return typeof selected === "string" && selected.length > 0 ? 1 : 0;
}

function requiredCount(choice: Choice): number {
  if (choice.kind === "ability-points") return choice.points;
  if (choice.kind === "select-proficiency") return choice.count;
  return choice.count ?? 1;
}

/** `satisfied` (spec §6.1's four-clause predicate, computed by the caller) adds
 *  ONE resolved path · it does not replace the others. "resolved when and only
 *  when satisfied" is literally false and would strip `resolved` from every
 *  normally-completed choice. The existing body below is untouched. */
function statusOf(
  choice: Choice,
  selected: ChoiceValue | undefined,
  satisfied: boolean,
): DecisionStatus {
  const n = selectionCount(choice, selected);
  const need = requiredCount(choice);
  if (satisfied) return "resolved";
  if (n === 0) return "unresolved";
  return n >= need ? "resolved" : "partial";
}

/** Match ONE persisted value against a proficiency pool, comparing CANONICALLY
 *  and returning the POOL's spelling (or undefined when nothing matches). The
 *  ONE canonical comparison for this module, deliberately: the builder's chips
 *  and the sheet's proficiency fold must never disagree about what counts as the
 *  same proficiency.
 *
 *  FIVE call sites across FOUR functions, and a no-match means something
 *  different in each · `canonicalizeSelection` just below KEEPS the value
 *  verbatim (twice, string and array); `filterToPool` DROPS it;
 *  `proficiencyEntryFor` reads it as off-vocabulary and falls back to the raw
 *  spelling; `computeEffectiveProficiencies` uses it as a bare predicate, to tag
 *  a manual add "manual" rather than "custom". RE-DERIVE this count before ever
 *  restating it · an earlier pass recorded the then-current "two callers" claim
 *  as verified-still-true without recounting, and it was already false. */
const matchPool = (v: string, pool: string[]): string | undefined =>
  pool.find((p) => toProfSlug(p) === toProfSlug(v));

/** Fold a persisted select-proficiency pick onto the ENUMERATED pool's spelling.
 *
 *  `DecisionItem.selected` is what the builder's chip row matches against the
 *  option values (`selected.has(o.value)`), so a pick persisted in a pre-re-slug
 *  spelling ("smith's tools" against a pool of "smith's-tools") renders the row
 *  `resolved` with a `✓ smith's tools` header while NO chip carries the check:
 *  the picker looks empty. At count 1 a click self-heals but silently CHANGES
 *  the pick; at count > 1 the stale value holds a slot no chip can free. Folding
 *  here rather than in the strip gives the chips, the selected summary and the
 *  write path ONE canon, so the next write migrates the file.
 *
 *  A value matching NOTHING in the pool survives VERBATIM (`?? v`) and MUST NOT
 *  be dropped: dropping flips a resolved row to unresolved and erases the pick
 *  from the summary, which is the very data loss this fold exists to prevent.
 *  That path is live, not hypothetical · a `domain: "tool"` choice with no `from`
 *  enumerates the 35-slug ALL_TOOLS, so any homebrew or legacy tool value outside
 *  it lands here. An empty pool (domain:"save") therefore leaves input unchanged.
 *  The ability-points record shape passes through untouched. */
const canonicalizeSelection = (
  value: ChoiceValue | undefined,
  pool: string[],
): ChoiceValue | undefined => {
  if (typeof value === "string") return matchPool(value, pool) ?? value;
  if (Array.isArray(value)) return value.map((v) => matchPool(v, pool) ?? v);
  return value;
};

// ── the engine ─────────────────────────────────────────────────────────────

/** Resolve the registered entity behind a persisted select-entity value (a bare
 *  slug or a `[[wikilink]]`). Matches the registry's stored slug, the bare slug
 *  (edition prefix stripped), or a wikilink tail. Returns undefined when no
 *  entity is registered (a stale/homebrew slug — caller surfaces no children). */
function resolveEntityRef(
  ctx: DecisionContext,
  entityType: string,
  value: ChoiceValue | undefined,
): RegisteredEntity | undefined {
  if (typeof value !== "string" || value.length === 0) return undefined;
  // Strip a `[[wikilink]]` wrapper WITHOUT slugifying — the stored entity slug
  // keeps its edition underscore (e.g. "srd-2024_magic-initiate"), which
  // wikilinkTailSlug would mangle: slugify DELETES the underscore outright
  // ("srd-2024magic-initiate"). Never route a full slug through it.
  const raw = value.replace(/^\[\[/, "").replace(/\]\]$/, "");
  const direct = ctx.registry.getByTypeAndSlug(entityType, raw);
  if (direct) return direct;
  // Fallback: scan the type's pool by exact slug or bare-slug match (the engine
  // stores full slugs like "srd-2024_alert" but a value may carry the bare tail).
  for (const e of ctx.registry.search("", entityType, Number.POSITIVE_INFINITY)) {
    if (e.slug === raw || bareEntitySlug(e.slug) === raw) return e;
  }
  return undefined;
}

function buildItem(
  inputChoice: Choice,
  source: FeatureSource,
  level: number,
  featureName: string,
  readValue: (id: string) => ChoiceValue | undefined,
  ctx: DecisionContext,
  ownerBare: string,
  effective: EffectiveSets,
  opts?: { keyPrefix?: string; expandFeatChildren?: boolean; description?: string },
): DecisionItem {
  // Normalize the authored two-step ASI shape to the flat feat pick BEFORE the
  // key is computed: the key becomes `feat`, which is the key every affected
  // FEAT-BRANCH vault record already persists (spec §3.4 scopes that to the five
  // persisted feat blocks), so those need no data migration. It is NOT a claim
  // about every affected record: an ASI-BRANCH record persists
  // `{"asi-or-feat":"asi", asi:{…}}` with no `feat` key at all, and a record that
  // switched branches keeps BOTH. Those two cases are handled downstream, not
  // here · see R4-P4 Decision B, collectClassAsiBranch in pc.recalc.ts.
  // Placed here rather than at a walk because all three authored Choice[] entry
  // points funnel through buildItem, as do both recursions.
  const choice = flattenAsiOrFeat(inputChoice);
  const keyPrefix = opts?.keyPrefix ?? "";
  // `expandFeatChildren` defaults true at the top level; we set it false inside a
  // feat's own children so a feat-select-entity nested under a feat never grows
  // grandchildren (cheap infinite-loop guard — real SRD data never nests so).
  const expandFeatChildren = opts?.expandFeatChildren ?? true;
  const key = keyPrefix + choice.id;
  // Read the persisted pick BEFORE enumerating. It used to sit below, but the
  // per-choice exemption in the exclusion block needs it (spec §5.1's required
  // reorder); there is exactly ONE read, do not reintroduce a second one.
  const raw = readValue(key);
  // Kept as its own binding because the `satisfied` predicate below needs the
  // PRE-exclusion pool, and `filter` rebinds `options` to a new array. Never
  // re-derive it by calling enumerateOptions a second time.
  const preExclusionOptions = enumerateOptions(choice, ctx, ownerBare);
  let options = preExclusionOptions;
  // EXCLUSION (spec §5) · the fix for the burned pick: a picker must never offer
  // something the character already holds, because spending the choice on it
  // grants nothing and the sheet then shows no change. `enumerateOptions` stays
  // pure over (choice, ctx, ownerBare) and knows nothing of the character
  // (fence F9), so the filter lives here, between enumerate and canonicalize.
  //
  // Language and tool ONLY (fence F4). domain:"skill"/"expertise" share one walk
  // and one bucket dispatch with these, so widening "for symmetry" would reach
  // the live skill fold in pc.recalc.ts, which this phase does not touch.
  if (choice.kind === "select-proficiency" && (choice.domain === "language" || choice.domain === "tool")) {
    const known = effective[choice.domain];
    const mine = new Set(
      (Array.isArray(raw) ? raw : raw === undefined ? [] : [raw]).map((v) => toProfSlug(String(v))),
    );
    // Canonicalize BOTH sides. An exact-string exemption reintroduces the burned
    // pick INSIDE its own fix: a persisted "smith's tools" against a pool of
    // "smith's-tools" would be excluded rather than exempted, matchPool would then
    // find nothing, canonicalizeSelection's `?? v` KEEP arm would hold the raw
    // string, and the strip would render a bare slug with no matching chip.
    options = options.filter((o) => !known.has(toProfSlug(o.value)) || mine.has(toProfSlug(o.value)));
  }
  // SATISFIED (spec §6.1). All four clauses are load-bearing · see the field's
  // doc comment on DecisionItem for the three zero-option shapes an unscoped
  // test would wrongly claim. It is BOTH recorded on the item and passed to
  // `statusOf` below, which resolves on it (spec §6.2): three step-header
  // counters in the builder count `status === "resolved"` directly, so a row
  // carrying only the boolean would report itself open forever.
  const satisfied =
    choice.kind === "select-proficiency" &&
    (choice.domain === "language" || choice.domain === "tool") &&
    preExclusionOptions.length > 0 &&
    options.length === 0;
  // Canonicalize ONLY select-proficiency picks, and against the options actually
  // enumerated for THIS choice (which already honour `choice.from` when present
  // and the domain vocabulary otherwise). Every other kind stays byte-untouched:
  // an entity slug, feat ref, subclass or inline branch value is not a
  // proficiency slug, and folding one would silently rewrite a reference.
  const selected = choice.kind === "select-proficiency"
    ? canonicalizeSelection(raw, options.map((o) => o.value))
    : raw;
  const item: DecisionItem = {
    key, source, level, featureName, choice,
    description: opts?.description,
    options,
    selected, status: statusOf(choice, selected, satisfied),
    satisfied,
  };
  // Nested choices of the selected select-inline branch.
  if (choice.kind === "select-inline" && typeof selected === "string") {
    const branch: InlineOption | undefined = choice.options.find((o) => o.value === selected);
    if (branch?.choices?.length) {
      // `effective` is FORWARDED, and it is the one deliberate exception to the
      // "a child inherits NOTHING from its parent" contract above · that rule is
      // about DISPLAY (the dropped `description`), whereas the effective set is a
      // property of the character, identical at every depth. Dropping it here
      // silently disables exclusion for every child choice.
      item.children = branch.choices.map((c) =>
        buildItem(c, source, level, featureName, readValue, ctx, ownerBare, effective,
          { keyPrefix, expandFeatChildren }));
      if (item.status === "resolved" && item.children.some((c) => c.status !== "resolved")) {
        item.status = "partial";
      }
    }
  }
  // Chosen-feat children: a selected feat select-entity surfaces the chosen
  // feat's OWN decisions (its `choices`) as ledger children, namespaced
  // `feat:<choiceId>` so they never collide with a sibling asi-branch `asi` key.
  // Scope is exclusive to entity_type "feat": subclass picks merge their
  // features through the class merge, never grow children here.
  if (
    choice.kind === "select-entity" && choice.entity_type === "feat" &&
    expandFeatChildren && typeof selected === "string"
  ) {
    const entity = resolveEntityRef(ctx, "feat", selected);
    const rawChoices = entity?.data?.choices;
    const featChoices: Choice[] = Array.isArray(rawChoices) ? (rawChoices as Choice[]) : [];
    if (featChoices.length) {
      const childPrefix = `${keyPrefix}feat:`;
      // `effective` is FORWARDED here for the same reason as the select-inline
      // recursion above: it is the exception to "a child inherits nothing".
      item.children = featChoices.map((c) =>
        buildItem(c, source, level, featureName, readValue, ctx, ownerBare, effective,
          { keyPrefix: childPrefix, expandFeatChildren: false }));
      if (item.status === "resolved" && item.children.some((c) => c.status !== "resolved")) {
        item.status = "partial";
      }
    }
  }
  return item;
}

/** Build the structural subclass-pick DecisionItem (key "subclass"). Unlike a
 *  generic select-entity it reads/writes ClassEntry.subclass directly (no
 *  per-level choices map): `selected` comes from `c.subclass`, and the strip's
 *  writeValue routes it to setSubclass off `choice.entity_type === "subclass"`.
 *  Shared by the authored path and the Fix-B synthesized guarantee so both
 *  enumerate the same candidate pool and take the same write path. */
function buildSubclassItem(
  choice: Choice,
  source: FeatureSource,
  level: number,
  featureName: string,
  c: ResolvedCharacter["classes"][number],
  ctx: DecisionContext,
  ownerBare: string,
  description?: string,
): DecisionItem {
  const selected = c.subclass ? c.subclass.slug : undefined;
  return {
    key: "subclass", source, level, featureName, description,
    choice, options: enumerateOptions(choice, ctx, ownerBare),
    selected, status: selected ? "resolved" : "unresolved",
    // A subclass pick is a select-entity, never a proficiency choice, so no
    // exclusion can empty its pool.
    satisfied: false,
  };
}

/** Visits every (choice, persisted-selection) pair across the class L1 skill
 *  choice, class/subclass features, race choices + traits, background choices
 *  + feature, and a CHOSEN FEAT's own choices in BOTH persistence namespaces
 *  (R4-G3b §8): arm (A), a class-slot feat, read under
 *  `classes[i].choices[lvl]["feat:<childId>"]`, and arm (B), the background's
 *  origin feat, read under `origin_choices["background:feat:<childId>"]`. It is
 *  the single decision walk shared by every proficiency consumer, so chosen picks
 *  and required/selected counts can never diverge. `visit` is called
 *  for EVERY choice (including non-select-proficiency ones); each consumer filters
 *  by `choice.kind` itself. select-inline branches are recursed by selection. */
function visitProficiencyChoices(
  resolved: ResolvedCharacter,
  visit: (choice: Choice, selected: ChoiceValue | undefined) => void,
): void {
  const walk = (choices: Choice[] | undefined, read: (id: string) => ChoiceValue | undefined): void => {
    for (const ch of choices ?? []) {
      visit(ch, read(ch.id));
      if (ch.kind === "select-inline") {
        const sel = read(ch.id);
        const branch = typeof sel === "string" ? ch.options.find((o) => o.value === sel) : undefined;
        if (branch?.choices) walk(branch.choices, read);
      }
    }
  };

  // Hoisted ABOVE the class loop because the R4-G3b §8 feat arms need them on both
  // sides of it: `featBySlug` / `stripRef` for the class-slot arm INSIDE the loop,
  // `oc` / `originRead` for the origin arms after it.
  const oc = resolved.definition.origin_choices ?? {};
  const originRead = (ns: string) => (id: string): ChoiceValue | undefined => oc[`${ns}:${id}`];
  const stripRef = (ref: string): string => ref.replace(/^\[\[/, "").replace(/\]\]$/, "");
  const featBySlug = new Map(resolved.feats.map((f) => [f.slug, f]));

  resolved.classes.forEach((c, i) => {
    if (!c.entity) return;
    const entity = c.entity;
    const readAt = (lvl: number) => (id: string): ChoiceValue | undefined =>
      (c.choices[lvl] as Record<string, ChoiceValue> | undefined)?.[id];

    // Entity-level L1 skill choice (first class only — multiclass rules are Plan 5).
    if (i === 0 && entity.skill_choices?.from?.length) {
      visit({ kind: "select-proficiency", id: "skills", count: entity.skill_choices.count,
        domain: "skill", from: entity.skill_choices.from }, readAt(1)("skills"));
    }

    // Entity-level class `choices` (first class only, same multiclass scoping as
    // the skill row above · a Bard's "three musical instruments of your choice"
    // belongs to the CLASS, not to any one of its L1 features).
    //
    // Walked with the RECURSIVE `walk`, exactly as RaceEntity.choices and
    // BackgroundEntity.choices are below. The flat `visit` used for the skill row
    // is correct THERE only because that row is synthesized from skill_choices and
    // can never nest; an authored entity-level select-inline can, and a flat visit
    // would drop its sub-choices SILENTLY · the pick would render in the builder
    // and then never fold into the sheet's proficiencies.
    //
    // Read through readAt(1): `c.choices[1]` is a flat per-level namespace, the
    // same one the ledger's entity-level items persist to. Note the synthesized
    // skill row hardcodes `id: "skills"` in it, so a class-authored choice with
    // that id would collide exactly · author any other id.
    if (i === 0) walk(entity.choices, readAt(1));

    for (const rf of resolved.features) {
      if (rf.source.kind !== "class" && rf.source.kind !== "subclass") continue;
      const belongs = rf.source.kind === "class" ? rf.source.slug === entity.slug
        : c.subclass != null && rf.source.slug === c.subclass.slug;
      if (!belongs) continue;
      walk(rf.feature.choices, readAt(rf.source.level));
    }

    // R4-G3b §8 arm (A): a CLASS-SLOT feat's own choices, persisted under `feat:<childId>` in the SAME level block
    // as the `feat` ref (the collectClassFeatAbilityPoints / resolver feat→spell namespace). This OVERTURNS the
    // former DO-NOT-WIDEN note in buildDecisionLedger: feat picks now FOLD, which is the point (they were burned).
    for (const atLevel of Object.values(c.choices ?? {})) {
      const block = atLevel as Record<string, ChoiceValue> | undefined;
      const featRef = block?.feat;
      if (!block || typeof featRef !== "string") continue;
      const feat = featBySlug.get(stripRef(featRef));
      if (!feat) continue;
      walk(feat.choices, (id) => block[`feat:${id}`]);
    }
  });

  if (resolved.race) {
    walk(resolved.race.choices, originRead("race"));
    for (const t of resolved.race.traits ?? []) walk(t.choices, originRead("race"));
  }
  if (resolved.background) {
    walk(resolved.background.choices, originRead("background"));
    if (resolved.background.feature) {
      // BackgroundEntity.feature's type omits `choices`, but homebrew backgrounds
      // may author decisions on the feature note; read them through a narrow view.
      const feature = resolved.background.feature as { choices?: Choice[] };
      walk(feature.choices, originRead("background"));
    }
  }

  // R4-G3b §8 arm (B): the ORIGIN feat's own choices, persisted under `background:feat:<childId>`
  // (pc.resolver.ts' feat→spell pass reads the same key). `originFeatSlug` is stamped by the resolver.
  if (resolved.originFeatSlug) {
    const of = featBySlug.get(resolved.originFeatSlug);
    if (of) walk(of.choices, (id) => oc[`background:feat:${id}`]);
  }
}

/** Validate persisted picks against the choice's pool through the SAME canonical
 *  comparison as the ledger fold ({@link matchPool}), returning the POOL's
 *  spelling. A pool re-slug (e.g. "smith's tools" -> "smith's-tools") must not
 *  silently drop an existing pick: exact `includes` would, and the loss is
 *  INVISIBLE because the sheet renders no pending-choice marker beside the
 *  burned pick. Input ordering is preserved, and no pool means no validation, so
 *  `vals` comes back byte-unchanged.
 *
 *  Unlike {@link canonicalizeSelection} this one DROPS a no-match, and that
 *  asymmetry is deliberate: the collector grants real proficiencies, where an
 *  out-of-pool slug is a stale/hand-edited grant that must not take effect,
 *  whereas the ledger only DISPLAYS the pick, where dropping would destroy it.
 *
 *  Provably the identity on the POOL side for skills and languages: toProfSlug
 *  is the identity over ALL_SKILL_SLUGS and ALL_LANGUAGES, both already
 *  canonical, so no pool entry changes spelling · the 2014 Dwarf tool triple is
 *  the only non-canonical `from` in all runtime data.
 *
 *  That constrains the POOL only. The VALUE side is deliberately WIDENED, so
 *  the `.skills`/`.expertise` fold into the live skill tri is NOT untouched:
 *  this body replaced `pool.includes(v)`, under which a pick persisted in any
 *  other spelling matched nothing and was silently DROPPED. It now folds onto
 *  the pool's spelling and takes effect · a stored "Sleight Of Hand" on the
 *  synthesized class skill row (which always carries a `from`, see :408-410)
 *  now grants sleight-of-hand where it previously granted nothing.
 *  {@link canonicalizeSelection} widens the ledger the same way, including for
 *  a from-less domain:"skill" choice, whose enumerated pool is all 18 slugs.
 *  Recovering those picks is the POINT of this change, not a regression · but
 *  it IS a behavioural delta, so do not read this paragraph as "nothing
 *  changed here" and skip testing the value side.
 *
 *  ONE caller today: the pick fold in {@link collectChosenProficiencies} below.
 *  It was shared with a second collector until R4-P3b §14 deleted the
 *  choice-status half along with the "choose N" placeholder it fed, so the
 *  "these two must never drift" rationale is retired · nothing is left to drift
 *  against. Still a named helper because the drop-a-no-match contract above is
 *  worth stating once: inlining it would bury the asymmetry with
 *  {@link canonicalizeSelection}. */
const filterToPool = (vals: string[], pool: string[] | undefined): string[] =>
  pool
    ? vals.map((v) => matchPool(v, pool)).filter((v): v is string => !!v)
    : vals;

/** Walk every decision definition + persisted selection and collect chosen
 *  proficiencies. Pure; called by recalc. Values are validated against the
 *  decision's option pool via filterToPool: slugs outside `from` are ignored,
 *  and a pick matching under canon is kept in the POOL's spelling. */
export function collectChosenProficiencies(resolved: ResolvedCharacter): {
  skills: string[]; expertise: string[]; languages: string[]; tools: string[];
} {
  const out = { skills: [] as string[], expertise: [] as string[], languages: [] as string[], tools: [] as string[] };
  visitProficiencyChoices(resolved, (choice, selected) => {
    if (choice.kind !== "select-proficiency") return;
    const vals = Array.isArray(selected) ? selected : typeof selected === "string" ? [selected] : [];
    const pool = choice.from;
    const valid = filterToPool(vals, pool);
    // domain:"save" is intentionally not collected here — saving-throw
    // proficiencies come from class `saving_throws`, not decisions.
    const bucket = choice.domain === "skill" ? (choice.expertise ? out.expertise : out.skills)
      : choice.domain === "language" ? out.languages
      : choice.domain === "tool" ? out.tools : null;
    if (bucket) for (const v of valid) if (!bucket.includes(v)) bucket.push(v);
  });
  return out;
}

type ProficiencyDomain = "languages" | "tools";

/** One raw value plus its provenance, folded to the spec §3.3 canonical form.
 *
 *  The `label` rule has THREE branches and the middle one is the whole point:
 *  a value the USER TYPED (off-vocabulary and sourced from `add[]`) renders
 *  VERBATIM, because humanizing "MCDM" yields "Mcdm" and destroys the casing
 *  the raw store exists to preserve. Off-vocabulary GRANT/PICK prose still
 *  routes through humanizeProficiency(toProfSlug(...)) · byte-identical to the
 *  module-private prettyName in pc.proficiencies.ts, and deliberately so: FOUR
 *  off-vocabulary tool grants ship in the SRD bundle today, all of them in
 *  `classToolFixed` · Bard and Monk in BOTH editions, 2 x 2, censused over
 *  src/srd/data/runtime/*.json against ALL_TOOLS. (Spec §3.3's table lists only
 *  three: it omits the 2024 Bard's "Choose 3 Musical Instruments". Count the
 *  census, not the table.) The 2014 Monk's value carries a U+2019, so a blanket
 *  verbatim rule would put a curly apostrophe in the DOM and regress the fold
 *  R4-P3a landed. */
function proficiencyEntryFor(
  raw: string,
  vocab: string[],
  origin: ProficiencyOrigin,
  sources: string[],
): ProficiencyEntry {
  const hit = matchPool(raw, vocab);
  const value = hit ? toProfSlug(hit) : raw;
  const label = hit
    ? humanizeProficiency(value)
    : origin === "custom"
      ? raw                                     // USER-TYPED off-vocabulary: verbatim, preserve casing
      : humanizeProficiency(toProfSlug(raw));   // grant/pick prose: byte-identical to today's prettyName
  return { value, label, sources, origin };
}

/** The single primitive for "what languages/tools does this character actually
 *  have": grants + picks + manual adds, MINUS suppressions (spec §4.1).
 *
 *  Suppressions are applied INSIDE this function precisely so that no reader can
 *  forget them · the sheet panel's display, the builder picker's option
 *  exclusion and the "already satisfied" test all read this one function and
 *  therefore agree by construction.
 *
 *  Built on the grant walk, NEVER on computeProficiencies (spec §4.2): recalc's
 *  proficiency fold is missing the race and background grants.
 *
 *  ONE argument. `Character.overrides` is non-optional with a schema default, so
 *  a second parameter would be redundant and would force an optionality decision
 *  at seventeen existing aggregateProficiencies call sites (spec §4.1).
 *
 *  SEVENTEEN is a PRE-R4-P3c SNAPSHOT (dnd5e 433cc72 · plugin 90394e9, which this
 *  phase never touches), and that is what "existing" means above: the sites that
 *  existed when the one-argument decision was taken. It is NOT today's count. Do
 *  not re-"correct" it to today's · that number moves on every new test that
 *  calls the function, while the cost this sentence is weighing does not.
 *
 *  Reproduce the snapshot with `git grep -c "aggregateProficiencies(" <rev>` over
 *  *.ts/*.tsx, node_modules and dist excluded: 15 raw lines in dnd5e + 3 in the
 *  plugin = 18, minus the DECLARATION in pc.proficiencies.ts = 17 · namely 2
 *  production (the plugin's proficiencies-panel and proficiency-edit-modal) + 15
 *  in tests (14 in dnd5e, 1 in the plugin's pc-proficiency-edit-modal counting
 *  passthrough). Two traps in that census. The plugin's two mock bindings are NOT
 *  a subtraction: `aggregateProficiencies:` has no paren, so the pattern never
 *  matched them. THIS DOCBLOCK's own backticked mention above IS one, and only
 *  from R4-P3c onward · immediately after that phase the same grep returns 20
 *  raw, which is 18 call sites once the declaration AND this docblock come off,
 *  not the 19 you get by subtracting the declaration alone. */
export function computeEffectiveProficiencies(
  resolved: ResolvedCharacter,
): { languages: ProficiencyEntry[]; tools: ProficiencyEntry[] } {
  const grants = collectProficiencyGrants(resolved);
  const chosen = collectChosenProficiencies(resolved);

  const build = (domain: ProficiencyDomain): ProficiencyEntry[] => {
    const vocab = domain === "languages" ? ALL_LANGUAGES : ALL_TOOLS;
    // Optional-chain the CONTAINER too. The type says `overrides` is non-optional,
    // but engine test fixtures build ResolvedCharacter by cast and `tests/` is
    // typechecked by nothing, so the compiler never sees the omission: seven live
    // call sites pass a `definition` with no `overrides` key at all.
    const ov = resolved.definition?.overrides?.[domain];
    const adds = ov?.add ?? [];
    const removes = ov?.remove ?? [];

    const byValue = new Map<string, ProficiencyEntry>();
    const push = (raw: string, origin: ProficiencyOrigin, source?: string): void => {
      const probe = proficiencyEntryFor(raw, vocab, origin, source ? [source] : []);
      const existing = byValue.get(probe.value);
      if (!existing) { byValue.set(probe.value, probe); return; }
      // Same value from more than one place: keep every source, strongest origin
      // wins. The double grant is already shipped data · a 2014 Rogue's
      // "Thieves’ tools" (U+2019) and a 2024 Criminal's "thieves'-tools" fold to
      // one value with two granting entities (spec §7.2).
      if (source && !existing.sources.includes(source)) existing.sources.push(source);
      // Precedence guard. The push ORDER below already runs grants(0) -> picks(1)
      // -> adds(2/3), so this can never fire today: it is unreachable by
      // construction, kept as defence against a future reordering. There is
      // deliberately NO test claiming to exercise it.
      const rank: Record<ProficiencyOrigin, number> = { grant: 0, pick: 1, manual: 2, custom: 3 };
      if (rank[origin] < rank[existing.origin]) existing.origin = origin;
    };

    // Effect buckets go LAST, for the same reason composeGrantEntries orders
    // them last: `push` is first-seen-wins on the value, so an entity grant
    // keeps its own label and the effect only appends its source name.
    // Routing effect grants through HERE rather than composing them separately
    // is what makes them suppressible by `overrides.<domain>.remove` and
    // excluded from the builder's pickers, both by construction and with no new
    // store · that is the whole reason this function is the single primitive.
    const grantBuckets = domain === "languages"
      ? [grants.raceLangFixed, grants.bgLangFixed, grants.featLanguages, grants.effectLanguages]
      : [grants.classToolFixed, grants.bgToolFixed, grants.featTools, grants.effectTools];
    for (const b of grantBuckets) for (const g of b) push(g.value, "grant", g.source);
    for (const v of (domain === "languages" ? chosen.languages : chosen.tools)) push(v, "pick");
    for (const v of adds) push(v, matchPool(v, vocab) ? "manual" : "custom");

    const suppressed = new Set(removes.map((r) => toProfSlug(r)));
    return [...byValue.values()]
      .filter((e) => !suppressed.has(toProfSlug(e.value)))
      // SORT BY LABEL. The bucket this replaced (the return of
      // `aggregateProficiencies` in pc.proficiencies.ts) returned
      // `[...languages].sort()` over the DISPLAY strings; that function now passes
      // this output straight through, so THIS sort is the only one left. Returning
      // Map insertion order instead (race -> background -> feats -> picks -> adds)
      // would silently reorder every sheet row and falsify spec §3.3's
      // "byte-identical to today's" guarantee. Nothing else catches it: the
      // aggregate tests use toContain, and the panel test mocks the aggregate
      // wholesale.
      .sort((a, b) => (a.label < b.label ? -1 : a.label > b.label ? 1 : 0));
  };

  return { languages: build("languages"), tools: build("tools") };
}

export interface OriginAbilityPoints {
  race: Partial<Record<Ability, number>>;
  background: Partial<Record<Ability, number>>;
}

/** Pure: folds ORIGIN (race/background) `ability-points` decisions out of
 *  origin_choices into per-namespace totals. Values are clamped picker-side
 *  already, but clamp again defensively: per-ability max_per, then stop at the
 *  points total walking ABILITY_KEYS order. Class-level ASI stays on the
 *  legacy choices[lvl].asi path recalc already folds — do not double-count. */
export function collectChosenAbilityPoints(resolved: ResolvedCharacter): OriginAbilityPoints {
  const oc = resolved.definition.origin_choices ?? {};
  const out: OriginAbilityPoints = { race: {}, background: {} };

  const fold = (ns: "race" | "background", choices: Choice[] | undefined): void => {
    for (const ch of choices ?? []) {
      if (ch.kind !== "ability-points") continue;
      const raw = oc[`${ns}:${ch.id}`];
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
      let left = ch.points;
      for (const ab of ABILITY_KEYS) {
        // Pool parity with collectChosenProficiencies: out-of-pool allocations
        // from hand-edited files must not fold (the picker can't produce them).
        if (ch.pool && !ch.pool.includes(ab)) continue;
        const v = raw[ab];
        if (typeof v !== "number" || v <= 0 || left <= 0) continue;
        const take = Math.min(v, ch.max_per, left);
        out[ns][ab] = (out[ns][ab] ?? 0) + take;
        left -= take;
      }
    }
  };

  const race = resolved.race;
  if (race) {
    fold("race", race.choices);
    for (const t of race.traits ?? []) fold("race", t.choices);
  }
  const bg = resolved.background;
  if (bg) {
    fold("background", bg.choices);
    fold("background", (bg.feature as { choices?: Choice[] } | undefined)?.choices);
  }
  return out;
}

export function buildDecisionLedger(resolved: ResolvedCharacter, ctx: DecisionContext): DecisionLedger {
  // ONE effective set for the whole ledger, computed before any walk and shared
  // by every item and every child (spec §5.4). That sharing is what implements
  // decision 6: a pick already in the set is not offered again by a SIBLING
  // choice. Suppressions are subtracted inside computeEffectiveProficiencies, so
  // a removed grant becomes pickable again.
  //
  // SCOPED, not universal · it holds only for the choices the collector actually
  // reaches. The set is fed by collectChosenProficiencies over
  // visitProficiencyChoices, which recurses into `select-inline` branches and,
  // since R4-G3b §8, ALSO reaches a CHOSEN FEAT's own children.
  //
  // A STANDING FENCE HERE ONCE FORBADE THAT, and R4-G3b §8 OVERTURNED it
  // deliberately. The fence read: widening the walk would change what the sheet
  // FOLDS, not merely what the picker offers. It would, and that is now the
  // POINT · every feat-authored pick (Skill Expert's expertise, Skilled's skills
  // and tools and both Resilient saves, all `select-proficiency`; Weapon Master's
  // weapons, a `select-entity` with `entity_type:"weapon"`) was persisted,
  // rendered `resolved`, and folded NOWHERE.
  // REACHED is not yet COLLECTED for all of them, and the two survivors are
  // dropped at two DIFFERENT places, both inside collectChosenProficiencies. A
  // `domain:"save"` pick (Resilient) passes its kind check and dies at its domain
  // dispatch, which buckets only skill/expertise, language and tool · there is NO
  // `weapon` domain, the `select-proficiency` union being skill|tool|language|save.
  // A feat's `select-entity` weapon pick (Weapon Master) never reaches that
  // dispatch at all: it dies at the `choice.kind !== "select-proficiency"`
  // early-return.
  // R4-G3b §7 F5 (the `weapons` bucket) and F6 (the `saves` bucket), Task 5, add
  // both.
  // The stated consequence is accepted and TESTED: a language or tool picked
  // under a feat now enters `chosen` -> `effective` and is EXCLUDED from a
  // sibling language/tool row (tests/pc-decision-feat-walk.test.ts, the CONTROL
  // case). It also reaches computeEffectiveProficiencies tagged `origin: "pick"`
  // (the chosen-languages/tools push there), which is what puts it on the sheet's
  // Proficiencies panel · that display is the phase's live-verify surface, not a
  // claim measured here. Double-collection is impossible · the
  // `bucket.includes(v)` guard in collectChosenProficiencies.
  //
  // Still SCOPED, on the axis that survived. The walk reaches a feat only
  // through the TWO PERSISTED NAMESPACES a feat pick actually uses
  // (`classes[i].choices[lvl]["feat:<childId>"]` and
  // `origin_choices["background:feat:<childId>"]`); it does not generically
  // expand a `select-entity` child, so a proficiency authored under any OTHER
  // select-entity pick still never enters this set. That residue is SAFE in the
  // same direction as before: a pick the collector cannot see can only fail to
  // exclude, never wrongly exclude, so no already-made pick is burned.
  //
  // Fence F4 is a DIFFERENT fence and STANDS: the exclusion below is scoped to
  // the language and tool domains, never skills or saves (see buildItem's
  // exclusion block and this interface's own docblock).
  const eff = computeEffectiveProficiencies(resolved);
  const effective: EffectiveSets = {
    language: new Set(eff.languages.map((e) => toProfSlug(e.value))),
    tool: new Set(eff.tools.map((e) => toProfSlug(e.value))),
  };
  const classes: DecisionLedger["classes"] = [];

  resolved.classes.forEach((c, classIndex) => {
    if (!c.entity) return;
    const entity = c.entity;
    const ownerBare = bareEntitySlug(entity.slug);
    const byLevel = new Map<number, DecisionItem[]>();
    const push = (lvl: number, item: DecisionItem) => {
      const arr = byLevel.get(lvl) ?? [];
      arr.push(item);
      byLevel.set(lvl, arr);
    };
    const readAt = (lvl: number) => (id: string): ChoiceValue | undefined =>
      (c.choices[lvl] as Record<string, ChoiceValue> | undefined)?.[id];

    // Entity-level: L1 skill choice (first class only — multiclass rules are Plan 5).
    if (classIndex === 0 && entity.skill_choices?.from?.length) {
      const skillChoice: Choice = {
        kind: "select-proficiency", id: "skills", label: "Skill Proficiencies",
        count: entity.skill_choices.count, domain: "skill",
        from: entity.skill_choices.from,
      };
      push(1, buildItem(skillChoice, { kind: "class", slug: entity.slug, level: 1 }, 1,
        "Proficiencies", readAt(1), ctx, ownerBare, effective));
    }

    // Entity-level: class `choices` (first class only, as above), grouped under
    // the SAME "Proficiencies" header as the skill row · both are class-wide
    // grants belonging to no single feature.
    //
    // This loop IS the recursive push: buildItem expands a selected select-inline
    // branch's nested sub-choices into `item.children` itself, so a flat loop over
    // the top-level choices reaches the whole tree. It mirrors pushOrigin's
    // treatment of RaceEntity/BackgroundEntity entity-level choices exactly.
    if (classIndex === 0) {
      for (const ch of entity.choices ?? []) {
        push(1, buildItem(ch, { kind: "class", slug: entity.slug, level: 1 }, 1,
          "Proficiencies", readAt(1), ctx, ownerBare, effective));
      }
    }

    // Entity-level: starting-equipment choices (the Equipment step renders +
    // seeds these). Each option's label drives the .pc-cb-eqopt row; a
    // `{category}` grant on an option becomes a nested select-entity child that
    // is revealed when that option is selected (buildItem's select-inline child
    // rule), so the player picks the concrete weapon/armor.
    if (classIndex === 0) {
      // `equipment-{i}`/`option-{j}` keys are positional and assume stable
      // starting_equipment order (canonical SRD data); Plan 5 revisits if the
      // Equipment step persists these more broadly.
      (entity.starting_equipment ?? []).forEach((eq, i) => {
        if (eq.kind !== "choice") return;
        // Tolerate OLD-shape (an option is a plain string) and malformed options
        // (an object without an array `grants`): such options degrade to a label
        // with no nested children, and never throw. A degraded entry is also
        // surfaced (warn once per class slug below) so the regression is visible.
        const options = (eq.options ?? []) as unknown[];
        let degraded = false;
        const ch: Choice = {
          kind: "select-inline", id: `equipment-${i}`, label: "Starting Equipment", count: 1,
          options: options.map((opt, j) => {
            const label = typeof opt === "string"
              ? opt
              : ((opt as { label?: string } | null)?.label ?? "");
            const grants =
              opt && typeof opt === "object" && Array.isArray((opt as { grants?: unknown }).grants)
                ? ((opt as { grants: unknown[] }).grants)
                : [];
            if (typeof opt === "string" || !(opt && typeof opt === "object" && Array.isArray((opt as { grants?: unknown }).grants))) {
              degraded = true;
            }
            return {
              value: `option-${j}`,
              label,
              choices: grants.flatMap((g, k) =>
                g && typeof g === "object" && "category" in g && (g as { category?: string }).category
                  ? [categoryToEntitySelect((g as { category: string }).category, `equipment-${i}-opt-${j}-cat-${k}`)]
                  : []),
            };
          }),
        };
        if (degraded && !warnedDegradedEquipment.has(entity.slug)) {
          warnedDegradedEquipment.add(entity.slug);
          console.warn(
            `[archivist] Starting equipment for "${entity.slug}" is in an outdated/unstructured format; ` +
            "its nested picks and seeding are skipped. Re-sync the compendium " +
            "(delete _compendium.md and reload) to fix.",
          );
        }
        push(1, buildItem(ch, { kind: "class", slug: entity.slug, level: 1 }, 1,
          "Starting Equipment", readAt(1), ctx, ownerBare, effective));
      });
    }

    // Feature-level (class + subclass features already level-gated by the resolver),
    // with the recognizer as fallback for un-annotated decision prose (homebrew).
    // Track whether an authored subclass select-entity surfaced so the guarantee
    // below never synthesizes a duplicate (mirrors the browse walker's
    // collectBrowseDecisions; the 2024 Bard alone lacks the authored choice).
    let sawAuthoredSubclass = false;
    for (const rf of resolved.features) {
      const src = rf.source;
      if (src.kind !== "class" && src.kind !== "subclass") continue;
      const belongs = src.kind === "class"
        ? src.slug === entity.slug
        : c.subclass != null && src.slug === c.subclass.slug;
      if (!belongs) continue;
      const lvl = src.level;
      let choices = rf.feature.choices;
      if (!choices?.length) {
        const recognized = recognizeDecision(rf.feature);
        if (recognized === "informational") {
          push(lvl, {
            key: rf.feature.id ?? rf.feature.name, source: src, level: lvl,
            featureName: rf.feature.name,
            description: rf.feature.description ?? rf.feature.entries?.join("\n\n"),
            choice: { kind: "select-inline", id: rf.feature.id ?? rf.feature.name, options: [{ value: "_", label: "_" }] },
            options: [], selected: undefined, status: "informational",
            satisfied: false,
          });
          continue;
        }
        choices = recognized ?? undefined;
      }
      if (!choices?.length) {
        // No structured/synthesized choice — still surface the feature as an
        // informational card so EVERY gained feature appears in the per-level strip
        // (complete view; no silent gaps for plain-flavor features like Blood Price).
        // Skip synthetic resource-only carriers (entity-level resources, no prose).
        if (rf.feature.description || rf.feature.entries?.length) {
          push(lvl, {
            key: rf.feature.id ?? rf.feature.name, source: src, level: lvl,
            featureName: rf.feature.name,
            description: rf.feature.description ?? rf.feature.entries?.join("\n\n"),
            choice: { kind: "select-inline", id: rf.feature.id ?? rf.feature.name, options: [{ value: "_", label: "_" }] },
            options: [], selected: undefined, status: "informational",
            satisfied: false,
          });
        }
        continue;
      }
      for (const ch of choices) {
        // The subclass decision is structural: it reads/writes ClassEntry.subclass.
        if (ch.kind === "select-entity" && ch.entity_type === "subclass") {
          sawAuthoredSubclass = true;
          push(lvl, buildSubclassItem(ch, src, lvl, rf.feature.name, c, ctx, ownerBare, rf.feature.description));
          continue;
        }
        push(lvl, buildItem(ch, src, lvl, rf.feature.name, readAt(lvl), ctx, ownerBare, effective,
          { description: rf.feature.description }));
      }
    }

    // Subclass-pick guarantee (Fix B): when the class declares a subclass_level
    // that the character has reached but NO authored subclass select-entity was
    // emitted (the 2024 Bard gap — alone of 12 classes), synthesize the pick off
    // subclass_level so every owned card offers it. The synthesized choice carries
    // `where: { parent_class: "self" }`, so enumerateOptions filters registry
    // subclasses to this class (matchesFilter resolves "self" → ownerBare). It
    // takes the SAME structural write path as the authored item (key "subclass",
    // routed to setSubclass by the strip's writeValue). Pure over (resolved, registry).
    const subclassLevel = (entity as { subclass_level?: number | null }).subclass_level ?? null;
    if (subclassLevel != null && subclassLevel <= c.level && !sawAuthoredSubclass) {
      const featureName = (entity as { subclass_feature_name?: string | null }).subclass_feature_name ?? "Subclass";
      const synthChoice: Choice = {
        kind: "select-entity", id: "subclass", label: featureName, count: 1,
        entity_type: "subclass", where: { parent_class: "self" },
      };
      push(subclassLevel, buildSubclassItem(
        synthChoice, { kind: "class", slug: entity.slug, level: subclassLevel },
        subclassLevel, featureName, c, ctx, ownerBare));
    }

    // Synthesized pool decisions (Phase 2). Candidates in `pool.available` come
    // pre-filtered (feature_type + available_to + prereq level) from the
    // resolver, so we emit them as `from:` and need NO matchesFilter change —
    // enumerateOptions already resolves a `from` list to options. Each pool
    // becomes ONE select-entity anchored at pool.anchorLevel and persists to
    // class[classIndex].choices[anchorLevel][poolId]; the existing requiredCount
    // /statusOf logic marks it `partial` until `count` picks are made. The
    // `count < 1` guard omits the decision below the unlock level (count 0).
    for (const pool of resolved.pools) {
      if (pool.classIndex !== classIndex || pool.count < 1) continue;
      const synth: Choice = {
        kind: "select-entity", id: pool.id, label: pool.label, count: pool.count,
        entity_type: "optional-feature", from: pool.available.map((e) => e.slug),
      };
      push(pool.anchorLevel, buildItem(
        synth, { kind: "class", slug: entity.slug, level: pool.anchorLevel },
        pool.anchorLevel, pool.label, readAt(pool.anchorLevel), ctx, ownerBare, effective));
    }

    const levels = [...byLevel.entries()]
      .sort(([a], [b]) => a - b)
      .map(([level, items]) => ({ level, items }));
    classes.push({ classIndex, levels });
  });

  // Origin decisions (race entity-level + traits; background entity-level + feature).
  const origin: DecisionItem[] = [];
  const oc = resolved.definition.origin_choices ?? {};
  const originRead = (ns: string) => (id: string): ChoiceValue | undefined => oc[`${ns}:${id}`];
  const pushOrigin = (choices: Choice[] | undefined, ns: "race" | "background",
    source: FeatureSource, featureName: string, ownerBare: string, description?: string) => {
    for (const ch of choices ?? []) {
      origin.push(buildItem(ch, source, 0, featureName, originRead(ns), ctx, ownerBare, effective,
        { description }));
    }
  };
  if (resolved.race) {
    const bare = bareEntitySlug(resolved.race.slug);
    pushOrigin(resolved.race.choices, "race",
      { kind: "race", slug: resolved.race.slug }, resolved.race.name ?? "Race", bare,
      (resolved.race as { description?: string }).description);
    for (const t of resolved.race.traits ?? []) {
      pushOrigin(t.choices, "race", { kind: "race", slug: resolved.race.slug }, t.name, bare,
        (t as { description?: string }).description);
    }
  }
  if (resolved.background) {
    const bare = bareEntitySlug(resolved.background.slug);
    pushOrigin(resolved.background.choices, "background",
      { kind: "background", slug: resolved.background.slug }, resolved.background.name ?? "Background", bare,
      (resolved.background as { description?: string }).description);
    if (resolved.background.feature) {
      pushOrigin((resolved.background.feature as { choices?: Choice[]; description?: string }).choices, "background",
        { kind: "background", slug: resolved.background.slug }, resolved.background.feature.name, bare,
        (resolved.background.feature as { description?: string }).description);
    }
    // Origin feat's OWN choices (e.g. Magic Initiate's spell-list branch + nested
    // spell picks + spellcasting-ability). Read under `background:feat:<id>`:
    // namespace "background" via originRead, child-prefixed "feat:" via buildItem's
    // keyPrefix, so the stored keys are DISJOINT from the bare `background:<id>`
    // background choices above, and match exactly what the resolver's feat spell
    // pass reads. Resolved through the SAME lifted resolver the pipeline uses
    // (variant refs like "Magic Initiate (Cleric)" fold to the base feat).
    if (resolved.background.origin_feat) {
      const originFeat = resolveOriginFeat(
        ctx.registry as unknown as EntityRegistry, resolved.background.origin_feat);
      if (originFeat) {
        const featSource: FeatureSource = { kind: "feat", slug: originFeat.feat.slug };
        const featBare = bareEntitySlug(originFeat.feat.slug);
        for (const ch of originFeat.feat.choices ?? []) {
          origin.push(buildItem(ch, featSource, 0, originFeat.display, originRead("background"),
            ctx, featBare, effective, { keyPrefix: "feat:" }));
        }
      }
    }
  }

  return { classes, origin };
}
