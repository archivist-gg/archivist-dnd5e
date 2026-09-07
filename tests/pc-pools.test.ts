import { describe, it, expect, beforeEach, vi } from "vitest";
import { resolvePool, resolveAllPools, strandedPicks, type PoolRegistry } from "../src/pc/pc.pools";
import { __resetWarnOnceForTests } from "../src/dnd/warn-once";
import type { ResolvedCharacter, ResolvedClass } from "../src/pc/pc.types";
import type { ResolvedResource } from "../src/pc/pc.resources";

/** The pools these fixtures resolve own no resources, so the owner-aware intersection
 *  (R4-G4 §4.2.3) has nothing to match and `resource` stays undefined on every one.
 *  Typed, not a bare `new Map()` (review M-6): a bare one infers `Map<any, any>`, which stays
 *  assignable to `ReadonlyMap<string, ResolvedResource>` through the `any`s, so the legacy call
 *  sites below would keep compiling if the index's key or value type changed under them. */
const NO_INDEX = new Map<string, ResolvedResource>();

function of(slug: string, ft: string, levelMin?: number) {
  return {
    slug, name: slug, type: "optional-feature",
    data: {
      slug, name: slug, edition: "2014", source: "hb",
      feature_type: ft, description: "", effects: [],
      available_to: ["[[reaver]]"],
      prerequisites: levelMin ? [{ kind: "level", min: levelMin }] : [],
    },
  };
}

function mkRegistry(entities: ReturnType<typeof of>[]): PoolRegistry {
  return {
    search: (_q, type) => (type === "optional-feature" ? entities : []) as never,
    getByTypeAndSlug: (type, slug) =>
      (type === "optional-feature" ? entities.find((e) => e.slug === slug) : undefined) as never,
  };
}

const boons = [
  of("baleful-glare", "interdict-boon"),
  of("hell-mage", "interdict-boon", 7),
  of("not-a-boon", "metamagic"),
];

function mkClass(level: number, choices: Record<number, Record<string, unknown>> = {}): ResolvedClass {
  return {
    entity: {
      slug: "reaver", name: "Reaver",
      table: { 2: { columns: { "Interdict Boons": 1 }, prof_bonus: 2, feature_ids: [] },
               7: { columns: { "Interdict Boons": 3 }, prof_bonus: 3, feature_ids: [] } },
    } as never,
    level,
    subclass: null,
    choices: choices as never,
  };
}

const pool = {
  id: "interdict-boons", label: "Interdict Boons",
  source: { entity_type: "optional-feature" as const, where: { feature_type: "interdict-boon", available_to: "self" as const } },
  count: { column: "Interdict Boons" },
};

describe("resolvePool", () => {
  it("reads count from the class table column at the current level", () => {
    const r = resolvePool(mkClass(7), 0, pool, mkRegistry(boons), NO_INDEX);
    expect(r.count).toBe(3);
  });
  it("anchors at the lowest level where count >= 1", () => {
    const r = resolvePool(mkClass(7), 0, pool, mkRegistry(boons), NO_INDEX);
    expect(r.anchorLevel).toBe(2);
  });
  it("filters candidates by feature_type and available_to", () => {
    const r = resolvePool(mkClass(7), 0, pool, mkRegistry(boons), NO_INDEX);
    expect(r.available.map((e) => e.slug).sort()).toEqual(["baleful-glare", "hell-mage"]);
  });
  it("excludes candidates whose level prereq exceeds the current level", () => {
    const r = resolvePool(mkClass(2), 0, pool, mkRegistry(boons), NO_INDEX);
    expect(r.available.map((e) => e.slug)).toEqual(["baleful-glare"]); // hell-mage (min 7) hidden at L2
  });
  it("resolves player picks from the choices ledger at the anchor level", () => {
    const r = resolvePool(mkClass(7, { 2: { "interdict-boons": ["baleful-glare"] } }), 0, pool, mkRegistry(boons), NO_INDEX);
    expect(r.selected.map((e) => e.slug)).toEqual(["baleful-glare"]);
  });
  it("includes subclass pool_grants at/under level and they do not count", () => {
    const rc = mkClass(20);
    rc.subclass = { slug: "asmodeus", pool_grants: [
      { pool: "interdict-boons", grants: [{ feature: "[[hell-mage]]", at_level: 18 }, { feature: "[[baleful-glare]]", at_level: 99 }] },
    ] } as never;
    const r = resolvePool(rc, 0, pool, mkRegistry(boons), NO_INDEX);
    expect(r.grants.map((e) => e.slug)).toEqual(["hell-mage"]); // at_level 99 excluded
  });
  it("resolves picks/grants by bare slug when the registry slug is source-prefixed", () => {
    // Registry stores the entity under a source-prefixed slug; bareEntitySlug
    // strips everything up to and including the first "_", so "hb_baleful-glare"
    // bares to "baleful-glare". A ledger pick of the BARE slug and a subclass
    // grant via "[[baleful-glare]]" (wikilinkTailSlug → "baleful-glare") must
    // both resolve back to the prefixed registry entity.
    const prefixed = of("baleful-glare", "interdict-boon");
    prefixed.slug = "hb_baleful-glare"; // registry slug only; data.slug stays bare
    const reg = mkRegistry([prefixed, of("hell-mage", "interdict-boon", 7)]);

    // Pick stored under the bare slug resolves to the prefixed entity.
    const picked = resolvePool(mkClass(7, { 2: { "interdict-boons": ["baleful-glare"] } }), 0, pool, reg, NO_INDEX);
    expect(picked.selected.map((e) => e.slug)).toEqual(["hb_baleful-glare"]);

    // Subclass grant via wikilink resolves to the same prefixed entity.
    const rc = mkClass(20);
    rc.subclass = { slug: "asmodeus", pool_grants: [
      { pool: "interdict-boons", grants: [{ feature: "[[baleful-glare]]", at_level: 1 }] },
    ] } as never;
    const granted = resolvePool(rc, 0, pool, reg, NO_INDEX);
    expect(granted.grants.map((e) => e.slug)).toEqual(["hb_baleful-glare"]);
  });
});

describe("pool_grants — class + subclass merge", () => {
  it("resolves a class-declared grant (not only subclass)", () => {
    const rc = mkClass(20);
    rc.entity = { ...rc.entity, pool_grants: [
      { pool: "interdict-boons", grants: [{ feature: "[[hell-mage]]", at_level: 1 }] },
    ] } as never;
    const r = resolvePool(rc, 0, pool, mkRegistry(boons), NO_INDEX);
    expect(r.grants.map((e) => e.slug)).toContain("hell-mage");
  });

  it("dedupes a feature granted by both class and subclass", () => {
    const rc = mkClass(20);
    rc.entity = { ...rc.entity, pool_grants: [
      { pool: "interdict-boons", grants: [{ feature: "[[hell-mage]]", at_level: 1 }] },
    ] } as never;
    rc.subclass = { slug: "asmodeus", pool_grants: [
      { pool: "interdict-boons", grants: [{ feature: "[[hell-mage]]", at_level: 1 }] },
    ] } as never;
    const r = resolvePool(rc, 0, pool, mkRegistry(boons), NO_INDEX);
    expect(r.grants.filter((e) => e.slug === "hell-mage")).toHaveLength(1);
  });

  it("drops a selected feature that is also granted (granted wins, no pick consumed)", () => {
    const rc = mkClass(20, { 2: { "interdict-boons": ["hell-mage"] } });
    rc.entity = { ...rc.entity, pool_grants: [
      { pool: "interdict-boons", grants: [{ feature: "[[hell-mage]]", at_level: 1 }] },
    ] } as never;
    const r = resolvePool(rc, 0, pool, mkRegistry(boons), NO_INDEX);
    expect(r.grants.map((e) => e.slug)).toContain("hell-mage");
    expect(r.selected.map((e) => e.slug)).not.toContain("hell-mage");
  });
});

describe("resolveAllPools", () => {
  // classB's owner + boon, so its pool resolves against a real available_to match.
  function rogueBoon(slug: string) {
    const e = of(slug, "ki-art");
    e.data.available_to = ["[[rogue]]"];
    return e;
  }

  it("dedupes a pool declared by both class and subclass, and tags each class's pools with its classIndex", () => {
    const interdictPool = {
      id: "interdict-boons", label: "Interdict Boons",
      source: { entity_type: "optional-feature" as const, where: { feature_type: "interdict-boon", available_to: "self" as const } },
      count: { column: "Interdict Boons" },
    };
    const kiPool = {
      id: "ki-arts", label: "Ki Arts",
      source: { entity_type: "optional-feature" as const, where: { feature_type: "ki-art", available_to: "self" as const } },
      count: { column: "Ki Arts" },
    };

    // classA (index 0): class entity AND subclass both declare the SAME pool id → dedupe to one.
    const classA: ResolvedClass = {
      entity: {
        slug: "reaver", name: "Reaver",
        table: { 2: { columns: { "Interdict Boons": 1 }, prof_bonus: 2, feature_ids: [] } },
        selection_pools: [interdictPool],
      } as never,
      level: 7,
      subclass: { slug: "asmodeus", selection_pools: [interdictPool] } as never,
      choices: {} as never,
    };

    // classB (index 1): declares its own, different pool.
    const classB: ResolvedClass = {
      entity: {
        slug: "rogue", name: "Rogue",
        table: { 3: { columns: { "Ki Arts": 1 }, prof_bonus: 2, feature_ids: [] } },
        selection_pools: [kiPool],
      } as never,
      level: 7,
      subclass: null,
      choices: {} as never,
    };

    const rc = { classes: [classA, classB] } as unknown as ResolvedCharacter;
    const reg = mkRegistry([...boons, rogueBoon("flurry")]);

    const pools = resolveAllPools(rc, reg, NO_INDEX);

    // One interdict-boons (deduped across class+subclass) + one ki-arts = 2 total.
    expect(pools.length).toBe(2);
    expect(pools.filter((p) => p.id === "interdict-boons").length).toBe(1);

    const interdict = pools.find((p) => p.id === "interdict-boons")!;
    const ki = pools.find((p) => p.id === "ki-arts")!;
    expect(interdict.classIndex).toBe(0);
    expect(ki.classIndex).toBe(1);
  });
});

describe("resolvePool · layout and the OWNER-AWARE resource (R4-G4 §4.2.3, Gate 0 B1)", () => {
  const maneuver = (slug: string, resource: string, hint = "dice-pool") => ({
    slug, name: slug, type: "optional-feature",
    data: { slug, name: slug, edition: "2024", source: "hb", feature_type: "maneuver", description: "", effects: [],
      available_to: ["[[reaver]]"], prerequisites: [], rendering_hint: hint, consumes: { resource, amount: 1 } },
  });
  const bmPool = { id: "maneuvers", label: "Maneuvers",
    source: { entity_type: "optional-feature" as const, where: { feature_type: "maneuver", available_to: "self" as const } },
    count: { column: "Interdict Boons" } };
  // The shipped shape: the 13-book install resolves BOTH editions' maneuvers into one pool, 23 voting the 2014 id
  // and 20 the 2024 id. A 2024 owner OWNS only the 2024 id.
  const members = [
    ...Array.from({ length: 23 }, (_, i) => maneuver(`m14-${i}`, "fighter:superiority-dice")),
    ...Array.from({ length: 20 }, (_, i) => maneuver(`m24-${i}`, "fighter-2024:superiority-dice")),
  ];
  const owned2024 = new Map([["fighter-2024:superiority-dice", { id: "fighter-2024:superiority-dice" } as never]]);
  it("RED FIRST: the majority AMONG THE OWNED ids wins, not the plain majority", () => {
    const r = resolvePool(mkClass(7), 0, bmPool, mkRegistry(members as never), owned2024);
    expect(r.resource).toBe("fighter-2024:superiority-dice");
  });
  it("derives the layout from the members' hints", () => {
    const r = resolvePool(mkClass(7), 0, bmPool, mkRegistry(members as never), owned2024);
    expect(r.layout).toBe("dice-pool");
  });
  it("no owned candidate → no resource (the head widget stays off); no mapped hint → no layout", () => {
    const r = resolvePool(mkClass(7), 0, bmPool, mkRegistry(members as never), new Map());
    expect(r.resource).toBeUndefined();
    const r2 = resolvePool(mkClass(7), 0, pool, mkRegistry(boons), new Map());
    expect(r2.layout).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// R4-G5 §9 · cross-edition twins. The fixtures below are NEW and self-contained:
// every case ABOVE keeps the owner `reaver`, whose slug has no `_` prefix, so its
// single-member bare-slug groups never reach the collapse and its expectations are
// byte-unchanged. The G4 §4.3 fixture (43 maneuvers, 43 DISTINCT bare slugs) is the
// named CONTROL: a bare-slug collapse cannot move it.
// ---------------------------------------------------------------------------

/** A pool member under an explicit compendium PREFIX. `bareEntitySlug` strips
 *  `<prefix>_<type>_<name>` to the name, so both twins bare to the same slug while their
 *  full slugs and their `compendium` differ. */
function twin(prefix: string, bare: string, name: string, compendium: string, levelMin?: number) {
  const slug = `${prefix}_optional-feature_${bare}`;
  return {
    slug, name, type: "optional-feature", compendium,
    data: {
      slug, name, edition: "2014", source: "hb",
      feature_type: "interdict-boon", description: "", effects: [],
      available_to: ["[[reaver]]"],
      prerequisites: levelMin ? [{ kind: "level", min: levelMin }] : [],
    },
  };
}

function mkTwinRegistry(entities: ReturnType<typeof twin>[]): PoolRegistry {
  return {
    search: (_q, type) => (type === "optional-feature" ? entities : []) as never,
    getByTypeAndSlug: (type, slug) =>
      (type === "optional-feature" ? entities.find((e) => e.slug === slug) : undefined) as never,
  };
}

/** The same Reaver as above, but under the `phb` compendium prefix, so the owner-prefix
 *  preference has something to prefer. `bareEntitySlug("phb_class_reaver")` is still
 *  "reaver", so the members' `available_to: ["[[reaver]]"]` still matches. */
function mkPrefixedClass(level: number, choices: Record<number, Record<string, unknown>> = {}) {
  return {
    entity: {
      slug: "phb_class_reaver", name: "Reaver",
      table: { 2: { columns: { "Interdict Boons": 1 }, prof_bonus: 2, feature_ids: [] },
               7: { columns: { "Interdict Boons": 3 }, prof_bonus: 3, feature_ids: [] } },
    } as never,
    level, subclass: null, choices: choices as never,
  } as ResolvedClass;
}

// Names TIE, so the name-then-slug order is decided by the SLUG: "hb_..." sorts BEFORE
// "phb_...". The owner-prefixed twin therefore sorts LAST, which is what makes first-wins
// and the owner preference DISAGREE (spec §9.3).
const TWIN_MEMBERS = [
  twin("hb", "twin-boon", "Twin Boon", "Homebrew"),
  twin("phb", "twin-boon", "Twin Boon", "PHB"),
];
const HB_TWIN = "hb_optional-feature_twin-boon";
const PHB_TWIN = "phb_optional-feature_twin-boon";

/** MODULE-scope, on `decision-bybare-determinism.test.ts`'s shipped idiom. It silences `console.warn` for the
 *  whole FILE, which is harmless here: no case above this line emits one. */
const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

describe("resolvePool · the cross-edition collapse (R4-G5 §9.2.2)", () => {
  // MODULE-scope spy plus `mockClear`, which is `decision-bybare-determinism.test.ts`'s shipped idiom: a
  // `let warnSpy: ReturnType<typeof vi.spyOn>` does NOT typecheck cleanly (vi.spyOn is generic over its target),
  // and `warnOnce`'s `seen` Set is module-global, so the reset must be per-test either way.
  beforeEach(() => { __resetWarnOnceForTests(); warnSpy.mockClear(); });

  it("RED FIRST: two members sharing a bare slug collapse to ONE candidate", () => {
    const r = resolvePool(mkPrefixedClass(7), 0, pool, mkTwinRegistry(TWIN_MEMBERS), NO_INDEX);
    expect(r.available.map((e) => e.slug)).toEqual([PHB_TWIN]);          // §13 row 31
  });

  it("RED FIRST: the SURVIVOR is the owner-prefixed twin, though its twin sorts first", () => {
    const r = resolvePool(mkPrefixedClass(7), 0, pool, mkTwinRegistry(TWIN_MEMBERS), NO_INDEX);
    expect(r.available[0].slug).toBe(PHB_TWIN);                          // §13 row 32
    expect(warnSpy).not.toHaveBeenCalled();                              // a same-prefix survivor is silent
  });

  it("RED FIRST: with NO owner-prefixed member the name-then-slug FIRST survives, with one warning", () => {
    // Registered [aaa(name "Zulu Tie"), zzz(name "Alpha Tie")]: the registration order and the NAME order
    // are opposite, so only the explicit sort can pick "Alpha Tie".
    const members = [
      twin("aaa", "tie-boon", "Zulu Tie", "A Book"),
      twin("zzz", "tie-boon", "Alpha Tie", "Z Book"),
    ];
    const r = resolvePool(mkPrefixedClass(7), 0, pool, mkTwinRegistry(members), NO_INDEX);
    expect(r.available.map((e) => e.slug)).toEqual(["zzz_optional-feature_tie-boon"]);   // §13 row 33
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(String(warnSpy.mock.calls[0][0])).toContain("tie-boon");
  });

  it("RED FIRST: the entry carries the RegisteredEntity's compendium", () => {
    const r = resolvePool(mkPrefixedClass(7), 0, pool, mkTwinRegistry(TWIN_MEMBERS), NO_INDEX);
    expect(r.available[0].compendium).toBe("PHB");                       // §13 row 36
  });
});

describe("resolvePool · the survival guard, the dedupe and strandedPicks (R4-G5 §9.2.3, §3.2.3)", () => {
  beforeEach(() => { __resetWarnOnceForTests(); });

  it("RED FIRST: a stored twin whose own prerequisite hides it resolves to its SURVIVOR, not off-list", () => {
    // hb requires level 9 and is filtered out at level 7; phb requires 2 and survives. The stored FULL slug is
    // the hidden one, so only the bare-slug second index can answer it.
    const members = [
      twin("hb", "gated-boon", "Gated Boon", "Homebrew", 9),
      twin("phb", "gated-boon", "Gated Boon", "PHB", 2),
    ];
    const rc = mkPrefixedClass(7, { 2: { "interdict-boons": ["hb_optional-feature_gated-boon"] } });
    const r = resolvePool(rc, 0, pool, mkTwinRegistry(members), NO_INDEX);
    expect(r.selected.map((e) => e.slug)).toEqual(["phb_optional-feature_gated-boon"]);   // §13 row 34
    expect(strandedPicks(r)).toEqual([]);                                // honoured, therefore NOT stranded
  });

  it("RED FIRST: two stored twins consume ONE pick", () => {
    const rc = mkPrefixedClass(7, { 2: { "interdict-boons": [HB_TWIN, PHB_TWIN] } });
    const r = resolvePool(rc, 0, pool, mkTwinRegistry(TWIN_MEMBERS), NO_INDEX);
    expect(r.selected.map((e) => e.slug)).toEqual([PHB_TWIN]);           // §13 row 35
  });

  it("a stored pick with NO surviving twin keeps its full-scan entity and is reported by strandedPicks", () => {
    const members = [twin("hb", "locked-boon", "Locked Boon", "Homebrew", 11), ...TWIN_MEMBERS];
    const rc = mkPrefixedClass(7, { 2: { "interdict-boons": ["hb_optional-feature_locked-boon"] } });
    const r = resolvePool(rc, 0, pool, mkTwinRegistry(members), NO_INDEX);
    expect(strandedPicks(r).map((e) => e.slug)).toEqual(["hb_optional-feature_locked-boon"]);
    expect(r.selected.map((e) => e.slug)).toEqual(["hb_optional-feature_locked-boon"]);
    expect(r.selected[0].entity.name).toBe("Locked Boon");               // the entity travels with it
  });

  it("a stored slug that answers to NO registered entity is dropped, as it always was", () => {
    const rc = mkPrefixedClass(7, { 2: { "interdict-boons": ["nothing_optional-feature_ghost"] } });
    const r = resolvePool(rc, 0, pool, mkTwinRegistry(TWIN_MEMBERS), NO_INDEX);
    expect(r.selected).toEqual([]);
    expect(strandedPicks(r)).toEqual([]);
  });
});

/** The count-0 pairing, in its OWN describe beside the collapse's, sharing the module-scope warn spy and repeating
 *  its per-test reset. A PRESENCE assertion (spec §5.2), with NO §13 mutant row, named as such. */
describe("resolvePool · the count-0 pairing warns once (R4-G5 §5.2)", () => {
  beforeEach(() => { __resetWarnOnceForTests(); warnSpy.mockClear(); });

  /** The CROSS-EDITION PAIRING shape: a subclass-style pool whose column name appears in NO row of the
   *  owning class's table. `mkPrefixedClass`'s table carries "Interdict Boons" at levels 2 and 7 and no
   *  "Runes" column at any level. */
  const POOL_NO_COLUMN = { ...pool, id: "orphan-boons", count: { column: "Runes" } };

  it("a declared pool whose count column is absent from EVERY level row warns ONCE and resolves count 0", () => {
    // A presence assertion with NO mutant row (spec §5.2).
    const r = resolvePool(mkPrefixedClass(7), 0, POOL_NO_COLUMN as never, mkTwinRegistry(TWIN_MEMBERS), NO_INDEX);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(String(warnSpy.mock.calls[0][0])).toContain("Runes");
    expect(r.count).toBe(0);
    expect(r.anchorLevel).toBe(1);
  });

  it("a column that is merely NULL AT LEVEL 1 and numeric later does NOT warn (the predicate control)", () => {
    // THE control this rule exists for. At level 1 the owner's table has no row at all, so `count` is 0 and
    // `readTableColumn` at the CURRENT level returns null · yet the column IS carried, at levels 2 and 7.
    // MEASURED 2026-09-07 (spec §5.2 rev 18): this is the shape of 18 of the 22 authored pairings on the 13-book
    // install (23 over the whole converter output): 5 class-declared (PHB 2024 Sorcerer metamagic, PHB 2014
    // Paladin and Ranger fighting-style, PHB 2014 Sorcerer metamagic, PHB 2014 Warlock pact-boon) plus all 13
    // subclass-declared. So a `count === 0` or current-level-null key would warn on shipped low-level
    // characters (Sorcerer 1-2, Paladin 1, Ranger 1, Warlock 1-2 on the five class pools), which is why the
    // predicate is the column being absent from EVERY level row, never a null at the current level.
    const r = resolvePool(mkPrefixedClass(1), 0, pool, mkTwinRegistry(TWIN_MEMBERS), NO_INDEX);
    expect(warnSpy).not.toHaveBeenCalled();
    expect(r.count).toBe(0);
  });

  it("a pool whose column is carried AT the current level warns nothing (the plain control)", () => {
    const r = resolvePool(mkPrefixedClass(7), 0, pool, mkTwinRegistry(TWIN_MEMBERS), NO_INDEX);
    expect(warnSpy).not.toHaveBeenCalled();
    expect(r.count).toBe(3);
  });
});
