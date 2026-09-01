import { describe, it, expect } from "vitest";
import { wikilinkTailSlug, buildDecisionLedger } from "../src/pc/pc.decision-engine";
import { resolveOriginFeat } from "../src/pc/pc.resolver";
import { resolvePool } from "../src/pc/pc.pools";
import { buildMockRegistry } from "./mock-entity-registry";
import type { ResolvedCharacter, ResolvedClass } from "../src/pc/pc.types";

// ---------------------------------------------------------------------------
// R4-G2 Task 5 · spec §7 / §11 floor 7 · the slugify-backed `wikilinkTailSlug`.
//
// NO test pinned this helper anywhere before this file (Gate 2 I-3; the only
// test-tree mention was the prose comment at `tests/pc-pools.test.ts:83`).
//
// RED-FIRST vs CONTROL, declared up front so the split is auditable:
//   RED     — the three apostrophe cases (helper, origin-feat path, pools path).
//             Pre-fix the regex mints `mage-s-bane` (the `'` becomes a hyphen);
//             registry slugs carry `mages-bane`, so every one of them misses.
//   CONTROL — `Lords' Alliance Agent` (apostrophe+space collapse identically
//             under BOTH transforms — spec §7's named negative control) and the
//             full-slug pin (the engine resolves a stored `srd-2024_…` slug via
//             the DIRECT `getByTypeAndSlug` path, which never calls this helper).
//             Both are green pre-fix AND post-fix BY DESIGN (Gate 2 M-2); they
//             are future-regression guards, not kill-power carriers.
// ---------------------------------------------------------------------------

describe("wikilinkTailSlug — the tail transform", () => {
  it("RED-FIRST: an apostrophe is DELETED, not hyphenated (`Mage's Bane` → `mages-bane`)", () => {
    // Registry slugs are minted by `slugify`, which strips `'` outright. The
    // pre-fix regex turned the `'` into a hyphen (`mage-s-bane`) and missed.
    expect(wikilinkTailSlug("[[Feats/Mage's Bane]]")).toBe("mages-bane");
  });

  it("CONTROL (green both sides by design): `Lords' Alliance Agent` — apostrophe+space collapse", () => {
    // Spec §7's named NEGATIVE control: `' ` is one run of non-alphanumerics for
    // the old regex and a stripped-apostrophe-then-space for slugify, so both
    // transforms land on the identical slug. Proves the fix is surgical.
    expect(wikilinkTailSlug("[[Forgotten Realms: Heroes of Faerun/Backgrounds/Lords' Alliance Agent]]"))
      .toBe("lords-alliance-agent");
  });

  it("CONTROL (green both sides by design): a plain path tail is unchanged", () => {
    expect(wikilinkTailSlug("[[SRD 2024/Classes/Fighter]]")).toBe("fighter");
    expect(wikilinkTailSlug("[[SRD 2024/Feats/Magic Initiate (Cleric)]]")).toBe("magic-initiate-cleric");
  });

  it("CONTROL (green both sides by design): a FULL slug is mangled — never route one through it", () => {
    // Both transforms destroy the `_`: the regex hyphenates it, slugify deletes
    // it. The value of this pin is the INEQUALITY — it is the reason
    // `resolveEntityRef` strips the wikilink WITHOUT slugifying.
    expect(wikilinkTailSlug("[[srd-2024_magic-initiate]]")).not.toBe("srd-2024_magic-initiate");
  });
});

// ---------------------------------------------------------------------------
// Kill-power carrier (Gate 0 I-3, spec §7): the ORIGIN-FEAT path. The helper
// alone could be "fixed" without any consumer noticing; this drives the fix
// through `resolveOriginFeat` (`pc.resolver.ts:58`), the dnd5e half of the
// origin-feat pair whose plugin half is `background-block.ts:58`.
// ---------------------------------------------------------------------------

describe("resolveOriginFeat — the origin-feat path (kill-power carrier)", () => {
  const featRegistry = () =>
    buildMockRegistry([
      {
        slug: "srd-2024_mages-bane",
        entityType: "feat",
        name: "Mage's Bane",
        data: { slug: "srd-2024_mages-bane", name: "Mage's Bane", description: "d", effects: [] },
      },
    ]);

  it("RED-FIRST: an apostrophe origin_feat ref resolves to its registered feat", () => {
    // Pre-fix the tail slugs to `mage-s-bane`, which matches neither the exact
    // slug nor the `_<bare>` suffix; the parenthetical-variant fallback does not
    // fire (no parentheses), so the whole resolution returns null and the
    // background silently grants NO feat.
    const found = resolveOriginFeat(featRegistry(), "[[SRD 2024/Feats/Mage's Bane]]");
    expect(found).not.toBeNull();
    expect(found!.feat.slug).toBe("srd-2024_mages-bane");
    expect(found!.display).toBe("Mage's Bane");
  });

  it("CONTROL (green both sides by design): a punctuation-free ref still resolves", () => {
    const reg = buildMockRegistry([
      {
        slug: "srd-2024_alert",
        entityType: "feat",
        name: "Alert",
        data: { slug: "srd-2024_alert", name: "Alert", description: "d", effects: [] },
      },
    ]);
    expect(resolveOriginFeat(reg, "[[SRD 2024/Feats/Alert]]")!.feat.slug).toBe("srd-2024_alert");
  });
});

// ---------------------------------------------------------------------------
// The pools path (`pc.pools.ts:77`, `pool_grants[].feature`). AUTHORED FIXTURE,
// named as such per spec §7: the corpus carries ZERO natural `grants[].feature`
// values with an apostrophe, so this fixture is invented to exercise the code
// path, not sampled from real data. It still kills the mutant: pre-fix the
// grant dereferences nothing and the pool renders no granted entry.
// ---------------------------------------------------------------------------

describe("resolvePool — pool_grants feature refs (AUTHORED fixture, not corpus-sampled)", () => {
  const pool = {
    id: "interdict-boons",
    label: "Interdict Boons",
    source: {
      entity_type: "optional-feature" as const,
      where: { feature_type: "interdict-boon", available_to: "self" as const },
    },
    count: { column: "Interdict Boons" },
  };

  const registry = () =>
    buildMockRegistry([
      {
        slug: "hb_mages-bane",
        entityType: "optional-feature",
        name: "Mage's Bane",
        data: {
          slug: "hb_mages-bane", name: "Mage's Bane", edition: "2014", source: "hb",
          feature_type: "interdict-boon", description: "", effects: [],
          available_to: ["[[reaver]]"], prerequisites: [],
        },
      },
    ]);

  function mkClass(): ResolvedClass {
    return {
      entity: {
        slug: "reaver", name: "Reaver",
        table: { 2: { columns: { "Interdict Boons": 1 }, prof_bonus: 2, feature_ids: [] } },
      },
      level: 5,
      subclass: {
        slug: "asmodeus",
        pool_grants: [
          { pool: "interdict-boons", grants: [{ feature: "[[Mage's Bane]]", at_level: 1 }] },
        ],
      },
      choices: {},
    } as unknown as ResolvedClass;
  }

  it("RED-FIRST: an apostrophe grant ref dereferences to the registered boon", () => {
    // `byBare` is keyed by `bareEntitySlug("hb_mages-bane")` = "mages-bane".
    // Pre-fix `wikilinkTailSlug("[[Mage's Bane]]")` = "mage-s-bane" → map miss →
    // the grant is filtered out and `grants` comes back EMPTY.
    const r = resolvePool(mkClass(), 0, pool, registry());
    expect(r.grants.map((e) => e.slug)).toEqual(["hb_mages-bane"]);
  });
});

// ---------------------------------------------------------------------------
// The full-slug pin, driven through the ENGINE (not the helper): a persisted
// select-entity value that is a full `<prefix>_<name>` slug must resolve via
// `resolveEntityRef`'s DIRECT `getByTypeAndSlug` branch, which strips the
// wikilink WITHOUT slugifying. Green pre-fix AND post-fix by design — it guards
// against a future "simplification" that routes the stored value through
// `wikilinkTailSlug`, which would mangle the `_` under EITHER transform.
// ---------------------------------------------------------------------------

describe("resolveEntityRef via buildDecisionLedger — full slugs bypass the tail helper (CONTROL)", () => {
  function mkResolved(choices: Record<number, Record<string, unknown>>): ResolvedCharacter {
    const entity = {
      slug: "srd-2024_fighter", name: "Fighter",
      choices: [{ kind: "select-entity", id: "origin-feat", label: "Origin Feat", count: 1, entity_type: "feat" }],
      features_by_level: {}, starting_equipment: [],
    };
    const state = {
      hp: { current: 1, max: 1, temp: 0 }, hit_dice: {}, spell_slots: {}, concentration: null,
      conditions: [], exhaustion: 0, inspiration: 0, feature_uses: {},
    };
    const definition = {
      name: "T", edition: "2024", race: null, subrace: null, background: null,
      class: [{ name: "[[fighter]]", level: 1, subclass: null, choices }],
      abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
      ability_method: "manual", skills: { proficient: [], expertise: [] },
      spells: { known: [], overrides: [] }, equipment: [], overrides: {}, origin_choices: {}, state,
    } as unknown as ResolvedCharacter["definition"];
    const cls = { entity, level: 1, subclass: null, choices } as unknown as ResolvedCharacter["classes"][number];
    return {
      definition, race: null, classes: [cls], background: null, feats: [],
      totalLevel: 1, features: [], spells: [], pools: [], state,
    } as unknown as ResolvedCharacter;
  }

  it("CONTROL (green both sides by design): a stored `srd-2024_magic-initiate` surfaces the feat's own children", () => {
    const registry = buildMockRegistry([
      {
        slug: "srd-2024_magic-initiate",
        entityType: "feat",
        name: "Magic Initiate",
        data: {
          slug: "srd-2024_magic-initiate", name: "Magic Initiate",
          choices: [
            { kind: "select-inline", id: "spell-list", count: 1, options: [
              { value: "cleric", label: "Cleric" }, { value: "wizard", label: "Wizard" }] },
          ],
        },
      },
    ]);
    const ledger = buildDecisionLedger(
      mkResolved({ 1: { "origin-feat": "[[srd-2024_magic-initiate]]" } }),
      { registry },
    );
    const items = ledger.classes[0].levels.flatMap((l) => l.items);
    const item = items.find((i) => i.key === "origin-feat")!;
    expect(item).toBeDefined();
    expect(item.children?.map((c) => c.key)).toEqual(["feat:spell-list"]);
  });
});
