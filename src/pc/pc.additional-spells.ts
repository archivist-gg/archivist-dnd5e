import type { EntityRegistry, RegisteredEntity } from "@archivist-gg/core";
import type { RaceEntity } from "@archivist-gg/dnd5e/race/race.types";
import type { FeatEntity } from "@archivist-gg/dnd5e/feat/feat.types";
import type { Spell } from "@archivist-gg/dnd5e/spell/spell.types";
import type { Ability } from "@archivist-gg/dnd5e";
import { ABILITY_KEYS } from "@archivist-gg/dnd5e/dnd/constants";
import { warnOnce } from "@archivist-gg/dnd5e/dnd/warn-once";
import { slugify } from "../entities/slug";
import { RACE_STRUCTURAL_PSEUDO } from "../race/race.structural";
import type { ResolvedClass, ResolvedSpell } from "./pc.types";

/** RAW `additional_spells` entry as the registry holds it (`known`/`prepared` are untyped engine-side). */
type RawEntry = { name?: unknown; ability?: unknown; known?: unknown; prepared?: unknown };
type Root = "race" | "feat" | "class" | "subclass";
interface Carrier { root: Root; slug: string; edition?: string; entries: RawEntry[]; comparand: number; classSlug: string | null }

const entriesOf = (a: unknown): RawEntry[] => Array.isArray(a) ? (a as RawEntry[]) : a && typeof a === "object" ? [a as RawEntry] : [];
const editionOf = (x: unknown): string | undefined => { const e = (x as { edition?: unknown } | null)?.edition; return typeof e === "string" ? e : undefined; };
export const prefixOf = (slug: string): string => slug.split("_")[0] ?? slug;

/** §5.2.2 · a raw 5etools / bundle spell ref → the bare NAME slug. The path tail is taken ONLY for a wikilink; a bare
 *  name may legally contain "/" ("blindness/deafness" → "blindnessdeafness", the converter's own slug tail · Gate 0 B1).
 *  The "|source" token is DISCARDED (no abbreviation table exists anywhere); "#c"/"#2" are redundant with entity.level. */
export function normalizeSpellRef(ref: unknown): string | null {
  if (typeof ref !== "string") return null;
  let s = ref.trim();
  const wl = /^\[\[(.+)\]\]$/.exec(s);
  if (wl) {
    // the WIKILINK branch RETURNS here (Gate 1 B B-1): split on "|" FIRST (the bundle stuffs a 5etools ref into the
    // alias slot), then the path tail, then "#", then slugify. No second "|" step: it would silently recover the
    // answer the split-first step exists to give, and the split mutant would survive.
    const target = wl[1].split("|")[0] ?? "";
    const tail = target.split("/").pop() ?? target;
    const w = slugify(tail.replace(/#.*$/, "").trim());
    return w.length > 0 ? w : null;
  }
  s = s.replace(/#.*$/, "");
  s = s.split("|")[0] ?? "";
  const out = slugify(s.trim());
  return out.length > 0 ? out : null;
}

export interface SpellNameIndex { byName: Map<string, RegisteredEntity[]> }
/** ONE scan of the spell bucket per resolve(), keyed on slugify(entity name) · NEVER on the slug tail (Gate 0 B2: the
 *  generators hyphenate "/" where dnd5e's slugify deletes it, so three bundle spells differ). */
export function buildSpellNameIndex(entities: EntityRegistry): SpellNameIndex {
  const byName = new Map<string, RegisteredEntity[]>();
  for (const e of entities.search("", "spell", Number.POSITIVE_INFINITY)) {
    const raw = (e.data as { name?: unknown }).name;
    const key = slugify(typeof raw === "string" ? raw : e.name);
    const list = byName.get(key) ?? []; list.push(e); byName.set(key, list);
  }
  return { byName };
}

/** §5.2.3 · deterministic, no minted vocabulary: (0) the character's own copy · (a) the carrier's compendium exactly ·
 *  (b) same compendium → same edition (skipped when either side lacks one) → lowest full slug · (c) MISS → null + warnOnce ·
 *  (d) ambiguity after (i)+(ii) → (iii) decides AND warnOnce (the decision-engine byBare precedent). */
export function resolveSpellByName(opts: {
  entities: EntityRegistry; index: SpellNameIndex; nameSlug: string; carrierSlug: string; carrierEdition?: string;
  alreadyCollected: ResolvedSpell[];
}): { entity: Spell; slug: string } | null {
  const { entities, index, nameSlug, carrierSlug, carrierEdition, alreadyCollected } = opts;
  const own = alreadyCollected.find((s) => slugify(String(s.entity.name ?? "")) === nameSlug);
  if (own) return { entity: own.entity, slug: own.slug };
  const exact = entities.getByTypeAndSlug("spell", `${prefixOf(carrierSlug)}_spell_${nameSlug}`);
  if (exact) return { entity: exact.data as unknown as Spell, slug: exact.slug };
  const cands = index.byName.get(nameSlug) ?? [];
  if (cands.length === 0) {
    warnOnce(`addspells:miss:${nameSlug}`, `archivist: additional_spells ref "${nameSlug}" matches no spell in the compendium`);
    return null;
  }
  const prefix = prefixOf(carrierSlug);
  let pool = cands.filter((e) => prefixOf(e.slug) === prefix);
  if (pool.length === 0) pool = cands;
  if (carrierEdition !== undefined) { const same = pool.filter((e) => editionOf(e.data) === carrierEdition); if (same.length > 0) pool = same; }
  pool = [...pool].sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  if (pool.length > 1) warnOnce(`addspells:multi:${nameSlug}`, `archivist: additional_spells ref "${nameSlug}" matches ${cands.length} spells; using "${pool[0].slug}"`);
  return { entity: pool[0].data as unknown as Spell, slug: pool[0].slug };
}

type Sel = { kind?: unknown; id?: unknown; options?: unknown };
const hasContentSelectInline = (choices: unknown): boolean =>
  Array.isArray(choices) && choices.some((c: Sel) =>
    (c?.kind === "select-inline" && typeof c.id === "string" && !RACE_STRUCTURAL_PSEUDO.has(c.id)) ||
    (Array.isArray(c?.options) && (c.options as { choices?: unknown }[]).some((o) => hasContentSelectInline(o?.choices))));
/** §5.2.9 · fold a race's entries ONLY when no select-inline on race.choices[] / traits[].choices[] / nested option.choices[]
 *  carries an id outside the structural set (nested: zero carriers, defensive). */
export function raceIsUngated(race: RaceEntity): boolean {
  const r = race as unknown as { choices?: unknown; traits?: { choices?: unknown }[] };
  if (hasContentSelectInline(r.choices)) return false;
  return !(r.traits ?? []).some((t) => hasContentSelectInline(t?.choices));
}

const readAbility = (v: unknown, own: Ability | null): Ability | "choose" | undefined => {
  if (v && typeof v === "object" && "choose" in (v as object)) return "choose";
  if (typeof v !== "string") return undefined;
  if (v === "inherit") return own ?? undefined;
  return (ABILITY_KEYS as readonly string[]).includes(v) ? (v as Ability) : undefined;
};
/** "In-slice leaf" (§5.2.1), defined ONCE and applied by the sibling gate EXACTLY as the fold applies it (Gate 2 B-2): the
 *  entry's ability is not `{choose}`, the level key is `_` or <= the comparand, and the value is an array with a string member. */
const entryHasInSliceLeaf = (e: RawEntry, comparand: number, own: Ability | null): boolean =>
  readAbility(e.ability, own) !== "choose" &&
  (["known", "prepared"] as const).some((b) => { const lv = e[b]; return !!lv && typeof lv === "object" && !Array.isArray(lv) &&
    Object.entries(lv as Record<string, unknown>).some(([k, v]) => (k === "_" || Number(k) <= comparand) && Array.isArray(v) && v.some((x) => typeof x === "string")); });

/** §5.2.1 · the reader. Every object it receives is the RAW registry entity; nothing is mutated. */
export function collectAdditionalSpells(args: {
  race: RaceEntity | null; feats: FeatEntity[]; classes: ResolvedClass[]; totalLevel: number; ownAbility: Ability | null;
  alreadyCollected: ResolvedSpell[]; entities: EntityRegistry; warnings: string[];
}): ResolvedSpell[] {
  const { race, feats, classes, totalLevel, ownAbility, alreadyCollected, entities, warnings } = args;
  const index = buildSpellNameIndex(entities);
  const out: ResolvedSpell[] = [];
  const carriers: Carrier[] = [];
  const asRaw = (x: unknown) => (x as { additional_spells?: unknown } | null)?.additional_spells;
  if (race && raceIsUngated(race)) carriers.push({ root: "race", slug: race.slug, edition: editionOf(race), entries: entriesOf(asRaw(race)), comparand: totalLevel, classSlug: null });
  for (const f of feats) carriers.push({ root: "feat", slug: f.slug, edition: editionOf(f), entries: entriesOf(asRaw(f)), comparand: totalLevel, classSlug: null });
  for (const c of classes) {
    if (!c.entity) continue;
    carriers.push({ root: "class", slug: c.entity.slug, edition: editionOf(c.entity), entries: entriesOf(asRaw(c.entity)), comparand: c.level, classSlug: c.entity.slug });
    if (c.subclass) carriers.push({ root: "subclass", slug: c.subclass.slug, edition: editionOf(c.subclass), entries: entriesOf(asRaw(c.subclass)), comparand: c.level, classSlug: c.entity.slug });
  }
  for (const car of carriers) {
    if (car.entries.length === 0) continue;
    if (car.entries.length > 1) {   // the sibling gate (§5.2.1; Gate 0 B3/Q2): every multi-entry carrier is a choose-one shape
      if (car.entries.some((e) => entryHasInSliceLeaf(e, car.comparand, ownAbility))) warnOnce(`addspells:siblings:${car.slug}`, `archivist: additional_spells on "${car.slug}" has ${car.entries.length} sibling entries (a choose-one grant); skipped`);
      continue;
    }
    const entry = car.entries[0];
    const ability = readAbility(entry.ability, ownAbility);
    if (ability === "choose") continue;
    for (const bucket of ["known", "prepared"] as const) {
      const levels = entry[bucket];
      if (!levels || typeof levels !== "object" || Array.isArray(levels)) continue;
      for (const [k, v] of Object.entries(levels as Record<string, unknown>)) {
        if (!(k === "_" || Number(k) <= car.comparand)) continue;
        if (!Array.isArray(v)) { warnOnce(`addspells:usage:${car.slug}:${bucket}:${k}`, `archivist: additional_spells on "${car.slug}" ${bucket}.${k} is a usage economy (skipped; G8)`); continue; }
        for (const leaf of v) {
          const nameSlug = normalizeSpellRef(leaf);
          if (!nameSlug) continue;
          const hit = resolveSpellByName({ entities, index, nameSlug, carrierSlug: car.slug, carrierEdition: car.edition, alreadyCollected: [...alreadyCollected, ...out] });
          if (!hit) { warnings.push(`additional_spells ref "${String(leaf)}" on ${car.slug} not found in compendium.`); continue; }
          out.push({ entity: hit.entity, slug: hit.slug, classSlug: car.classSlug,
            source: car.root === "race" ? "race" : car.root === "feat" ? "feat" : "class",
            prepared: true, alwaysPrepared: true, ...(ability ? { ability } : {}) });
        }
      }
    }
  }
  return out;
}
