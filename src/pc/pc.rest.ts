import type { EntityRegistry } from "@archivist-gg/core";
import type { Character, DerivedStats, ResolvedCharacter } from "./pc.types";
import { resolveResourceIndex, type ResourceIndex } from "./pc.resources";

function resolveItemName(
  entry: Character["equipment"][number],
  registry: EntityRegistry | null,
): string | undefined {
  if (!registry) return undefined;
  const ref = entry.item.match(/^\[\[(.+?)\]\]$/);
  const slug = ref ? ref[1] : entry.item;
  // `EntityRegistry.getBySlug(slug): RegisteredEntity | undefined` — `RegisteredEntity`
  // has `name: string`. See `@archivist-gg/core`'s entity-registry.
  return registry.getBySlug(slug)?.name;
}

export type RestType = "short" | "long";

export type RestCategoryId =
  | "hp-to-max"
  | "hd-regain"
  | "spell-slots"
  | "pact-slots"
  | "exhaustion"
  | "hp-modifier-reset"
  | `feature:${string}`
  | `item:${number}`
  /** R4-G5 §4.4.2: END an active buff whose carrier declares a structured `duration`. The tail is the STORED
   *  `state.active_buffs` key (a class feature's `id` or a pool entry's resolved `slug`). Emitted by
   *  `pushBuffEnds` below and read by the plugin's `applyRestResets`, whose `buff:` arm removes that key
   *  from `state.active_buffs`. That arm is the plugin half of R4-G5 Task 6: this type is the task's
   *  dnd5e hard edge and is committed first. */
  | `buff:${string}`;

export interface RestCategory {
  id: RestCategoryId;
  label: string;
  preview: string;
  /** R4-G4 §7.2.2: a PARTIAL restore from a `recovery[]` entry of kind `uses` and flavour `rest` (N uses, or "all"),
   *  emitted only when the resource's own `reset` does not already fire at this rest. Absent = the own reset (to 0). */
  restore?: number | "all";
}

export interface RestPlan {
  type: RestType;
  categories: RestCategory[];
  hdAvailable: Array<{ die: string; remaining: number }>;
  /** Internal: per-die HD-regain target captured at plan time so apply is idempotent. */
  hdRegainDist?: Array<{ die: string; targetUsed: number }>;
}

/** The reset triggers a rest of `type` fires. The same vocabulary the two `feature_uses` loops inside
 *  `computeRestPlan` carry inline (left byte-identical; this is the partial-recovery walk's copy, R4-G4 §7.2.2). */
const FIRES_AT: Record<RestType, ReadonlySet<string>> = {
  long: new Set(["short-rest", "long-rest", "either", "dawn", "dusk"]),
  short: new Set(["short-rest", "either"]),
};

/** R4-G4 §7.2.2 · the rest-triggered PARTIAL recovery: for every seeded resource whose own reset does NOT fire at this
 *  rest, a `uses` / `rest`-flavour recovery entry whose `reset` fires here restores N uses (or all). Kind gates first
 *  (a `spell-slots` entry is the card's picker, never a rest category); the own-reset guard keeps a resource from
 *  listing twice (the PHB 2014 Cleric's Channel Divinity owns short-rest and recovers "all" at long-rest). */
function pushPartialRecoveries(cats: RestCategory[], character: Character, index: ResourceIndex, type: RestType): void {
  for (const [key, fu] of Object.entries(character.state.feature_uses ?? {})) {
    if (fu.used <= 0) continue;
    const res = index.get(key);
    if (!res?.recovery?.length) continue;
    if (FIRES_AT[type].has(res.reset)) continue;   // the own reset already restores it fully
    const entry = res.recovery.find((r) => r.kind === "uses" && r.flavour === "rest" && FIRES_AT[type].has(r.entry.reset));
    if (!entry) continue;
    const amount = entry.entry.amount;
    const restore: number | "all" = amount === "all" ? "all" : typeof amount === "number" ? amount : Number(amount);
    // A prose OR formula amount: caption only (§7.2.3). The walk never evaluates the DSL here, and
    // today it never has to · measured 2026-09-06 over every `recovery:` block of the converter corpus
    // and the bundle, `uses`-kind FORMULA carriers = 0 (the only formula amount is the Wizard's
    // `ceil({class_level}/2)` pair, both `restores: spell-slots`, which `resolveRecovery` gives the
    // `spell-slots` kind, so the `r.kind === "uses"` find above never reaches them). The three
    // NON-FINITE `uses`-kind entries in the corpus are all PROSE (Arcane Ward), counted after the
    // guard's own `!== "all"` test: non-numeric STRING amounts of `uses` kind number FIVE, the two
    // `all` carriers included (review C-3). Evaluating the DSL here is G8's.
    if (restore !== "all" && !Number.isFinite(restore)) continue;
    const n = restore === "all" ? fu.used : Math.min(fu.used, restore);
    cats.push({ id: `feature:${key}`, label: res.name, preview: `${n} of ${fu.used} used restored`, restore });
  }
}

/** R4-G5 §4.4.2 · the rest CLEAR: every active buff whose carrier declares a STRUCTURED `duration`
 *  (`{amount, unit}`) ends at EVERY rest. The two keyspaces are named: a class feature answers on
 *  `feature.id`, a pool pick on the RESOLVED entry's `slug` (§9.1).
 *
 *  MEASURED 2026-09-07 (R4-G5 T6 fix round 1, re-measured from the corpora, not copied) at the TWO
 *  positions this walk reads, a Feature's own `duration` and an optional-feature DOCUMENT's own: the
 *  13-book converted output carries 50 structured durations, `{1, minute}` 33 + `{10, minute}` 12 +
 *  `{1, hour}` 5, split 4 class / 44 subclass / 2 optional-feature. The rule is MAGNITUDE-BLIND on that
 *  population, so a homebrew `{1, day}` buff would end at a short rest: the magnitude comparison is a
 *  G8 row, §11.
 *
 *  The POOL arm is a LIVE shipped path, NOT a fixture: Xanathar's Ghostly Gaze (invocation) and Grasping
 *  Arrow (arcane shot) each carry `{amount: 1, unit: minute}` with `activatable: true`, so a Warlock with
 *  Ghostly Gaze active is offered "End Ghostly Gaze" at every rest.
 *
 *  `durationSchema`'s string members (`instantaneous`, `until-dispelled`) never match, and neither read
 *  position carries a string on either corpus (the 11 string durations in the converted output all sit at
 *  `effects[].duration`, a different field this walk never reads). The guard tests `!d` FIRST because
 *  `typeof null === "object"`: `duration: null` ships 0 times today, and the position that CAN carry it is
 *  the POOL ENTRY, whose schema is `durationSchema.nullable().optional()` (`optional-feature.schema.ts`,
 *  `OptionalFeatureEntity.duration?: Duration | null`), while `featureSchema.duration` is `.optional()`
 *  with no `.nullable()`, so a class feature cannot carry `null` past parse (the shipped 2024 Barbarian
 *  carries no `duration` key at all, which is why 2024 Rage is not offered).
 *
 *  The SRD-only install is INERT: 0 structured durations anywhere in the bundle, and 0 of its 7
 *  optional-feature documents carries a `duration` key.
 *
 *  §9.2.4's bare-slug alias is NOT applied here: it lives at the two sites §9.2.4 names
 *  (`assembleEffectFeatures` and the Passive rail), so a buff stored under a COLLAPSED twin's slug folds
 *  and shows a rail tile but is not offered by the rest plan. */
function pushBuffEnds(cats: RestCategory[], character: Character, resolved: ResolvedCharacter): void {
  const structured = (d: unknown): boolean => !!d && typeof d === "object";
  for (const key of character.state.active_buffs ?? []) {
    // `found` is the sentinel, never the name: a matched carrier with a runtime-missing name still emits
    // its category (labelled by the stored key), and the two arms answer a missing name alike.
    let found = false;
    let name = key;
    for (const rf of resolved.features ?? []) {
      if (rf.feature.id === key && structured(rf.feature.duration)) { found = true; name = rf.feature.name ?? key; break; }
    }
    if (!found) {
      for (const pool of resolved.pools ?? []) {
        const entry = [...(pool.selected ?? []), ...(pool.grants ?? [])].find((e) => e.slug === key);
        if (entry && structured(entry.entity.duration)) {
          found = true;
          name = entry.entity.name ?? key;
          break;
        }
      }
    }
    if (!found) continue;
    cats.push({ id: `buff:${key}`, label: `End ${name}`, preview: "active → ended" });
  }
}

export function computeRestPlan(
  character: Character,
  resolved: ResolvedCharacter,
  derived: DerivedStats,
  registry: EntityRegistry | null,
  type: RestType,
): RestPlan {
  const cats: RestCategory[] = [];
  let hdRegainDist: Array<{ die: string; targetUsed: number }> | undefined;
  // R4-G4 §3.2.1: ONE walk over `resolved.features` in place of the per-key
  // `findResourceById` walks this function used to do. DERIVED here, never read off
  // `resolved.resources`: the cast fixtures behind the rest suites in both repos carry
  // no `resources` field (their cast `ResolvedCharacter` literals: dnd5e tests/pc-rest-either.test.ts
  // and tests/pc-rest-hp-modifier.test.ts, plugin tests/pc-rest-resource-reset.test.ts and
  // tests/fixtures/pc/rest-fixtures.ts),
  // so `resolved.resources.get(key)` would throw there, and an optional-chained fallback
  // would let the byte-identical control pass vacuously.
  const index = resolveResourceIndex(resolved);

  // Pact Magic slots reset on BOTH short and long rest (unlike standard slots).
  const pact = character.state.spell_slots_pact;
  if (pact && pact.used > 0) {
    cats.push({ id: "pact-slots", label: "Pact Magic Slots", preview: "all reset" });
  }

  if (type === "long") {
    if (character.state.hp.current < derived.hp.max) {
      cats.push({
        id: "hp-to-max",
        label: "Hit Points",
        preview: `${character.state.hp.current} → ${derived.hp.max}`,
      });
    }

    if (character.state.exhaustion > 0) {
      cats.push({
        id: "exhaustion",
        label: "Exhaustion",
        preview: `${character.state.exhaustion} → ${character.state.exhaustion - 1}`,
      });
    }

    const hpModifier = character.overrides?.hp?.modifier;
    if (hpModifier !== undefined) {
      const signed = hpModifier > 0 ? `+${hpModifier}` : `${hpModifier}`;
      cats.push({
        id: "hp-modifier-reset",
        label: "Max HP Modifier",
        preview: `${signed} → cleared`,
      });
    }

    const slotsUsed = Object.values(character.state.spell_slots ?? {})
      .reduce((s, slot) => s + (slot.used ?? 0), 0);
    if (slotsUsed > 0) {
      cats.push({ id: "spell-slots", label: "Spell Slots", preview: "all reset" });
    }

    // HD regain
    const totalLevel = resolved.totalLevel ?? 0;
    const regainBudget = Math.max(1, Math.floor(totalLevel / 2));
    const pools = Object.entries(character.state.hit_dice ?? {})
      .map(([die, hd]) => ({ die, used: hd.used, total: hd.total }))
      .filter((p) => p.used > 0)
      .sort((a, b) => b.used - a.used);
    if (pools.length > 0) {
      let left = regainBudget;
      const dist: Array<{ die: string; give: number; targetUsed: number }> = [];
      for (const p of pools) {
        if (left === 0) break;
        const give = Math.min(p.used, left);
        if (give > 0) dist.push({ die: p.die, give, targetUsed: p.used - give });
        left -= give;
      }
      const totalGive = dist.reduce((s, d) => s + d.give, 0);
      if (totalGive > 0) {
        const detail = dist.map((d) => `${d.die}: +${d.give}`).join(", ");
        cats.push({
          id: "hd-regain",
          label: "Hit Dice",
          preview: `+${totalGive} (${detail})`,
        });
        hdRegainDist = dist.map((d) => ({ die: d.die, targetUsed: d.targetUsed }));
      }
    }

    // Feature uses · a long rest restores short-rest, long-rest, either, dawn and
    // dusk resets (it spans the night). turn/round are encounter-scoped (never
    // reset by rest). See SP4d Phase 2 spec §5 and R4-G3a §8.2.
    for (const [key, fu] of Object.entries(character.state.feature_uses ?? {})) {
      if (fu.used <= 0) continue;
      const res = index.get(key);
      const reset = res?.reset ?? "long-rest";
      if (reset !== "short-rest" && reset !== "long-rest" && reset !== "either" && reset !== "dawn" && reset !== "dusk") continue;
      cats.push({
        id: `feature:${key}`,
        label: res?.name ?? key,
        preview: `${fu.used}/${fu.max} restored`,
      });
    }
    pushPartialRecoveries(cats, character, index, "long");

    // Item charges — long rest restores short, long, AND dawn (rest spans the night)
    character.equipment.forEach((entry, idx) => {
      const rec = entry.state?.recovery;
      const charges = entry.state?.charges;
      if (!rec || !charges) return;
      if (charges.current >= charges.max) return;
      if (rec.reset !== "short" && rec.reset !== "long" && rec.reset !== "dawn") return;
      const label = entry.overrides?.name
        ?? resolveItemName(entry, registry)
        ?? entry.item;
      cats.push({
        id: `item:${idx}`,
        label,
        preview: `${charges.current} → ${charges.max}`,
      });
    });
  }

  if (type === "short") {
    for (const [key, fu] of Object.entries(character.state.feature_uses ?? {})) {
      if (fu.used <= 0) continue;
      const res = index.get(key);
      // A short rest restores short-rest AND either ("short or long rest").
      const r = res?.reset ?? "long-rest";
      if (r !== "short-rest" && r !== "either") continue;
      cats.push({
        id: `feature:${key}`,
        label: res?.name ?? key,
        preview: `${fu.used}/${fu.max} restored`,
      });
    }
    pushPartialRecoveries(cats, character, index, "short");

    character.equipment.forEach((entry, idx) => {
      const rec = entry.state?.recovery;
      const charges = entry.state?.charges;
      if (!rec || !charges) return;
      if (charges.current >= charges.max) return;
      if (rec.reset !== "short") return;
      const label = entry.overrides?.name ?? resolveItemName(entry, registry) ?? entry.item;
      cats.push({
        id: `item:${idx}`,
        label,
        preview: `${charges.current} → ${charges.max}`,
      });
    });
  }

  pushBuffEnds(cats, character, resolved);

  const hdAvailable = type === "short"
    ? Object.entries(character.state.hit_dice ?? {})
        .filter(([, hd]) => hd.used < hd.total)
        .map(([die, hd]) => ({ die, remaining: hd.total - hd.used }))
    : [];

  return { type, categories: cats, hdAvailable, hdRegainDist };
}
