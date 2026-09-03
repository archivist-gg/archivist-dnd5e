import { describe, it, expect } from "vitest";
import { collectResolvedFeatures } from "../src/pc/pc.resolver";
import type { RaceEntity } from "../src/race/race.types";
import type { ResolvedClass } from "../src/pc/pc.types";

/**
 * R4-G3a Task 12 · `action_cost` aliased at RESOLVE time, not only in the parser.
 *
 * §10.2.1 put the alias inside `parseRace` (and the class/subclass parsers). Task 11's live run
 * measured the four race carriers still routing to Passive on the sheet, because the plugin never
 * calls those parsers: its registry holds the RAW `yaml.load` of the fence, and the resolver pushes
 * `race.traits` into `resolved.features` verbatim. The feat half already aliased at resolve time
 * (`feat.action_cost` read directly, and the optional-feature grant branch), which is why only the
 * race half failed.
 *
 * Every entity below is therefore built RAW - plain object literals carrying `action_cost` and no
 * `action`, exactly the shape the registry holds - and never passed through `parseRace`, which
 * would alias them before the resolver ever saw them and make these assertions vacuous.
 */

/** A raw race entity: only the keys `collectResolvedFeatures` reads off it. */
function rawRace(traits: unknown[]): RaceEntity {
  return { slug: "test_race_testling", name: "Testling", traits } as unknown as RaceEntity;
}

const raceFeatures = (race: RaceEntity) =>
  collectResolvedFeatures(race, [], null, []).filter((r) => r.source.kind === "race");

describe("race trait action_cost → the resolved feature's action (R4-G3a Task 12)", () => {
  it("a raw trait's action_cost fills the canonical action, and is itself retained", () => {
    const race = rawRace([{ name: "Breath Weapon", description: "d", action_cost: "action" }]);

    const rf = raceFeatures(race).find((r) => r.feature.name === "Breath Weapon")!;
    expect(rf.feature.action).toBe("action");
    // Never deleted: the sheet's fence round-trip and the parser-side alias both keep the declared
    // key, so a resolve that consumed it would diverge from what the file says.
    expect((rf.feature as { action_cost?: string }).action_cost).toBe("action");
    expect(rf.source).toEqual({ kind: "race", slug: "test_race_testling" });
  });

  it("a DECLARED action wins over action_cost", () => {
    const race = rawRace([{ name: "Both Keys", description: "d", action: "reaction", action_cost: "action" }]);

    const rf = raceFeatures(race).find((r) => r.feature.name === "Both Keys")!;
    expect(rf.feature.action).toBe("reaction");
    expect((rf.feature as { action_cost?: string }).action_cost).toBe("action");
  });

  it("the registry entity is never written: the carrier is COPIED, the plain trait is passed through", () => {
    const race = rawRace([
      { name: "Breath Weapon", description: "d", action_cost: "action" },
      { name: "Darkvision", description: "d" },
    ]);
    const traits = race.traits as unknown as Record<string, unknown>[];
    const before = structuredClone(traits[0]);

    const resolved = raceFeatures(race);

    // THE shared-entity guard: registry entities are shared across every character, so an in-place
    // `f.action = f.action_cost` would leave this source trait carrying an `action` key it never
    // declared, for every sheet that ever opened this race.
    expect(traits[0]).toEqual(before);
    expect(before).toEqual({ name: "Breath Weapon", description: "d", action_cost: "action" });
    // And nothing applies to a trait without action_cost, so the SAME object is pushed - no copy,
    // no allocation, and no `action: undefined` key appearing where the file declared none.
    expect(resolved.find((r) => r.feature.name === "Darkvision")!.feature).toBe(traits[1]);
  });

  it("the aliased copy keeps the trait's other keys, including its resources", () => {
    const resources = [
      { id: "dragonborn:breath-weapon", name: "Breath Weapon", max_formula: "1", reset: "short-rest" },
    ];
    const race = rawRace([
      { name: "Breath Weapon", description: "prose", action_cost: "action", id: "breath-weapon", resources },
    ]);

    const rf = raceFeatures(race).find((r) => r.feature.name === "Breath Weapon")!;
    expect(rf.feature.action).toBe("action");
    expect(rf.feature.id).toBe("breath-weapon");
    expect(rf.feature.description).toBe("prose");
    expect(rf.feature.resources).toEqual(resources);
    // A SHALLOW copy: the resources array is the entity's own, as it is on every other push here
    // (read-only downstream). The trackers the race block renders resolve off this same array.
    expect(rf.feature.resources).toBe(resources);
  });

  // Symmetry with the parser-side alias, which covers `features_by_level` for the same reason.
  // Measured 2026-09-02: ZERO shipped class or subclass features carry `action_cost` (the bundle
  // sweep in the plugin's `tests/srd-canonical/bundle-feature-action-cost.test.ts` counts 5, all on
  // races), so this is the guard that a future class-side carrier is not a second silent routing bug.
  it("class and subclass features get the same resolve-time alias", () => {
    const cls = {
      entity: {
        slug: "fighter",
        name: "Fighter",
        features_by_level: { 1: [{ name: "Second Wind", description: "d", action_cost: "bonus-action" }] },
      },
      level: 1,
      subclass: {
        slug: "champion",
        name: "Champion",
        features_by_level: { 1: [{ name: "Sudden Strike", description: "d", action_cost: "bonus-action" }] },
      },
      choices: {},
    } as unknown as ResolvedClass;

    const resolved = collectResolvedFeatures(null, [cls], null, []);
    const classFeature = resolved.find((r) => r.source.kind === "class" && r.feature.name === "Second Wind")!;
    const subclassFeature = resolved.find((r) => r.source.kind === "subclass" && r.feature.name === "Sudden Strike")!;
    expect(classFeature.feature.action).toBe("bonus-action");
    expect(subclassFeature.feature.action).toBe("bonus-action");
    expect((classFeature.feature as { action_cost?: string }).action_cost).toBe("bonus-action");
    expect((subclassFeature.feature as { action_cost?: string }).action_cost).toBe("bonus-action");
  });
});
