import { describe, it, expect } from "vitest";
import { resolvePool, resolveAllPools, type PoolRegistry } from "../src/pc/pc.pools";
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
