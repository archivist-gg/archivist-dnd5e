import { describe, it, expect } from "vitest";
import { featEntitySchema } from "../src/feat/feat.schema";
import { optionalFeatureEntitySchema } from "../src/optional-feature/optional-feature.schema";

const feat = (prerequisites: unknown[]) => ({ slug: "x", name: "X", edition: "2014", source: "EFA", category: "general",
  description: "d", prerequisites, benefits: [], effects: [], grants_asi: null, repeatable: false, choices: [] });
const opt = (prerequisites: unknown[]) => ({ slug: "x", name: "X", edition: "2024", source: "XPHB", feature_type: "eldritch_invocation",
  description: "d", prerequisites, available_to: ["[[Player's Handbook (2024)/Classes/Warlock]]"], effects: [] });

describe("feat prerequisites · the seven converter arms (R4-G1a D4, G8)", () => {
  it("accepts every emitted arm with its emitted slug shape", () => {
    const p = featEntitySchema.parse(feat([
      { kind: "feat", slug: "mark-of-shadow" }, { kind: "campaign", slug: "eberron" },
      { kind: "exclusive-feat-category", slug: "D" }, { kind: "feature", slug: "fighting-style" },
      { kind: "other", detail: "Level 4+, Dragonmark of Shadow" }, { kind: "feat-category", slug: "D" },
      { kind: "background", slug: "acolyte" },
    ]));
    expect(p.prerequisites).toHaveLength(7);
  });
  it("still refuses an unknown kind", () => {
    expect(featEntitySchema.safeParse(feat([{ kind: "alignment", slug: "lawful" }])).success).toBe(false);
  });
});

describe("optional-feature prerequisites (R4-G1a D4, G8)", () => {
  it("keeps the level arm's named refs, including visible_stats (Agonizing Blast's shape)", () => {
    const p = optionalFeatureEntitySchema.parse(opt([{ kind: "level", min: 2, class: { name: "Warlock", source: "XPHB", visible_stats: true } }]));
    expect(p.prerequisites[0]).toEqual({ kind: "level", min: 2, class: { name: "Warlock", source: "XPHB", visible_stats: true } });
  });
  it("accepts the subclass named ref", () => {
    expect(optionalFeatureEntitySchema.safeParse(opt([{ kind: "level", min: 3, subclass: { name: "Way of the Four Elements" } }])).success).toBe(true);
  });
  it("accepts optionalfeature and spell-choose", () => {
    const p = optionalFeatureEntitySchema.parse(opt([
      { kind: "optionalfeature", optionalfeature: "[[Player's Handbook (2024)/OptionalFeatures/Pact of the Blade]]" },
      { kind: "spell-choose", choose: "level=0|class=Warlock", entry: "a Warlock Cantrip That Deals Damage", entry_summary: "Warlock Cantrip That Deals Damage" },
    ]));
    expect(p.prerequisites).toHaveLength(2);
  });
});
