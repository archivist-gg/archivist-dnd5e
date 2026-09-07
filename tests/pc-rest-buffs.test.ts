import { describe, it, expect } from "vitest";
import { computeRestPlan } from "../src/pc/pc.rest";
import type { Character, ResolvedCharacter, DerivedStats } from "../src/pc/pc.types";

// R4-G5 §4.4.2 · the rest CLEAR. Builders forked from `tests/pc-rest-either.test.ts` (`feat` / `setup`), which
// writes no `active_buffs` and no `pools`. `duration` is typed `Duration | undefined` on `Feature`, so the
// fixtures cast: a STRING duration and `null` are both shapes the walk must refuse, and `null` is not
// assignable to `Duration | undefined`.

function buffFeature(id: string, name: string, duration: unknown) {
  return { feature: { id, name, activatable: true, duration }, source: { kind: "class", slug: "x", level: 1 } };
}

function setup(activeBuffs: string[] | undefined, features: object[], pools: object[] = []) {
  const character = {
    equipment: [],
    state: {
      hp: { current: 10, max: 10, temp: 0 }, hit_dice: {}, spell_slots: {},
      concentration: null, conditions: [], exhaustion: 0, inspiration: 0,
      feature_uses: {},
      ...(activeBuffs ? { active_buffs: activeBuffs } : {}),
    },
  } as unknown as Character;
  // `classes` is LOAD-BEARING, measured 2026-09-07: `computeRestPlan` derives the resource index, and
  // `resolveResourceIndex`'s pool walk reads `resolved.classes[pool.classIndex]`, so a cast fixture that
  // carries `pools` and no `classes` THROWS ("Cannot read properties of undefined (reading '0')"). The
  // plugin's `withRunePool` builder in `tests/pc-rest.test.ts` supplies the same pair for the same reason.
  const resolved = { totalLevel: 5, features, pools,
    classes: [{ entity: { slug: "fighter" }, level: 5, subclass: { slug: "rune-knight" } }] } as unknown as ResolvedCharacter;

  const derived = { hp: { max: 10 } } as unknown as DerivedStats;
  return { character, resolved, derived };
}

const ids = (plan: { categories: Array<{ id: string }> }) => plan.categories.map((c) => c.id);
const RAGE_ROW = { id: "buff:rage", label: "End Rage", preview: "active → ended" };

describe("computeRestPlan · the rest CLEAR for active buffs (R4-G5 §4.4.2)", () => {
  it("RED FIRST: a 2014-Rage-shaped buff ({1, minute}) is offered at a SHORT rest, and at a LONG one, with its label and preview", () => {
    const { character, resolved, derived } = setup(["rage"], [buffFeature("rage", "Rage", { amount: 1, unit: "minute" })]);
    expect(computeRestPlan(character, resolved, derived, null, "short").categories).toContainEqual(RAGE_ROW);
    expect(computeRestPlan(character, resolved, derived, null, "long").categories).toContainEqual(RAGE_ROW);
  });

  it("a duration-less buff is NOT offered at either rest (`typeof null === \"object\"` is why the guard tests `!d` first; MEASURED 2026-09-07: `duration: null` ships 0 times, the shipped 2024 Barbarian carries NO `duration` key, and the nullable position is the POOL ENTRY, so this fixture casts `null` onto a feature to reach the guard)", () => {
    const { character, resolved, derived } = setup(["rage"], [buffFeature("rage", "Rage", null)]);
    expect(ids(computeRestPlan(character, resolved, derived, null, "short"))).not.toContain("buff:rage");
    expect(ids(computeRestPlan(character, resolved, derived, null, "long"))).not.toContain("buff:rage");
  });

  it("GUARD (not a red-to-green case: green before the walk existed, red only under mutant t6-m23, §13 row 23): a string `duration` (`until-dispelled`, `instantaneous`) is never offered · FIXTURE-ONLY, MEASURED 2026-09-07: neither read position carries a string on either corpus", () => {
    const undis = setup(["ward"], [buffFeature("ward", "Ward", "until-dispelled")]);
    expect(ids(computeRestPlan(undis.character, undis.resolved, undis.derived, null, "long"))).not.toContain("buff:ward");
    const inst = setup(["ward"], [buffFeature("ward", "Ward", "instantaneous")]);
    expect(ids(computeRestPlan(inst.character, inst.resolved, inst.derived, null, "short"))).not.toContain("buff:ward");
  });

  it("a POOL pick's own structured duration ends too, keyed on the RESOLVED entry slug (a LIVE shipped path, MEASURED 2026-09-07: 2 of the 226 converted optional features carry a structured `duration`, Xanathar's Ghostly Gaze and Grasping Arrow, both `{1, minute}` and `activatable: true`; 0 of the 7 bundle ones do)", () => {
    const pool = {
      id: "runes", label: "Runes", classIndex: 0, count: 2, anchorLevel: 3, available: [], grants: [],
      selected: [{ slug: "tce_frost-rune", entity: { slug: "tce_frost-rune", name: "Frost Rune", duration: { amount: 10, unit: "minute" } } }],
    };
    const { character, resolved, derived } = setup(["tce_frost-rune"], [], [pool]);
    expect(computeRestPlan(character, resolved, derived, null, "short").categories)
      .toContainEqual({ id: "buff:tce_frost-rune", label: "End Frost Rune", preview: "active → ended" });
  });

  it("an unmatched buff id emits nothing, and a character with NO active_buffs gets the shipped plan (the byte-identical control)", () => {
    const ghost = setup(["ghost"], [buffFeature("rage", "Rage", { amount: 1, unit: "minute" })]);
    expect(ids(computeRestPlan(ghost.character, ghost.resolved, ghost.derived, null, "long"))).not.toContain("buff:ghost");
    const none = setup(undefined, [buffFeature("rage", "Rage", { amount: 1, unit: "minute" })]);
    expect(ids(computeRestPlan(none.character, none.resolved, none.derived, null, "long"))).toEqual([]);
    expect(ids(computeRestPlan(none.character, none.resolved, none.derived, null, "short"))).toEqual([]);
  });
});
