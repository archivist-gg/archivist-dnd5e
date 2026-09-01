import { describe, it, expect, vi } from "vitest";
import { buildDecisionLedger } from "../src/pc/pc.decision-engine";
import type { DecisionContext } from "../src/pc/pc.decision-engine";
import { buildMockRegistry } from "./mock-entity-registry";
import type { ResolvedCharacter } from "../src/pc/pc.types";
import type { RegisteredEntity } from "@archivist-gg/core";

// ---------------------------------------------------------------------------
// R4-G2 Task 5 · spec §8.4 / §11 floor 8 · `byBare` determinism + visibility.
//
// `enumerateOptions` is NOT exported (Gate 2 I-1), so every case here drives it
// through `buildDecisionLedger`. The registries are REAL core `EntityRegistry`
// instances built by `buildMockRegistry` (Gate 2 I-5) — never an ad-hoc `search`
// stub, whose repo idiom ignores `limit` and search semantics.
//
// ⚠️ WARN ACCOUNTING (Gate 2 I-2): `warnedAmbiguousBare` is MODULE-LEVEL and
// vitest never resets modules in this repo, so the dedup set persists for the
// whole FILE. Every case therefore uses a DISTINCT bare slug and the spy is
// asserted CUMULATIVELY, in declaration order. Do not reorder these tests
// without re-deriving the running totals in each assertion.
// ---------------------------------------------------------------------------

const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

/** Two (or more) entities sharing a NAME and a bare slug, differing only in the
 *  compendium prefix — the exact shape that made seeding order-dependent. */
function dup(prefixes: string[], bare: string, name: string) {
  return prefixes.map((p) => ({
    slug: `${p}_${bare}`,
    entityType: "feat",
    name,
    data: { slug: `${p}_${bare}`, name, description: "d", effects: [] },
  }));
}

function ledgerOptions(
  entries: ReturnType<typeof dup>,
  from: string[],
  isEntityVisible?: (e: RegisteredEntity) => boolean,
) {
  const registry = buildMockRegistry(entries);
  const ctx: DecisionContext = isEntityVisible ? { registry, isEntityVisible } : { registry };
  const entity = {
    slug: "srd-2024_fighter", name: "Fighter",
    choices: [{ kind: "select-entity", id: "pick", label: "Pick", count: 1, entity_type: "feat", from }],
    features_by_level: {}, starting_equipment: [],
  };
  const state = {
    hp: { current: 1, max: 1, temp: 0 }, hit_dice: {}, spell_slots: {}, concentration: null,
    conditions: [], exhaustion: 0, inspiration: 0, feature_uses: {},
  };
  const definition = {
    name: "T", edition: "2024", race: null, subrace: null, background: null,
    class: [{ name: "[[fighter]]", level: 1, subclass: null, choices: {} }],
    abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    ability_method: "manual", skills: { proficient: [], expertise: [] },
    spells: { known: [], overrides: [] }, equipment: [], overrides: {}, origin_choices: {}, state,
  } as unknown as ResolvedCharacter["definition"];
  const cls = { entity, level: 1, subclass: null, choices: {} } as unknown as ResolvedCharacter["classes"][number];
  const resolved = {
    definition, race: null, classes: [cls], background: null, feats: [],
    totalLevel: 1, features: [], spells: [], pools: [], state,
  } as unknown as ResolvedCharacter;
  const ledger = buildDecisionLedger(resolved, ctx);
  const item = ledger.classes[0].levels.flatMap((l) => l.items).find((i) => i.key === "pick")!;
  return item.options;
}

describe("byBare seeding — deterministic across insertion order", () => {
  it("RED-FIRST: both insertion orders pick the SAME winner (name then slug total order)", () => {
    // The two entities share a name, so `localeCompare` on name TIES; core's own
    // search sort is stable, so pre-fix the pool order is the INSERTION order and
    // the last-wins `byBare.set` loop returned a different entity per order.
    const a = ledgerOptions(dup(["aaa", "zzz"], "dup-alpha", "Duplicate Alpha"), ["dup-alpha"]);
    const b = ledgerOptions(dup(["zzz", "aaa"], "dup-alpha", "Duplicate Alpha"), ["dup-alpha"]);
    expect(a[0].value).toBe("aaa_dup-alpha");
    expect(b[0].value).toBe("aaa_dup-alpha");
    expect(a[0].missing).toBeUndefined();
  });

  it("RED-FIRST: warns exactly ONCE for an ambiguous bare slug (cumulative total: 1)", () => {
    // Two ledger builds above collided on "dup-alpha"; the module-level dedup set
    // means the SECOND build is silent. Pre-fix there was no warning at all.
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const msg = String(warnSpy.mock.calls[0][0]);
    expect(msg).toContain('"dup-alpha"');
    expect(msg).toContain("feat");
    expect(msg).toContain("aaa_dup-alpha");
  });

  it("RED-FIRST (warn total) + CONTROL (resolution): an ambiguity of THREE collapses to one warn and the lowest slug (cumulative total: 2)", () => {
    // Split note: pre-fix the resolution assertion PASSED by coincidence — last-wins
    // over the insertion order [mmm, zzz, aaa] also ended on "aaa_dup-gamma". Only the
    // warn total was red. Its kill power is against the FIX (drop the slug tiebreak and
    // a reordered fixture diverges), not against the pre-fix tree.
    const opts = ledgerOptions(
      dup(["mmm", "zzz", "aaa"], "dup-gamma", "Duplicate Gamma"),
      ["dup-gamma"],
    );
    expect(opts[0].value).toBe("aaa_dup-gamma");
    expect(warnSpy).toHaveBeenCalledTimes(2);
  });

  it("RED-FIRST (warn total) + CONTROL (resolution): with `isEntityVisible`, a VISIBLE copy beats a hidden one (cumulative total: 3)", () => {
    // Split note: pre-fix the resolution assertion PASSED by coincidence — last-wins
    // over [aaa, zzz] also ended on "zzz_dup-beta", the same value for a different
    // reason. Only the warn total was red. The case BELOW is what makes this one
    // non-vacuous: without the predicate the same fixture yields "aaa_dup-beta".
    // Visible-first seeding: "zzz_dup-beta" would lose the slug tiebreak, but the
    // hidden "aaa_dup-beta" is seeded only in the second pass, so the visible one
    // is already in the map and set-if-absent keeps it.
    const opts = ledgerOptions(
      dup(["aaa", "zzz"], "dup-beta", "Duplicate Beta"),
      ["dup-beta"],
      (e) => e.slug !== "aaa_dup-beta",
    );
    expect(opts[0].value).toBe("zzz_dup-beta");
    expect(warnSpy).toHaveBeenCalledTimes(3);
  });

  it("RED-FIRST: the predicate is load-bearing — WITHOUT it the same fixture picks the other copy (cumulative total: 3)", () => {
    // Same bare slug as the case above, so the warn is deduped: the count does not
    // move. If this returned "zzz_dup-beta" too, the visibility test above would be
    // vacuous.
    const opts = ledgerOptions(dup(["aaa", "zzz"], "dup-beta", "Duplicate Beta"), ["dup-beta"]);
    expect(opts[0].value).toBe("aaa_dup-beta");
    expect(warnSpy).toHaveBeenCalledTimes(3);
  });

  it("RED-FIRST (warn total) + CONTROL (resolution): an UNambiguous bare slug adds NO warn (cumulative total: 3)", () => {
    const opts = ledgerOptions(dup(["only"], "dup-delta", "Duplicate Delta"), ["dup-delta"]);
    expect(opts[0].value).toBe("only_dup-delta");
    expect(warnSpy).toHaveBeenCalledTimes(3);
  });

  it("RED-FIRST (warn total) + CONTROL (resolution): an unregistered `from` slug stays visible-but-inert and adds NO warn (cumulative total: 3)", () => {
    const opts = ledgerOptions(dup(["only"], "dup-delta", "Duplicate Delta"), ["no-such-feat"]);
    expect(opts[0]).toMatchObject({ value: "no-such-feat", label: "no-such-feat", missing: true });
    expect(warnSpy).toHaveBeenCalledTimes(3);
  });
});
