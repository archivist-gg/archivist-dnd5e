# The renderer seam — how to write a renderer over `@archivist/{core,dnd5e}`

> Audience: anyone building a *renderer* (an Obsidian plugin, a web sheet, a static
> exporter, a Discord bot, a VTT bridge) that wants to display or drive a D&D 5e
> character without re-implementing the rules engine.
>
> This document describes the **seam** between the two published packages
> (`@archivist/core`, `@archivist/dnd5e`) and the renderer that sits on top of them.
> It is the durable narrative behind the executable proof in
> [`tests/renderer-sufficiency.smoke.test.ts`](../tests/renderer-sufficiency.smoke.test.ts):
> a full read surface exercised with **zero** dependency on Obsidian or on any
> specific renderer. If you can build a registry and run the pipeline, you can draw
> a complete character sheet.

---

## 1. The contract (D7): consume data + pure functions, then draw freely

There is exactly one contract, and it is a **read/compute** contract, not a
**view/render** contract:

> A renderer **consumes `@archivist/dnd5e/*` data types + pure functions**, builds an
> **`EntityRegistry`** from `@archivist/core`, feeds a character document through the
> pipeline, and reads the resulting **`DerivedStats`**. From there it **draws
> freely** — layout, wording, section order, tabs, colours, interaction model, and
> DOM (or React tree, or Markdown, or ANSI) are 100% the renderer's business.

What this contract deliberately **does not** include:

- **No view-model.** The packages never hand you a `SheetViewModel`, a `PanelSpec`,
  or anything pre-arranged for display.
- **No `present()` / `render()` entry point.** There is no function whose job is to
  turn a character into "what to show". The last computed thing the packages give
  you is the domain model (`DerivedStats`), not a presentation of it.
- **No `EntityView` / render AST.** The packages emit no intermediate tree of
  boxes/rows/tabs for a renderer to interpret. There is nothing to "walk".

`DerivedStats` **is the pack's domain model** — the fully-derived, rules-correct
numbers and collections for one character (ability math, saves, skills, HP/AC/speed,
attacks, spellcasting, defenses, senses, attunement, AC breakdowns, …). It is a
*model*, not a *layout*. The renderer decides that AC is a big number top-left, that
attacks are a table, that spell slots are pips — the pack has no opinion. Two very
different-looking sheets can read the identical `DerivedStats`.

This is the D7 property that Phase 4 exists to prove: **the packages are
render-sufficient and render-agnostic.** Everything a sheet needs to *display* is
reachable through `@archivist/{core,dnd5e}`; nothing about *how* it displays leaks
back into the packages.

---

## 2. The read API surface

Everything below is a real, importable subpath. Import from the **subpath**, not from
the package root — the `exports` map exposes each module individually so a renderer
pulls in exactly what it uses. Grouped by concern:

### Parse — `@archivist/dnd5e/pc/pc.parser`
- `parsePC(source: string): ParseResult<Character>` — parse the YAML body of a `pc`
  document into a validated `Character`. Returns a **discriminated** `ParseResult`
  (from `@archivist/core`); see §3 gotcha (a).

### Resolve — `@archivist/dnd5e/pc/pc.resolver`
- `class PCResolver` — `new PCResolver(registry).resolve(character)` links the
  character's slug references (race/class/subclass/background/feats/spells/items)
  against the registry, producing a `ResolveResult = { character: ResolvedCharacter,
  warnings: string[] }`. See §3 gotcha (b).

### Derive — `@archivist/dnd5e/pc/pc.recalc` + `@archivist/dnd5e/pc/pc.types`
- `recalc(resolved: ResolvedCharacter, registry?: EntityRegistry): DerivedStats` — the
  single call that computes the whole domain model. **Pass the registry** (§3 gotcha
  (c)); `computeProficiencies` also lives here.
- `pc/pc.types` is the **type contract**: `DerivedStats`, `ResolvedCharacter`, and the
  supporting shapes (`Ability`, `SkillSlug`, attack rows, spellcasting blocks, …). A
  renderer imports these as `import type` to type its read sites.

> **Save proficiencies — read `DerivedStats.saves[ability].proficient`, not
> `DerivedStats.proficiencies.saves`.** `DerivedStats.proficiencies.saves` is a legacy
> **placeholder**: `computeProficiencies` (in `pc.recalc`) returns `saves: []`
> unconditionally, so `proficiencies.saves` is *always* an empty array. The **source
> of truth** for whether a character is proficient in a saving throw is the per-ability
> flag `DerivedStats.saves[ability].proficient` (populated from the **first** class's
> `saving_throws`, per the 5e multiclass rule — you gain save proficiencies only from
> your first class). A renderer that reads `proficiencies.saves` to render the little
> save-proficiency dots will draw *nothing*; read `saves.<ability>.proficient` instead.
> (This is asserted directly in the smoke's `A5`.)

### Spell access, scaling, filtering
- `@archivist/dnd5e/spell/spell.access` — `classSpellCandidates(registry, classSlugs,
  maxLevel, knownSlugs, showAll?, query?)`: the spells a caster *could* learn/prepare
  (list membership + level gate, minus what's already known).
- `@archivist/dnd5e/spell/spell.scaling` — `spellEffectAtSlot`, `upcastLevelsFor`:
  upcast/at-higher-levels computation for a spell cast in a given slot.
- `@archivist/dnd5e/spell/spell.filter` — `compareCandidates`, `castTimeCategory`:
  pure sort/bucket helpers for a spell picker (name/level sort, cast-time buckets).

### Decisions + proficiencies
- `@archivist/dnd5e/pc/pc.decision-engine` — read-fold of *persisted* choices:
  `collectChosenProficiencies(resolved)` (skills/expertise/languages/tools the player
  actually picked via class-feature decisions) and `collectChosenAbilityPoints(resolved)`
  (origin ASI points). Note these fold from persisted **decision choices**, which is
  distinct from the aggregate buckets below.
- `@archivist/dnd5e/pc/pc.proficiencies` — `aggregateProficiencies(resolved)`
  (`ProficiencyAggregate`): the merged, deduplicated proficiency set across all sources.

### Rest + resources
- `@archivist/dnd5e/pc/pc.rest` — `computeRestPlan(character, resolved, derived,
  registry, type)`: what a short/long rest *would* reset (slots, hit dice, HP,
  feature uses), grouped into `categories`. This is the **read/preview** half —
  applying the reset is renderer-owned (see §4).
- `@archivist/dnd5e/pc/pc.pools` — `resolvePool`, `resolveAllPools`: resolve
  selection pools (e.g. subclass/feat pools) against the registry for display.

### Item actions + conditions
- `@archivist/dnd5e/item/item.actions-map` — `ITEM_ACTIONS`, `resolveItemAction(slug,
  entry)`: the curated map of usable-item actions (wands, potions, …) and the resolver
  that returns an action or `null`.
- `@archivist/dnd5e/item/item.conditions` — `evaluateCondition(cond, ctx)`: evaluate a
  structured item condition to a `ConditionOutcome` string (`"true"` / `"false"` /
  `"informational"`).
- `@archivist/dnd5e/item/item.conditions.types` — `ConditionContext` and the condition
  type shapes a renderer passes into `evaluateCondition` / `readNumericBonus`.
- `@archivist/dnd5e/item/item.bonuses` — `readNumericBonus(bonus, ctx)`: resolve a
  possibly-conditional numeric item bonus into `{ kind: "applied" | "skipped" |
  "informational", … }` or `null`. Lets a renderer show *conditional* bonuses (e.g. "+2 AC
  vs undead") in an informational sidebar without mis-applying them to the flat AC.
  (`"skipped"` is a conditional bonus whose condition is *not* met — a renderer switching
  exhaustively on `.kind` should hide/skip it rather than apply or surface it.)
- `@archivist/dnd5e/item/item.attunement` — `requiresAttunement(entity)`: whether an
  item needs attunement (reads `entity.attunement`).

### Registry + base-item / class-slug helpers
- `@archivist/core` — `EntityRegistry`: the renderer-built compendium the pipeline
  reads from. You populate it with the class/subclass/race/background/feat/spell/
  weapon/armor/item entities your character references. `@archivist/core` also owns
  `ParseResult` (the discriminated result `parsePC` returns).
- `@archivist/dnd5e/entities/base-item-resolver` — `resolveBaseItem`,
  `resolveBaseItemOfType`: match a magic/variant item onto its SRD base item so its
  AC/attack/weight are inherited. Slug alignment matters here (see §5 gotcha (a)).
- `@archivist/dnd5e/class/class.slug` — `bareSlug`, `baseClassName`: normalize class
  references (strip subclass suffixes, etc.) when keying the registry.

> **Coverage note.** The smoke imports exactly 14 pack subpaths; all 14 are documented
> above (`pc.parser`, `pc.resolver`, `pc.recalc`, `pc.types`, `pc.decision-engine`,
> `pc.rest`, `spell.access`, `spell.scaling`, `spell.filter`, `item.actions-map`,
> `item.conditions`, `item.conditions.types`, `item.bonuses`, `item.attunement`). This
> section is an intentional **superset** — it also documents `pc.proficiencies`,
> `pc.pools`, `entities/base-item-resolver`, and `class/class.slug`, which the full
> contract exposes even though the smoke does not exercise every one.

---

## 3. The pipeline walkthrough

The whole read surface hangs off one four-step pipeline:

```
parsePC(yaml) ──► new PCResolver(registry).resolve(character) ──► recalc(resolved, registry) ──► read DerivedStats
```

The worked example is [`tests/renderer-sufficiency.smoke.test.ts`](../tests/renderer-sufficiency.smoke.test.ts).
Its core is four lines:

```ts
const parsed = parsePC(CHARACTER_YAML);
if (!parsed.success) throw new Error(`fixture parse failed: ${parsed.error}`);
const registry = buildRegistry();                                  // EntityRegistry from @archivist/core
const { character: resolved, warnings } = new PCResolver(registry).resolve(parsed.data);
const derived: DerivedStats = recalc(resolved, registry);
```

From `derived` (plus a few standalone read-computes like `classSpellCandidates` and
`computeRestPlan`), the smoke reads **every** render surface a sheet needs — ability
math, saves/skills, HP/AC/speed/initiative, attack rows, aggregate proficiencies,
defenses, senses/passives, attunement/slots/weight, the spellcasting block,
conditions/AC breakdown, spell candidates, rest plan, item actions, conditional
bonuses, currency. If your renderer can reproduce these four lines, it can draw the
sheet.

### The three gotchas (each has bitten; each is load-bearing)

**(a) `parsePC` returns a *discriminated* `ParseResult` — narrow on `.success`
before touching `.data`.** The return is not the `Character` directly; it is
`{ success: true, data: Character } | { success: false, error: … }`. You **must**
narrow on `.success` first — TypeScript will not let you read `.data` on the union,
and skipping the check means silently rendering a half-parsed document on malformed
input. In the smoke:

```ts
const parsed = parsePC(CHARACTER_YAML);
if (!parsed.success) throw new Error(`fixture parse failed: ${parsed.error}`);
// only now is parsed.data a Character
```

**(b) `PCResolver.resolve` returns a `ResolveResult` *wrapper*, not the character —
destructure `{ character: resolved }`.** `resolve()` returns
`{ character: ResolvedCharacter, warnings: string[] }`. The thing the next step wants
is the **`.character`**, not the wrapper. Passing the whole `ResolveResult` into
`recalc` is a type error at best and a silent mis-derive at worst. Destructure it — and
surface `warnings` so a mistyped registry slug can't silently degrade the sheet:

```ts
const { character: resolved, warnings } = new PCResolver(registry).resolve(parsed.data);
if (warnings.length) console.warn("resolver warnings:", warnings);
```

**(c) `recalc(resolved, registry)` takes the `EntityRegistry` as its *second*
argument — omit it and equipment/attacks/item-bonuses silently vanish.** The registry
parameter is optional in the signature (`registry?: EntityRegistry`), so
`recalc(resolved)` compiles cleanly — but with no registry, `recalc` cannot resolve
equipped weapons/armor/items, so **`derived.attacks`, the item-derived slice of
`derived.ac`, attunement, and every item bonus quietly disappear** with no error. Always
pass the same registry you resolved with:

```ts
const derived = recalc(resolved, registry);   // NOT recalc(resolved)
```

---

## 4. What stays renderer-owned

The packages stop at the domain model. Everything past it is the renderer's, in two
buckets:

**Presentation / formatting.** All `format*` / `describe*` helpers, `conditionToText`,
section and field **order**, tabs, panels, layout, colours, and the DOM/React/Markdown
output itself. The pack gives you `derived.ac = 20`; the renderer decides it's a shield
glyph with "20" inside. The pack gives you `derived.attacks`; the renderer decides
columns, sorting, and how a breakdown tooltip reads.

**All edit / write.** The pack is **read-only** with respect to the character document.
Every mutation lives on the renderer side:

- `applyRestResets` — *applying* the rest plan (§2's `computeRestPlan` only *previews* it).
- `seedFeatureUses` — seeding/initializing per-feature use counters.
- **fence-IO** — reading/writing the `pc` fence back into the `.md` file.
- `characterToYaml` — serializing a `Character` back to YAML.
- `pc.edit-state`, `pc.equipment-edit` — the interactive edit/builder state machines.
- **point-buy** — the ability-score buy UI/logic.

> **Scope-A boundary.** In this architecture, *editing a character* **is** editing the
> raw `.md` / YAML document (via the renderer's write layer), which is then re-parsed
> through §3's pipeline. The packages never mutate; a renderer that wants to change a
> character rewrites the source and re-runs `parsePC → resolve → recalc`. There is no
> "setter" API on `DerivedStats`.

---

## 5. Gotchas for a real (non-test) renderer

The smoke hand-builds a tiny registry, so two real-world concerns don't show up there.
A production renderer will hit both.

**(a) SRD-slug alignment — the registry and the character document must agree on
slugs.** `recalc`/`base-item-resolver` match a character's equipment/references to
registry entities **by slug**. If you populate the registry from one source (e.g. SRD
JSON via a `SrdStore`) but the character's `.md` frontmatter was authored against
slightly different slugs (`long-sword` vs `longsword`, `dark-elf` vs `drow`), the
lookups miss: a magic longsword won't find its base item, so its AC/attack/weight
won't inherit and `resolveBaseItem` returns nothing. The failure is **silent** — no
error, just a weapon with no damage or a magic item with no bonus. Normalize slugs on
**both** sides (see `class/class.slug`'s `bareSlug`/`baseClassName` for the class case)
and make your compendium's slugs the single source the frontmatter is authored against.

**(b) Build wiring — four things must line up.** The packages ship **TypeScript
source** (the `exports` map points at `./src/**/*.ts`, there is no prebuild/`dist`), so
the consumer's bundler compiles them:

1. **Sibling `file:` path deps.** `@archivist/dnd5e` depends on `@archivist/core` via
   `"@archivist/core": "file:../archivist-core"`, and a renderer depends on both the
   same way. The three repos must sit as siblings on disk (or be resolvable by your
   package manager) for the `file:` links to work.
2. **`exports`-mapped TS source.** Because the subpaths resolve to `.ts`, your build
   must handle TypeScript from `node_modules`/linked packages (esbuild and Vite do this
   out of the box; a plain `tsc` consumer needs the source in its `include`/refs).
3. **tsconfig project references.** Point the consumer's `tsconfig` at the packages
   (project refs / path mappings) so types resolve and incremental builds see the
   source.
4. **The zod / js-yaml dedup alias — this is the one that bit us.** `@archivist/dnd5e`
   uses `zod` and `js-yaml`; so does the renderer and often `@archivist/core`. Without
   deduplication the bundler pulls **two copies** of zod (and js-yaml) — one for the
   package, one for the app — which breaks `instanceof` checks and roughly doubles that
   slice of the bundle. Add an esbuild/Vite **alias** forcing `zod` and `js-yaml` to a
   single resolved copy. This double-bundle regression bit the 3A repo splits and again
   in Phase 2; the alias is the fix. (Naive excision made the plugin bundle *grow* ~6%;
   the cwd-anchored dedup alias turned that into a ~1% *shrink*.)

---

## 6. Context — why the seam is shaped this way

This document is the "how". The "why" lives in the plugin repo (`archivist-obsidian`),
and these are one-way **forward** references (read them for background; nothing here
depends on them):

- **`docs/design/decoupling-roadmap.md`** (in `archivist-obsidian`) — the north-star
  arc: Archivist as *convention + swappable layers*, splitting the monolith into
  independently-versioned packages so third parties can ship their own renderers,
  content packs, and generators against a public convention. The renderer seam
  documented here is the concrete deliverable of that roadmap's decoupling movement.
- **`docs/design/layered-pack-architecture.md`** (in `archivist-obsidian`) — the layer
  model (data / codec / read-compute / write / render) and *why* read-compute belongs in
  the pack while formatting and write stay in the renderer. Section 4 above ("what stays
  renderer-owned") is that boundary in practice.

If you are writing a renderer, start from §3's four lines, keep §4's boundary, and heed
§3's three gotchas and §5's two build concerns — that is the entire seam.
