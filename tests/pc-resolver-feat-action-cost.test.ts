import { describe, it, expect } from "vitest";
import { collectResolvedFeatures } from "../src/pc/pc.resolver";
import type { FeatEntity } from "../src/feat/feat.types";

/**
 * R4-G3a §10.2.3 · a feat's ENTITY-level `action_cost` reaches the resolved feature.
 *
 * Two branches carry it. The SYNTHESIZED branch (a feat with no bundled `features[]`, the only
 * live carrier, SRD 2024 Boon of the Night Spirit) builds its feature from a fixed key set that
 * dropped `action_cost` entirely. The BUNDLED branch pushes `features[0]` with the entity effects
 * folded on; the copy there is now UNCONDITIONAL, because registry entities are shared across every
 * character and an in-place write would leak (the resolver's own comment says they must not be
 * mutated). Declared wins on both: `f.action ?? feat.action_cost`, never an overwriting spread.
 */
const feat = (o: Partial<FeatEntity>): FeatEntity => ({
  slug: "x", name: "X", edition: "2024", source: "t", category: "general",
  description: "", prerequisites: [], benefits: [], effects: [], grants_asi: null,
  repeatable: false, choices: [], ...o,
});

describe("feat action_cost → the resolved feature's action (§10.2.3)", () => {
  it("the SYNTHESIZED branch carries action_cost onto the feature (Boon of the Night Spirit's shape)", () => {
    const rf = collectResolvedFeatures(null, [], null, [feat({
      slug: "srd-2024_feat_boon-of-the-night-spirit",
      name: "Boon of the Night Spirit",
      action_cost: "bonus-action",
      effects: [],
    })]).find((r) => r.source.kind === "feat")!;
    expect(rf.feature.name).toBe("Boon of the Night Spirit");
    expect(rf.feature.action).toBe("bonus-action");
  });

  it("a synthesized feature WITHOUT action_cost gains no action", () => {
    const rf = collectResolvedFeatures(null, [], null, [feat({ slug: "plain", name: "Plain" })])
      .find((r) => r.source.kind === "feat")!;
    expect(rf.feature.action).toBeUndefined();
  });

  it("the BUNDLED branch lets the feature's OWN action win, and leaves the registry entity untouched", () => {
    const entity = {
      ...feat({ slug: "declared", name: "Declared", action_cost: "bonus-action" }),
      features: [{ name: "F", description: "d", action: "reaction" }],
    } as unknown as FeatEntity;
    const before = structuredClone((entity as unknown as { features: unknown[] }).features[0]);

    const rf = collectResolvedFeatures(null, [], null, [entity]).find((r) => r.source.kind === "feat")!;
    expect(rf.feature.action).toBe("reaction");
    // Registry identity: the SOURCE entity's feature object is unchanged by resolve. `toEqual`, not
    // `toStrictEqual`: the resolved COPY writes an explicit `action: undefined` when both are absent,
    // and this assertion is about the SOURCE, which must carry exactly the keys it was authored with.
    expect((entity as unknown as { features: unknown[] }).features[0]).toEqual(before);
  });

  // The `entityEffects` concat arm of the same copy: it had ZERO coverage in either repo before this
  // task widened the copy around it, so a regression there would have been silent. Values asserted,
  // never presence.
  it("entity-level feat effects ride the FIRST bundled feature, and the entity keeps none of it", () => {
    const effect = { kind: "resistance", damage_type: "fire" };
    const entity = {
      ...feat({ slug: "resistant", name: "Resistant" }),
      effects: [effect],
      features: [{ name: "F", description: "d" }],
    } as unknown as FeatEntity;
    const before = structuredClone((entity as unknown as { features: unknown[] }).features[0]);

    const rf = collectResolvedFeatures(null, [], null, [entity]).find((r) => r.source.kind === "feat")!;
    expect(rf.feature.effects).toEqual([effect]);
    // The source feature must not have gained an `effects` key (nor an `action` one).
    expect((entity as unknown as { features: unknown[] }).features[0]).toEqual(before);
    expect(before).toEqual({ name: "F", description: "d" });
  });

  it("CONCATENATES rather than overwrites: the feature's own effects come first, the entity's after", () => {
    const own = { kind: "resistance", damage_type: "cold" };
    const entityEffect = { kind: "resistance", damage_type: "fire" };
    const entity = {
      ...feat({ slug: "both-effects", name: "Both Effects" }),
      effects: [entityEffect],
      features: [{ name: "F", description: "d", effects: [own] }, { name: "G", description: "d2" }],
    } as unknown as FeatEntity;
    const before = structuredClone((entity as unknown as { features: unknown[] }).features);

    const resolved = collectResolvedFeatures(null, [], null, [entity]).filter((r) => r.source.kind === "feat");
    expect(resolved.map((r) => r.feature.name)).toEqual(["F", "G"]);
    expect(resolved[0].feature.effects).toEqual([own, entityEffect]);   // order is the contract
    expect(resolved[1].feature.effects).toBeUndefined();                // only the FIRST one carries
    expect((entity as unknown as { features: unknown[] }).features).toEqual(before);
  });

  it("a bundled feature with NO action of its own takes the feat's action_cost, still without mutating the entity", () => {
    const entity = {
      ...feat({ slug: "bare", name: "Bare", action_cost: "bonus-action" }),
      features: [{ name: "F", description: "d" }],
    } as unknown as FeatEntity;
    const before = structuredClone((entity as unknown as { features: unknown[] }).features[0]);

    const rf = collectResolvedFeatures(null, [], null, [entity]).find((r) => r.source.kind === "feat")!;
    expect(rf.feature.action).toBe("bonus-action");
    // THE shared-entity guard (§14 row 22): an in-place `f.action = …` would leave this source
    // feature carrying an `action` key it never declared, for every character that ever took the feat.
    expect((entity as unknown as { features: unknown[] }).features[0]).toEqual(before);
  });
});
